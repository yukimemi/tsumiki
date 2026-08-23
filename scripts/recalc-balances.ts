/**
 * Rebuilds the balances cache for one household from the ledger, which is the
 * only source of truth for coins (docs/DESIGN.md §1).
 *
 * Run: pnpm exec tsx scripts/recalc-balances.ts <householdId> [--dry-run]
 *
 * Uses the Firestore REST API with a gcloud access token, the same transport as
 * scripts/deploy-rules.ts, so there is nothing to install and no service
 * account key to keep. Needs FIREBASE_PROJECT_ID (or
 * VITE_FIREBASE_PROJECT_ID) from the environment or .env. Set
 * FIRESTORE_EMULATOR_HOST to rehearse against the emulator instead.
 *
 * `coins` is the sum of every delta. `earned` is the sum of the positive
 * `task` and `bonus` deltas only: it is a lifetime score and must not fall
 * when coins are spent on a payout or clawed back by an adjustment.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { balanceId } from "../src/lib/ids.ts";

let dotenv: Record<string, string> | undefined;

/** tsx does not read .env, but a checkout that can run `vite dev` has one. */
function fromDotenv(key: string): string | undefined {
  if (!dotenv) {
    dotenv = {};
    try {
      for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
        const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (match) dotenv[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      // No .env: environment variables are the only source.
    }
  }
  return dotenv[key];
}

function required(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key] ?? fromDotenv(key);
    if (value) return value;
  }
  throw new Error(`Missing ${keys.join(" or ")} — see .env.example`);
}

const householdId = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!householdId || householdId.startsWith("--")) {
  console.error(
    "usage: pnpm exec tsx scripts/recalc-balances.ts <householdId> [--dry-run]",
  );
  process.exit(2);
}

const PROJECT_ID = required("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID");

// Honour the standard emulator variable so a repair can be rehearsed against
// `firebase emulators:start` before it touches production data.
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const ROOT = `${
  emulatorHost ? `http://${emulatorHost}` : "https://firestore.googleapis.com"
}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const accessToken = emulatorHost
  ? "owner"
  : execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

const headers = {
  Authorization: `Bearer ${accessToken}`,
  "X-Goog-User-Project": PROJECT_ID,
  "Content-Type": "application/json",
};

type FsValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
};
type FsDocument = { name: string; fields?: Record<string, FsValue> };

function str(fields: Record<string, FsValue> | undefined, key: string): string {
  return fields?.[key]?.stringValue ?? "";
}

function num(fields: Record<string, FsValue> | undefined, key: string): number {
  const value = fields?.[key];
  if (!value) return 0;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  return value.doubleValue ?? 0;
}

/** Every document of `collection` whose householdId matches, page by page. */
async function queryByHousehold(collection: string): Promise<FsDocument[]> {
  const found: FsDocument[] = [];
  let cursor: string | undefined;

  for (;;) {
    const structuredQuery = {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: "householdId" },
          op: "EQUAL",
          value: { stringValue: householdId },
        },
      },
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: 500,
      ...(cursor
        ? { startAt: { values: [{ referenceValue: cursor }], before: false } }
        : {}),
    };

    const res = await fetch(`${ROOT}:runQuery`, {
      method: "POST",
      headers,
      body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok)
      throw new Error(`runQuery ${collection}: ${res.status} ${await res.text()}`);

    const rows = (await res.json()) as { document?: FsDocument }[];
    const page = rows.map((row) => row.document).filter((d): d is FsDocument => !!d);
    found.push(...page);
    if (page.length < 500) return found;
    cursor = page[page.length - 1].name;
  }
}

type Computed = {
  memberId: string;
  coins: number;
  earned: number;
  wasCoins: number;
  wasEarned: number;
  hasBalance: boolean;
};

function printTable(header: string[], rows: string[][]): void {
  const widths = header.map((cell, i) =>
    Math.max(cell.length, ...rows.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(row));
}

async function main() {
  const ledger = await queryByHousehold("ledger");
  console.log(`ledger rows: ${ledger.length}`);

  const totals = new Map<string, { coins: number; earned: number }>();
  for (const doc of ledger) {
    const memberId = str(doc.fields, "memberId");
    if (!memberId) {
      console.warn(`skipped (no memberId): ${doc.name}`);
      continue;
    }
    const delta = num(doc.fields, "delta");
    const reason = str(doc.fields, "reason");
    const total = totals.get(memberId) ?? { coins: 0, earned: 0 };
    total.coins += delta;
    if (delta > 0 && (reason === "task" || reason === "bonus")) {
      total.earned += delta;
    }
    totals.set(memberId, total);
  }

  const existing = await queryByHousehold("balances");
  const byMember = new Map<string, FsDocument>();
  for (const doc of existing) byMember.set(str(doc.fields, "memberId"), doc);

  const computed: Computed[] = [];
  for (const memberId of new Set([...totals.keys(), ...byMember.keys()])) {
    if (!memberId) continue;
    const total = totals.get(memberId) ?? { coins: 0, earned: 0 };
    const current = byMember.get(memberId);
    computed.push({
      memberId,
      coins: total.coins,
      earned: total.earned,
      wasCoins: num(current?.fields, "coins"),
      wasEarned: num(current?.fields, "earned"),
      hasBalance: !!current,
    });
  }
  computed.sort((a, b) => a.memberId.localeCompare(b.memberId));

  const drifted = computed.filter(
    (row) =>
      !row.hasBalance || row.coins !== row.wasCoins || row.earned !== row.wasEarned,
  );

  printTable(
    ["memberId", "coins", "was", "earned", "was", "state"],
    computed.map((row) => [
      row.memberId,
      String(row.coins),
      String(row.wasCoins),
      String(row.earned),
      String(row.wasEarned),
      !row.hasBalance
        ? "missing"
        : row.coins === row.wasCoins && row.earned === row.wasEarned
          ? "ok"
          : "drift",
    ]),
  );
  console.log(
    `${computed.length} member(s), ${drifted.length} to write${dryRun ? " (dry run)" : ""}`,
  );

  if (dryRun || drifted.length === 0) return;

  const now = new Date().toISOString();
  for (const row of drifted) {
    const id = balanceId(householdId, row.memberId);
    const mask = ["householdId", "memberId", "coins", "earned", "updatedAt"]
      .map((field) => `updateMask.fieldPaths=${field}`)
      .join("&");
    const res = await fetch(`${ROOT}/balances/${id}?${mask}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          householdId: { stringValue: householdId },
          memberId: { stringValue: row.memberId },
          coins: { integerValue: String(row.coins) },
          earned: { integerValue: String(row.earned) },
          updatedAt: { timestampValue: now },
        },
      }),
    });
    if (!res.ok)
      throw new Error(`PATCH balances/${id}: ${res.status} ${await res.text()}`);
    console.log(`wrote balances/${id}`);
  }

  console.log("✓ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
