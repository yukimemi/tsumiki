/**
 * Rebuilds `households/{id}.taskCount` from the live `tasks` collection.
 *
 * taskCount is a cache: createTask/softDeleteTask (src/data/tasks.ts) move it
 * by exactly ±1 in the same writeBatch as the task write, but only against a
 * client trusted no further than App Check — a hand-rolled write that skips
 * the batch can leave it drifted (see issue #35's "soft gate" note). This
 * rebuilds it from the source of truth: every non-deleted task row.
 *
 * Run: pnpm exec tsx scripts/recalc-task-counts.ts <householdId> [--dry-run]
 *
 * Uses the Firestore REST API with a gcloud access token, the same transport
 * as scripts/deploy-rules.ts and scripts/recalc-balances.ts, so there is
 * nothing to install and no service account key to keep. Needs
 * FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) from the environment or
 * .env. Set FIRESTORE_EMULATOR_HOST to rehearse against the emulator instead.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
    "usage: pnpm exec tsx scripts/recalc-task-counts.ts <householdId> [--dry-run]",
  );
  process.exit(1);
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
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
};
type FsDocument = { name: string; fields?: Record<string, FsValue> };

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

async function main() {
  const tasks = await queryByHousehold("tasks");
  // Soft-deleted rows are gone from every screen (src/data/tasks.ts
  // useAllTasks); the cap only ever counted live tasks.
  const live = tasks.filter((doc) => !doc.fields?.deletedAt?.timestampValue);
  console.log(`task rows: ${tasks.length} (${live.length} live)`);

  const householdRes = await fetch(`${ROOT}/households/${householdId}`, {
    headers,
  });
  if (!householdRes.ok)
    throw new Error(
      `GET households/${householdId}: ${householdRes.status} ${await householdRes.text()}`,
    );
  const household = (await householdRes.json()) as FsDocument;
  const was = num(household.fields, "taskCount");
  const computed = live.length;

  console.log(`taskCount: was ${was}, computed ${computed}`);

  if (computed === was) {
    console.log("✓ No drift.");
    return;
  }
  if (dryRun) {
    console.log("(dry run, not written)");
    return;
  }

  const now = new Date().toISOString();
  const mask = ["taskCount", "updatedAt"]
    .map((field) => `updateMask.fieldPaths=${field}`)
    .join("&");
  const res = await fetch(`${ROOT}/households/${householdId}?${mask}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      fields: {
        taskCount: { integerValue: String(computed) },
        updatedAt: { timestampValue: now },
      },
    }),
  });
  if (!res.ok)
    throw new Error(`PATCH households/${householdId}: ${res.status} ${await res.text()}`);
  console.log(`wrote households/${householdId}.taskCount = ${computed}`);
  console.log("✓ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
