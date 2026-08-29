/**
 * The only path that ever moves `households/{id}.plan`.
 *
 * firestore.rules refuses any client write that changes `plan` (see
 * `isPlanImmutable`) — a parent cannot promote their own household, no
 * matter how the client is coded. This script is the one exception, by
 * design: it hits the Firestore REST API with a gcloud access token, the
 * same transport as scripts/deploy-rules.ts and scripts/recalc-balances.ts,
 * which bypasses the rules entirely rather than satisfying them.
 *
 * Run: pnpm exec tsx scripts/set-plan.ts <householdId> <free|pro>
 *
 * Needs FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) from the
 * environment or .env. Set FIRESTORE_EMULATOR_HOST to rehearse against the
 * emulator instead.
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
const plan = process.argv[3];

if (!householdId || (plan !== "free" && plan !== "pro")) {
  console.error("usage: pnpm exec tsx scripts/set-plan.ts <householdId> <free|pro>");
  process.exit(1);
}

const PROJECT_ID = required("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID");

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

async function main() {
  const getRes = await fetch(`${ROOT}/households/${householdId}`, { headers });
  if (!getRes.ok)
    throw new Error(
      `GET households/${householdId}: ${getRes.status} ${await getRes.text()}`,
    );
  const before = (await getRes.json()) as {
    fields?: { plan?: { stringValue?: string } };
  };
  const was = before.fields?.plan?.stringValue ?? "free";

  if (was === plan) {
    console.log(`households/${householdId} is already "${plan}".`);
    return;
  }

  const now = new Date().toISOString();
  const mask = ["plan", "updatedAt"]
    .map((field) => `updateMask.fieldPaths=${field}`)
    .join("&");
  const res = await fetch(`${ROOT}/households/${householdId}?${mask}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      fields: {
        plan: { stringValue: plan },
        updatedAt: { timestampValue: now },
      },
    }),
  });
  if (!res.ok)
    throw new Error(`PATCH households/${householdId}: ${res.status} ${await res.text()}`);

  console.log(`households/${householdId}.plan: "${was}" -> "${plan}"`);
  console.log("✓ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
