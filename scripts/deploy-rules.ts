/**
 * Publishes firestore.rules and storage.rules through the Firebase Rules REST
 * API with a gcloud-issued access token.
 *
 * Run: pnpm rules:deploy
 *
 * Needs FIREBASE_PROJECT_ID (falls back to VITE_FIREBASE_PROJECT_ID) and
 * FIREBASE_STORAGE_BUCKET (falls back to VITE_FIREBASE_STORAGE_BUCKET), from
 * the environment or from .env. See .env.example.
 *
 * One-time IAM setup for cross-service rules:
 *   storage.rules calls firestore.get(...) to gate uploads on household
 *   membership. The console grants the required IAM binding the first time you
 *   press Publish; this REST path does not. Without it every cross-service
 *   call returns null and uploads silently 403. Granted once per project:
 *     gcloud projects add-iam-policy-binding <PROJECT_ID> \
 *       --member="serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-firebasestorage.iam.gserviceaccount.com" \
 *       --role="roles/firebaserules.firestoreServiceAgent"
 *   Then re-run this script — IAM changes do not apply to an already-released
 *   ruleset, you need a fresh release.
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

const PROJECT_ID = required("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID");
const STORAGE_BUCKET = required(
  "FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_STORAGE_BUCKET",
);

const token = () =>
  execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

async function api(method: string, path: string, body: unknown, t: string) {
  const url = `https://firebaserules.googleapis.com/v1/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      "X-Goog-User-Project": PROJECT_ID,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deploy(
  rulesPath: string,
  releaseName: string,
  sourceName: string,
) {
  const t = token();
  const content = readFileSync(rulesPath, "utf8");

  const ruleset = (await api(
    "POST",
    `projects/${PROJECT_ID}/rulesets`,
    { source: { files: [{ name: sourceName, content }] } },
    t,
  )) as { name: string };

  const rulesetName = ruleset.name;
  console.log(`Created ruleset: ${rulesetName}`);

  await api(
    "PATCH",
    `projects/${PROJECT_ID}/releases/${releaseName}`,
    {
      release: {
        name: `projects/${PROJECT_ID}/releases/${releaseName.replace("%2F", "/")}`,
        rulesetName,
      },
    },
    t,
  );
  console.log(`Released to: ${releaseName}`);
}

async function main() {
  console.log(`Project: ${PROJECT_ID}`);

  console.log("Deploying Firestore rules...");
  await deploy("firestore.rules", "cloud.firestore", "firestore.rules");

  console.log("Deploying Storage rules...");
  await deploy(
    "storage.rules",
    `firebase.storage%2F${STORAGE_BUCKET}`,
    "storage.rules",
  );

  console.log("✓ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
