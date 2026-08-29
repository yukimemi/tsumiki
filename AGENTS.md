<!-- kata:agents:base:begin -->
## Shared conventions

This file is the agent-agnostic source of truth (per the
[agents.md](https://agents.md) convention). The matching
`CLAUDE.md` and `GEMINI.md` files are thin shims that point back
here so each tool's auto-load behaviour still finds something.
**Edit AGENTS.md, not the shims.**

### Git workflow

- **No direct push to `main`.** Open a PR.
  - Exception: trivial typo / whitespace / docs wording fixes.
- Branch names: `feat/...`, `fix/...`, `chore/...`.
- **PR titles + bodies in English. Commit messages in English.**
- **Releases are PR-driven and tagging is automatic** — in repos that
  ship a release pipeline. Bump the version in the project's own
  manifest in a `chore/release-vX.Y.Z` PR; on merge to `main` the
  language layer's `auto-tag.yml` detects the bump, pushes the
  `vX.Y.Z` tag, and that tag is what fires `release.yml`. **Do not run
  `git tag` by hand** — the bot tag will collide and the manual push
  fails. The specifics belong to the layers shipping those two
  workflows, which are not the same layer: `kata:agents:rust:*` for
  which file holds the version and for `auto-tag.yml`,
  `kata:agents:rust-{cli,lib}:*` for what `release.yml` builds and
  publishes. A repo with no `auto-tag.yml` has no release pipeline at
  all: nothing tags, and the version field in its manifest may well
  be decoration.

### PR review cycle

- Every PR runs reviews from **Claude Code**
  (`.github/workflows/claude-review.yml`, kata-managed) and
  **CodeRabbit**. Wait for both bots to post, address their
  comments (push fixes to the PR branch), and merge only after
  feedback is resolved. The claude-review workflow skips
  review-exempt PRs by itself (its job-level `if:` excludes
  `chore/release-*`, `kata-apply/auto`, `apm-bump/auto`, and
  Renovate / Dependabot authors) — a missing Claude review on
  those PRs is expected, not a failure.
- **Any PR that touches the Claude workflow files goes
  unreviewed.** `claude-code-action` requires the workflow file to
  already exist on the default branch **with identical content** —
  otherwise a PR could rewrite the workflow to exfiltrate the
  token. When the content differs it logs "Skipping action due to
  workflow validation" and exits 0 without reviewing: a green
  check with no review attached. This covers two cases, and the
  second is the one that keeps surprising people:
  - the PR that first adopts these templates (the workflow does
    not exist on the default branch yet), and
  - any later PR that **edits** `claude-review.yml` / `claude.yml`,
    e.g. hand-pulling an upstream template fix.

  Not fixable from this side — it is the mechanism that makes the
  token safe to hand to the action at all. Expected: merge on CI +
  owner approval; reviews resume on the next PR that leaves the
  workflows alone. The `kata-apply/auto` branch is already excluded
  by the job-level `if:`, so the daily template-refresh PRs do not
  add noise here.
- **A missing credential fails loudly instead.** If the repo has
  neither `CLAUDE_CODE_OAUTH_TOKEN` nor `ANTHROPIC_API_KEY` set,
  the guard step fails the job — set one and re-run (subscription
  path: `claude setup-token` → `gh secret set`; pay-as-you-go:
  store `ANTHROPIC_API_KEY` and swap the action input to
  `anthropic_api_key`). Distinguishing the two: **red** means no
  credential, **green with no review** means workflow validation.
- **The Claude full review fires once, at PR open** (plus
  `ready_for_review` / `reopened`) — fix pushes do **not** re-trigger
  it (`synchronize` is deliberately off the trigger list; a full
  re-review per push doubled up with the mention-driven re-check
  below and burned tokens for no extra signal). Verification of
  fixes rides the `@claude` thread replies. After a large rework
  that changes the PR's shape, request a fresh full pass
  explicitly: `@claude please re-review the full PR`. CodeRabbit
  still reviews pushes on its own cadence (its app config, not
  this workflow).
- **After opening a PR, immediately enter the review-monitoring
  loop — do not ask the user whether to start it.** Drive the
  cadence with `/loop` — fixed-interval mode (e.g.
  `/loop 60s …`) schedules ticks via `CronCreate`; dynamic mode
  (no interval, `/loop …`) self-paces via `ScheduleWakeup`. The
  agent actively pulls fresh state each tick with
  `gh pr view <N> --json state,reviews,comments,statusCheckRollup`
  and `gh api repos/<owner>/<repo>/pulls/<N>/comments` (the
  latter covers inline review comments, which `gh pr view`
  does not surface) and reacts to new bot feedback. Passive
  watchers (background `gh` polls, file watchers, hooks) cannot
  trigger active follow-up, so they are not a substitute —
  without an active wake-up the agent never re-reads the PR.
- **Default polling interval: 60s.** Claude Code review /
  CodeRabbit typically reply within ~1–5 minutes of a push or
  thread reply, so a 60s tick catches them on the next wake-up
  without burning cache: 60s sits well inside the 5-minute
  prompt-cache TTL, so the conversation context stays cached
  across ticks. Do **not** stretch the interval to 300s — that
  is the worst-of-both window (you pay the cache miss without
  amortizing it). If the PR is idle but a bot re-review is still
  expected (e.g. a CodeRabbit rate-limit refill window), step
  **up** to 1200–1800s instead.
- **Stop the loop entirely when only owner approval is missing.**
  Once review bots are quiet (or quiet-by-exception — version-bump
  skip, Renovate/Dependabot skip), CI is green, and there is no
  other expected follow-up, the *only* remaining action is human
  approval. GitHub already notifies the owner; the agent
  re-entering on every cron tick to find the same "still waiting
  on owner" state burns cache and adds no value. Stop scheduling
  further wake-ups (`CronDelete` in fixed-interval mode; simply
  omit the next `ScheduleWakeup` in dynamic mode) and report the
  wait state to the user. The owner restarts the loop after their
  next push if a fresh bot pass is wanted, or merges directly.
  (A CodeRabbit rate-limit window doesn't qualify on its own — a
  re-review is still expected once the quota refills, so step up
  to 1200–1800s instead and let it ride. Stopping is only correct
  when the owner has explicitly chosen to skip the bot pass per
  the rate-limit exception below.)
- **Reply to reviewers after pushing a fix — in each thread, not
  at the top level.** Every finding lives in its own inline review
  thread; answer *each* one as an in-thread reply, carrying an
  **@-mention** (`@claude` / `@coderabbitai`). Use the review-
  comment *replies* endpoint — `gh api repos/<owner>/<repo>/pulls/<N>/comments/<comment_id>/replies -f body=…`
  (or `-F in_reply_to=<comment_id> -f body=…` on the comments
  endpoint — `body` is required there too) — and
  get each comment's `<comment_id>` from
  `gh api repos/<owner>/<repo>/pulls/<N>/comments`. A single
  top-level `gh pr comment` does **not** count: it leaves every
  inline thread unresolved, the bot can't tie your response to the
  finding it raised, and the per-finding audit trail is lost.
  Reply in-thread even when you're **declining** a suggestion —
  say why; a silent skip reads as overlooked. Note `@claude` also
  triggers the interactive responder
  (`.github/workflows/claude.yml`, kata-managed) — it will
  re-check the fix and reply on the thread. Since fix pushes no
  longer re-trigger the full review, this mention-driven re-check
  is the **only** Claude-side verification of a fix — don't skip
  it for substantive fixes; do skip it for pure FYI notes that
  need no verification.
- A review thread is **settled** the moment the latest bot reply
  is ack-only ("Thank you" / "Understood" / a re-review summary
  with no new findings) or 30 minutes elapse with no actionable
  comment.
- **Merge gate**: review bots quiet AND owner explicit approval.
- Bot-authored PRs (Renovate / Dependabot) skip the bot-review
  gate; CI green + owner approval is enough.
- **Version-bump-only PRs** (a single `chore/release-vX.Y.Z`
  branch whose entire diff is `[workspace.package].version` /
  `[package].version` + the matching inter-crate refs +
  `Cargo.lock`) **also skip the bot-review gate.** There is
  nothing for the bots to find in a version bump, and the
  release pipeline downstream of merge (auto-tag → release.yml)
  is time-sensitive. CI green + owner approval is enough.
- **Treat CodeRabbit rate-limit notices as "quiet" for the
  merge gate.** If CodeRabbit only posts a "Review limit
  reached" quota-exhaustion message (no findings, no inline
  comments), it has produced no review content — there is
  nothing to address. Re-trigger with `@coderabbitai review`
  once the quota refills if you want a real pass; for small or
  time-sensitive PRs, merge on owner approval without waiting.

### Worktree workflow

> **Before your FIRST edit to any file, run `renri add` — NEVER edit the
> main checkout.** Read-only inspection (Read / Grep / Glob) stays on the
> main checkout; the instant you intend to *change* a file, you must
> already be in a worktree. The trap that keeps catching agents: diving
> into a fix the moment the diagnosis lands and editing in place. A
> concurrent agent shares the main checkout — your in-place edits will
> clobber theirs or be clobbered, and in a jj-colocated repo a stray
> working-copy commit entangles unrelated WIP into your branch. If you
> slip and edit in the main checkout, capture the diff first (jj already
> snapshotted it into the working-copy commit, so `jj diff > patch`; for
> git, `git stash` or save a patch — if you got as far as committing on a
> branch, just push it). Then reset the main checkout to pristine main
> (`jj new main@origin`, or `git switch -`), `renri add` a worktree, and
> re-apply the captured diff there.

Use [`renri`](https://github.com/yukimemi/renri) for any
commit-bound change. From the main checkout:

```sh
renri add <branch-name> --from main@origin            # create a worktree (jj-first), off latest upstream main
renri --vcs git add <branch-name> --from origin/main  # force a git worktree, off latest upstream main
renri remove <branch-name> -y --non-interactive  # cleanup after merge (agent-safe; see note)
renri prune                        # GC stale worktrees
```

Read-only inspection can stay on the main checkout.

**Always pass `--from <upstream main>`** (`main@origin` for jj,
`origin/main` for git). Without it, `renri add` forks off the *cwd
worktree's current HEAD* — in a long-lived main checkout that often
lags upstream, so the PR later shows up CONFLICTING against a `main`
that had already moved (e.g. a refactor merged upstream before the
branch was cut), forcing a manual re-port of the whole change.
`renri add` does fetch first, but fetching only updates `main@origin`
— it never moves the checkout's HEAD, so an explicit `--from` is what
guarantees a fresh base.

**Agents / non-interactive shells:** `renri remove` prints a details
panel and waits for a confirmation prompt — without `-y` it **hangs**,
and `--non-interactive` *alone* errors asking for `-y`. Always pass
`-y`, and add `--non-interactive` so a mistyped/omitted name fails
instead of opening a fuzzy picker (the same picker-fallback applies to
`remove` / `cd` / `exec` with no name). Use `-f`/`--force` to remove a
worktree that still has uncommitted changes or conflicts. To sweep
every merged-PR worktree in one shot: `renri remove --merged -y`.

### kata-managed sections

Several files in this repo are managed by `kata apply` from the
[`yukimemi/pj-presets`](https://github.com/yukimemi/pj-presets)
templates — the bytes between `<!-- kata:*:begin -->` and
`<!-- kata:*:end -->` markers, plus the overwrite-always files
listed in `.kata/applied.toml`. **Editing those bytes locally
won't survive the next `kata apply`** — push the change to the
upstream template repo (`yukimemi/pj-base` / `yukimemi/pj-rust` /
…) instead.

The marker scopes are layered, one per applied layer:
`kata:agents:base:*` is this section, and each layer adds its own
(`kata:agents:rust:*`, `kata:agents:rust-cli:*`,
`kata:agents:pnpm:*`, `kata:agents:firebase:*`, …). Which ones apply
*here* is a grep away: `<!-- kata:` in this file.

### This project's own conventions

Everything a layer ships is generic by construction: it describes the
stack the template assumed, not what this repo grew into. **Bytes
outside every marker pair are yours and survive `kata apply`** — so
project-specific conventions belong in a section of their own, outside
the markers (conventionally at the end of the file; if a later layer
appends its block below yours, no matter — kata only ever rewrites
between its own markers). Same mechanism as the `.gitignore` /
`.gitattributes` blocks.

Write those conventions down there rather than leaving them in one
agent's head, in commit archaeology, or in a README the agent will not
read. What earns a line:

- **Any layer default that does not hold here.** A layer states its
  assumption flatly ("Hosting is the primary target", "these rules are
  a placeholder to replace"). When the project has diverged, say so and
  say why — the layer's text keeps asserting the opposite on every
  apply, and an agent that only reads the blocks will act on it.
- **Facts duplicated across files with no compiler in between** — an
  address or a path that appears in code *and* in a rules/config file
  that cannot import it, a timeout that has to stay inside another
  timeout. List every copy, so the next edit finds them all.
- **kata-shipped files this project deleted on purpose**, together with
  the `once_applied = true` line in `.kata/applied.toml` that keeps
  them deleted. Otherwise someone helpfully restores one.
- **Shapes the runtime forces but no tool checks** — an export form a
  platform requires, import specifiers that must (or must not) carry a
  file extension, a directory whose contents are reachable by URL.
- **Invariants that money or access rest on**, naming the file and line
  that actually enforces them.
- **Which language the code speaks versus what a user reads**, when the
  two differ.

A repo whose `AGENTS.md` is nothing but kata blocks is a repo where
every agent re-derives all of that from scratch — and gets the layer
defaults wrong the same way each time.
<!-- kata:agents:base:end -->
<!-- kata:agents:pnpm:begin -->
## pnpm / TypeScript layer (kata: pj-pnpm)

This block is owned by `yukimemi/pj-pnpm` and re-applied on every
`kata apply`. Edits go upstream to the template, not to this file.

### Package manager

- **pnpm only.** `pnpm-lock.yaml` is the source of truth.
  `package-lock.json` / `yarn.lock` must not appear.
- `packageManager` in `package.json` pins the major.
- CI uses `pnpm install --frozen-lockfile`. Local dev does not —
  developers add deps with `pnpm add` / `pnpm add -D`.

### Scripts

- `pnpm dev` — start the dev server.
- `pnpm build` — `tsc -b && vite build` (or framework equivalent).
- `pnpm lint` — ESLint on the whole tree.
- `pnpm test` — Vitest run-once. `pnpm test:watch` for the loop.

### CI

- `.github/workflows/ci.yml` is kata-managed, rendered from this
  layer's `ci.yml.tera`. Local edits are reverted on the next
  `kata apply` — push fixes upstream, and put project-specific CI in
  a separate workflow file.
- One job, `check`, on `ubuntu-latest`: `pnpm install
  --frozen-lockfile` → `pnpm lint` → `pnpm build` → `pnpm test`.
  There is no separate `tsc -b` step because `build` already starts
  with one; running the bundler too is what catches an import or a
  `vite.config.ts` that type-checks but cannot be built.
- Triggers are `pull_request`, `push` to `main`, and
  `workflow_dispatch`. Concurrent runs on the same ref are cancelled.
- **`check` is the status check to require for merge.** Add it to
  `main`'s branch protection. With nothing required a PR is mergeable
  the moment it opens, so an automated PR (`kata apply`, Renovate)
  can land unreviewed — and GitHub refuses to arm auto-merge on an
  already-mergeable PR, so the arming step in pj-base's
  `kata-apply.yml` has nothing to wait on either.
- Action versions are pins in `.kata/vars.toml` —
  `actions.pnpm_action_setup` and `actions.setup_node` from this
  layer, `actions.checkout` from pj-base. Never write a version into
  the workflow. The `# renovate:` annotations that make the two pnpm
  pins bumpable live upstream in `vars.pnpm.toml`, not in the merged
  copy here, so a newer pin arrives via
  `kata apply --reseed .kata/vars.toml`.
- pnpm itself is set up with no `version:` input: `packageManager` in
  `package.json` is the only place the pnpm version is declared, and
  supplying both makes `pnpm/action-setup` fail with "Multiple
  versions of pnpm specified" as soon as they drift.

### TypeScript

- Project-references layout: root `tsconfig.json` references
  `tsconfig.app.json` (browser/runtime code) and
  `tsconfig.node.json` (Vite config and any node-side scripts).
- `noEmit: true` everywhere — `tsc -b` is type-check-only; the
  bundler emits.

### .env / secrets

- Never commit `.env`. `.env.example` is the documented surface.
- Vite-exposed vars must be prefixed `VITE_` to be readable from
  browser code; anything without that prefix is server-only.
<!-- kata:agents:pnpm:end -->
<!-- kata:agents:react-web:begin -->
## Vite + React + Tailwind layer (kata: pj-react-web)

This block is owned by `yukimemi/pj-react-web` and re-applied on
every `kata apply`. Edits go upstream to the template, not to
this file.

### Stack

- **Vite** as the dev server / bundler.
- **React 19** with the `react-jsx` runtime (no `import React`).
- **TypeScript** project-references via the `pj-pnpm` root
  `tsconfig.json` → `tsconfig.app.json` (browser) +
  `tsconfig.node.json` (vite config / scripts).
- **Tailwind v3** + PostCSS + autoprefixer.
- **ESLint flat config** with `@eslint/js` recommended,
  `typescript-eslint` recommended, `eslint-plugin-react-hooks`,
  `eslint-plugin-react-refresh` (vite preset).
- **Vitest** for tests (`pnpm test` / `pnpm test:watch`).

### Dev server reachability

`vite.config.ts` is `when = "once"` (consumer territory — see
`template.toml` for why), so the starter we ship is just a
seed. The seed sets `server.host = true` and allows `.ts.net`,
`.local`, and `localhost` so Tailscale and LAN previews work
out of the box.

**Convention for every PJ on this layer**: keep the Tailscale
allowlist in `server.allowedHosts`. Even if you rewrite
`vite.config.ts` for plugins (VitePWA, Sentry, …), preserve at
minimum:

```ts
server: {
  host: true,
  allowedHosts: [".ts.net", ".local", "localhost"],
},
```

Without it the dev server rejects Tailscale / mDNS hosts with
"Blocked request" and remote previews silently break. There's
no automated guard for this since the file is consumer-owned —
treat it as a checklist item when touching `vite.config.ts`.

### Tailwind

- `tailwind.config.js` is `when = "once"` — per-project theme
  extensions (custom colours, fontFamily, keyframes) survive
  `kata apply`.
- The shared baseline only sets `content` so Tailwind picks up
  `index.html` and `src/**/*.{ts,tsx}`. Add fonts / colours /
  shadows to the project's own copy.

### `src/` skeleton

- `main.tsx`, `App.tsx`, `index.css`, `vite-env.d.ts` are all
  `when = "once"` placeholders — they boot a working "Hello"
  page after init and are otherwise free for the project to
  rewrite.

### Required deps

The framework layer doesn't ship a populated `package.json` (the
`pj-pnpm` layer ships an empty-deps scaffold instead). After
`kata init`, run:

```sh
pnpm add react react-dom
pnpm add -D vite @vitejs/plugin-react typescript \
  @types/react @types/react-dom @types/node \
  tailwindcss postcss autoprefixer \
  eslint typescript-eslint @eslint/js globals \
  eslint-plugin-react-hooks eslint-plugin-react-refresh \
  vitest
```

Pin majors to whatever the `kakeizu` reference project is using
when starting a new repo.
<!-- kata:agents:react-web:end -->
<!-- kata:agents:firebase:begin -->
## Firebase + Vercel layer (kata: pj-firebase)

This block is owned by `yukimemi/pj-firebase` and re-applied on
every `kata apply`. Edits go upstream to the template, not to
this file.

### Deploy target: pick one, then write the choice down

This layer ships both halves — `firebase.json` for Firebase
Hosting, `vercel.json` for Vercel — because which one a project
ends up on depends on something the template cannot see: whether
the app is static.

- **Static front end, Firebase for data.** Firebase Hosting is
  the target (`firebase deploy --only hosting` locally, or the
  `Deploy to Firebase Hosting` workflow from `main`), and Vercel
  runs in parallel as a same-stack mirror so PR previews work out
  of the box. Keep `vercel.json` and `firebase.json`'s
  rewrites/headers in sync — both should rewrite `**` →
  `/index.html` for SPA routing and emit
  `Cross-Origin-Opener-Policy: same-origin-allow-popups`
  (Firebase Auth popup needs this).
- **Any server-side code — an `api/` directory of Vercel
  Functions, Next.js route handlers, an LLM call whose key must
  not reach the browser — makes Vercel the only target that runs
  the whole app.** Hosting serves static files; it cannot execute
  a function, so a Hosting deploy publishes a UI whose every
  server route fails. That is a fork in the road, not a
  preference: once such a route exists the Hosting path is dead.

On the Vercel-only path, make the choice stick rather than leave
two half-live pipelines:

- Delete `.github/workflows/deploy.yml`; the
  `once_applied = true` entry it leaves in `.kata/applied.toml`
  is what stops the next `kata apply` re-creating it.
- Keep `firebase.json` / `.firebaserc` anyway — rules deploys
  still need them (`firebase deploy --only
  firestore:rules,storage`), Hosting config or not.
- Put the env in the Vercel project (`vercel env ls`). The
  GitHub secrets listed below feed the Hosting workflow only.
- Record it in the project's own section, below the last
  `kata:*:end`. This block goes on offering Hosting as an option
  on every apply; the project section is where the answer lives.

### Server routes on Vercel

Only relevant on the Vercel path. The first two fail in ways that
do not resemble their cause:

- **Match the export form to what the runtime does with it.** The
  Node runtime accepts three shapes, and one is a trap in a
  codebase built on Web `Response`: a bare
  `export default function handler(req, res)` is the *legacy Node
  handler*, whose return value is discarded — build a `Response`
  inside it and the client receives nothing. The Web-standard
  shapes are named method exports (`export const POST = …`,
  `export function GET(request)`) and a default export of an
  object carrying a `fetch` method
  (`export default { fetch(request) { … } }`). Prefer the method
  exports: one file, one route, one verb per export.
- **Under `"type": "module"`, relative specifiers in function code
  carry `.js`** — `./_lib/http.js`, `../../shared/foo.js`, even
  though the file on disk is `.ts`. That is the shape this stack
  produces: the pnpm layer's `package.json` is ESM, and standalone
  `api/*.ts` functions are transpiled per file rather than
  bundled, so Node's ESM loader resolves the specifier verbatim
  and refuses an extensionless one
  (production-only `ERR_MODULE_NOT_FOUND`). Browser code under
  `src/` stays extensionless because Vite bundles it, so one repo
  runs both conventions. Framework route handlers that go through
  a real bundler (Next.js) are exempt — check which side a route
  is on before copying either rule.
- A dev-time Vite plugin that mounts `api/` on the dev server is
  worth its ~100 lines: `pnpm dev` becomes the whole app and the
  Vercel CLI leaves the local loop. Note that it also masks both
  mistakes above, since Vite bundles and invokes the handler
  directly.
- **`vercel.json` is co-owned, and the SPA rewrite is the half
  that bites.** kata syncs `$schema`, `buildCommand`,
  `outputDirectory`, `framework`, `rewrites` and `headers`
  (`merge-json`, so only those keys). The shipped rewrite
  excludes the whole `/api` boundary —
  `/((?!api(?:/|$)).*)` — because a catch-all answers every
  function route with `index.html`: a green deploy whose whole
  API is gone. `regions`, `functions` (a
  `maxDuration` raised for slow LLM calls, say) and anything
  else the project adds are the project's, and survive applies.

### Rules

- `firestore.rules` and `storage.rules` ship a permissive
  signed-in-only baseline. Replace with the project's real
  schema before shipping. Verified-email is required at the
  baseline so Google sign-in's pre-verification flow is the
  default.
- Both files are `when = "once"`, so kata never writes them
  again. Once replaced they **are** the app's access control:
  read a diff against them as a security change, and never
  "restore the baseline" on the strength of the paragraph above
  still describing one.
- Push rules with `firebase deploy --only firestore:rules,storage`
  (or via a project-side `scripts/deploy-rules.ts` helper —
  kakeizu has one as a reference).

#### Cross-service rules IAM (one-time per project)

If `storage.rules` calls `firestore.get(...)` / `firestore.exists(...)`
to gate Storage on Firestore data, the Firebase Storage service
agent needs `roles/firebaserules.firestoreServiceAgent`. The
Firebase Console grants this automatically on first Publish of
such a rule, but the REST API / CLI deploy paths (this stack
uses CI + a local `scripts/deploy-rules.ts`) do **not** trigger
the prompt. Without it every cross-service call returns null and
rules silently 403, with no useful logs anywhere.

Grant once per project (after enabling Firebase Storage):

```sh
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-firebasestorage.iam.gserviceaccount.com" \
  --role="roles/firebaserules.firestoreServiceAgent"
```

Then re-deploy the storage ruleset (IAM doesn't apply
retroactively to a live ruleset; you need a fresh release).
Allow ~1–2 min for IAM propagation before testing.

### Env wiring

- `.env.example` documents the `VITE_FIREBASE_*` surface. Copy
  to `.env`, fill in from the Firebase console.
- The Hosting deploy workflow rewrites `.env` from secrets at
  build time (Vite inlines envs at compile time, so the build
  container needs them, not the runtime).
- GitHub secrets required **on the Hosting path**:
  - `FIREBASE_SERVICE_ACCOUNT` — JSON for a service account
    with the `Firebase Hosting Admin` role.
  - `VITE_FIREBASE_*` — one secret per `.env.example` entry.
- On the Vercel-only path neither is needed: the same names go in
  the Vercel project's environment variables, and server-side
  keys stay **un-prefixed** so they never reach the bundle.
  `VITE_FIREBASE_*` are public by design — the rules are the
  protection, not the obscurity of those values.

The `projectId` note below points at `deploy.yml`; on the
Vercel-only path that file is gone and the project id lives in
`.firebaserc` plus whatever the app reads at runtime.

### projectId

`firebase.json` is Tera-rendered with `{{ project.name }}` for
the hosting `site` field, but the **Firebase project ID** is a
separate thing (often a different string with a random suffix).
Replace `REPLACE_ME_FIREBASE_PROJECT_ID` in
`.github/workflows/deploy.yml` with the actual project ID before
the first deploy.

### Authorized domains

Firebase Auth's authorized-domains list is what makes
`localhost`, `*.ts.net` (Tailscale), and `*.local` (mDNS)
work for sign-in popups. Update via the Identity Toolkit REST
API (`X-Goog-User-Project: <project-id>` header required) — the
UI doesn't expose Tailscale-style hosts cleanly. See the
`reference_firebase_authorized_domains_via_gcloud` memory for
the exact PATCH call.
<!-- kata:agents:firebase:end -->

## tsumiki specifics

Everything above this heading is owned by the `kata` templates and is rewritten
by `kata apply`. Everything below survives template updates — put
project knowledge here, not upstream.

### What this is

A family chore / achievement / pocket-money PWA. Read `docs/DESIGN.md` before
changing anything structural: it is the authoritative spec for the Firestore
collections, the role matrix, the invite flow, every write flow, the screen map,
the colour-slot semantics and the effect catalog.

### Deployment is Vercel, not Firebase Hosting

The `pj-firebase` template ships a Firebase Hosting deploy workflow. It was
deleted. Production is Vercel (`hnd1`, see `vercel.json`). `firebase.json` is
kept only so `firebase deploy --only firestore:rules,storage,firestore:indexes`
works, and its `hosting` block is vestigial. Keep the SPA rewrite and the
`Cross-Origin-Opener-Policy: same-origin-allow-popups` header in step between
`vercel.json` and `firebase.json` — Firebase Auth's sign-in popup needs the
latter.

### Layering, enforced by review

- `firebase/firestore` may be imported by `src/data/*` and `src/lib/firebase.ts`
  only. A screen or component that reaches past `src/data` is a bug even if it
  compiles.
- Every subscription returns `Live<T> = { data, loading, error }` and goes
  through `useLiveDocs` / `useLiveDoc` in `src/data/live.ts`, which skips
  `hasPendingWrites` snapshots so a multi-document batch never renders half
  applied.
- Every write from a screen goes through `useAction().run(...)`
  (`src/screens/useAction.ts`), which owns the busy flag, the Japanese error
  message and the failure shake.

### Firestore rules: queries must constrain what the rules read

Firestore evaluates a `list` rule against the *query's own filters*, not against
documents it has not fetched. Any field a rule reads must be pinned by an
equality in the query, or the read is denied even when the result set is empty.

This bit us once already: `useComments` filtered only on `entryId` while the
rule reads `resource.data.householdId`, so every thread failed with
`Property householdId is undefined on object`. The fix was to add
`where("householdId","==",householdId)`. Any new flat collection query needs the
same treatment.

### Signup is self-serve; there is no allowlist

Any verified Google account may create a household, and that *is* the signup
step. The household document is the only membership boundary — every rule for
every collection resolves to one `get()` of it, so a signed-in stranger reaches
nothing until they create a family or claim an invite.

There used to be a second gate: `config/access.allowedEmails` (plus
`config/accessGrants`, its reverse index) had to list an address before any
write was allowed, and the first user was seeded by hand. It is gone. Two
things it left behind, both deliberate:

- `match /config/{document=**}` denies everything rather than being deleted.
  Documents from that era are still in production and must not become readable
  if someone later adds a permissive `config` rule.
- `users/{uid}` is readable **only by its owner**. Nothing reads anyone else's
  (member lists come from the denormalised `Household.memberInfo`), and with
  open signup a `isSignedIn()` read rule there would hand every address in the
  database to anyone who makes an account. Do not loosen it without moving that
  data somewhere it belongs.

Nothing in the rules limits *how often* a signed-in user may write, and
nothing can — rules see one request at a time. App Check (reCAPTCHA
Enterprise, wired in `src/lib/firebase.ts`) is what covers that gap, and
only for automated abuse: it cannot stop a person creating households by
hand.

**Enterprise, not the classic v3 provider.** The Firebase console marks
classic reCAPTCHA deprecated and asks for a secret key; the current
key-creation flow issues Cloud-managed Enterprise keys, which have no
secret. `ReCaptchaV3Provider` is therefore not an option here however much
the docs still mention it — the key simply cannot be obtained.

**The token TTL is the cost dial.** Enterprise bills per assessment beyond
10,000/month, and an assessment happens only when the App Check token is
minted — so the TTL *is* the billing interval. It is set to 1 day in the
console. At the console's 1-hour default a single device burns >700
assessments a month and the free tier is gone at about a dozen devices.
Shortening it is a billing decision, not just a security one.

Two more things that are easy to get wrong:

- **It initialises inside `ensureApp()`, not at the entry point.** App Check
  has to be started between `initializeApp()` and the first call into any
  Firebase service. Every service getter in that file is lazy, so
  `ensureApp()` is the only place with that guarantee.
- **Code alone does nothing.** Enforcement is a Firebase console setting per
  service. Until it is switched on, an unattested request is served normally
  — which is deliberate: turn it on only after the App Check metrics show
  verified traffic, or you lock out everyone still holding an older bundle.

`scripts/*` are unaffected either way: they use the Firestore REST API with a
gcloud token, which bypasses rules and App Check both.

### Billing has three guards, and the innermost one takes the app down

Blaze has no built-in ceiling, so the guards are explicit. Outermost is a
¥1,000/month budget with 50/90/100% alerts; then a 300/day cap on
reCAPTCHA `CreateAssessmentRequests`; then `functions/billing-guard`, a
Cloud Function on the budget's Pub/Sub topic that unlinks the billing
account at 100%.

- **The quota cap is also a DoS surface.** Burn the day's 300 assessments
  and, with App Check enforced, nobody can mint a token — legitimate users
  included. It is set where it is because 300/day keeps the month inside
  reCAPTCHA's free 10,000; raising it trades billing exposure for
  availability, and both directions are real.
- **billing-guard is deployed by hand**, from the command in README. There
  is no CI for it on purpose: a pipeline for something touched once a year
  rots unnoticed, and this is the piece that must work the one time it runs.
- **Its service account holds `roles/billing.projectManager` on the
  project, not `roles/billing.admin` on the billing account.** Most guides
  grant the latter; it would let this function detach billing from every
  other project too. Unlinking needs only the former.
- **The destructive path is untested by design** — testing it means taking
  production down. What is exercised is the quiet path (cost < budget).
- **A successful deploy does not mean a working trigger.** Three IAM
  bindings sit on the delivery path (Pub/Sub's service agent needs
  `roles/iam.serviceAccountTokenCreator`; the runtime SA needs
  `roles/run.invoker` on the Cloud Run service, whose policy starts empty,
  and `roles/eventarc.eventReceiver` on the project). Without them the
  deploy still reports ACTIVE and every message is silently dropped —
  `gcloud functions deploy` warns about exactly one of the three and exits
  0. This is how the first deploy here shipped a kill switch that could
  never fire. Always publish a test notification and read the logs after
  deploying; the commands are in README.

### Cross-file invariants

| Invariant | Lives in |
| --- | --- |
| Emulator ports | `firebase.json` `emulators` + the constants in `src/lib/firebase.ts` |
| Entry / balance document ids | `src/lib/ids.ts` + `scripts/recalc-balances.ts` + `firestore.rules` |
| `encodeEmailKey` (`.` → `%2E`) | `src/lib/ids.ts` + the `pendingRoleForSelf()` helper in `firestore.rules` |
| Emails are stored lowercased | `src/data/invites.ts`, `src/components/InviteForm.tsx`, `firestore.rules` (`userEmail()`) |
| Composite indexes | `firestore.indexes.json` — add one whenever a query gains an `orderBy` beside a `where` |
| The fixed preview hostname | Firebase authorized domains (console) + the `vercel alias set` line under *Vercel previews and Firebase authorized domains* below |
| `Household.plan` / `taskCount` | `src/types.ts`, `firestore.rules` (`isPro`, `isPlanImmutable`, `isTaskCountUpdate`), `storage.rules` (`isPro`), `src/data/tasks.ts`, `scripts/set-plan.ts`, `scripts/recalc-task-counts.ts` |
| The free-plan task cap (`30`) | `firestore.rules` (`taskCount < 30` on `tasks` create), `src/components/TaskEditor.tsx` (`atCap`), `src/screens/SettingsScreen.tsx` (the "30こまで" copy) — no shared constant, so a future change to the number must touch all three |
| Free-tier ad gating | `src/components/FreeTierAd.tsx` (`plan !== "pro"` check), `src/screens/SettingsScreen.tsx` (mounted only inside the `isParent` branch), `.env.example` (`VITE_ADSENSE_CLIENT` / `VITE_ADSENSE_SLOT`) — see #36 |

### Coins

The `ledger` collection is append-only (rules forbid update, and only the owner
may delete, which is what makes the household cascade possible). `balances` is a
cache written in the same `writeBatch` as the ledger row; if it ever drifts,
`scripts/recalc-balances.ts` rebuilds it from the ledger. `Balance.earned` is a
lifetime total: it goes down only when a completion is undone, never on a spend.

### Plan (free / pro)

`households/{id}.plan` is `"free" | "pro"`, absent meaning free. Two facts
that only hold here, not anywhere the code says them explicitly:

- **The client can never write `plan`.** `firestore.rules`' `isOwner`
  branch on `households` update otherwise lets an owner write any field —
  `isPlanImmutable` closes that specific hole. The only path that moves it
  is `scripts/set-plan.ts`, which hits the Firestore REST API with a gcloud
  token (same trick as `scripts/deploy-rules.ts`) and so never goes through
  the rules at all.
- **The 30-task free cap (`households/{id}.taskCount`) is a soft gate, on
  purpose.** `firestore.rules` can only require the counter move by ±1 in
  the same write as a task create/delete (`isTaskCountUpdate`); it cannot
  require that a task create *always* comes with a counter bump, because
  rules cannot enforce atomicity across two documents. A client that skips
  `src/data/tasks.ts`'s `writeBatch` and creates a task directly breaks the
  cap. App Check raises the bar (real app origin, real browser, no
  automation) but does not close it. This is accepted until someone actually
  pays for pro — see issue #35 for the plan to harden it with a `tasks`
  onCreate Cloud Function next to `functions/billing-guard`.
- `taskCount` is a cache, like `balances`: rebuild it with
  `scripts/recalc-task-counts.ts` rather than trusting it as truth.

### Design language

One colour axis with three values (`hiru` / `yoru` / `matsuri`) on
`documentElement.dataset.theme`, and a separate motion axis
(`data-motion="full" | "calm"`). Colour slots carry fixed meaning and nothing
else. Shadows and glows are written `calc(Npx * var(--glow))`; no raw hex or
rgba outside the `:root` blocks in `src/index.css`.

Any new effect must be dead under all three of: `data-motion="calm"`,
`prefers-reduced-motion: reduce`, and a `--fx` of 0 — and must leave nothing
frozen on screen when it is stopped. `EffectsProvider` reads the resolved `--fx`
and declines before mounting a node, so components never check reduced motion
themselves.

### Language

Anything a user reads is Japanese, written for a family that includes young
children: short, kind, kana-leaning, no jargon. Code, identifiers, comments,
commit messages and PR text are English. Comments explain why, not what.

### Vercel previews and Firebase authorized domains

Firebase Auth refuses to sign anyone in from a hostname that is not on the
project's authorized-domains list, and that list takes exact hostnames — the
two production aliases are on it as two separate entries, which is what
proves there is no wildcard or parent-domain matching to lean on. Vercel
gives every branch its own preview hostname, so previews and that list are
structurally at odds: a fresh branch is a fresh hostname nobody authorized.

The way out is one hostname that never changes:

```sh
vercel alias set <deployment-url> tsumiki-preview.vercel.app
```

`tsumiki-preview.vercel.app` is already on the authorized-domains list.
Re-point it at whichever deployment you want to test and sign-in works —
**never add a per-branch preview hostname to Firebase**, or the list grows a
dead entry per merged branch and every entry is a domain allowed to start an
auth flow for this project.

Two things that look like this problem and are not:

- **A preview 302s to `vercel.com/sso-api`.** That is Vercel Deployment
  Protection, which sits in front of the app and has nothing to do with
  Firebase. A browser signed in to Vercel passes it without noticing; `curl`
  and a phone that has never seen Vercel do not. Do not diagnose an auth
  failure from a `curl` that never reached the app.
- **Proxying `/__/auth/**` to the Firebase auth domain.** That trick is for
  third-party-cookie breakage in `signInWithRedirect`. It does not lift the
  authorized-domain requirement, so it is not a substitute for the alias.
  (The `navigateFallbackDenylist` entry for `/__/auth` in `vite.config.ts`
  exists so the service worker never answers that path from cache, which is
  a different concern again.)

### What actually reviews a PR here

The kata block above describes a PR passing under two review bots. Only one
of them runs:

- **CodeRabbit does not review this repo automatically** — its OSS plan skips
  repositories under 10 stars. The "🔍 Trigger review" checkbox on its comment
  is consumed when ticked (the box resets) without producing a review, so
  treat CodeRabbit the way the rate-limit exception says to: it has posted no
  findings, there is nothing to address, and it is not a merge blocker.
- **claude-review needs `CLAUDE_CODE_OAUTH_TOKEN` as a repository secret.**
  Installing the Claude GitHub App account-wide is a different layer and does
  not supply it: Actions secrets exist at repo, environment and organization
  scope only, and `yukimemi` is a personal account, so there is no shared
  scope to inherit from. Every new repo needs its own `gh secret set`. The
  token expires, and the job fails in about four seconds when it is missing
  or dead — a fast red `review` is a credentials problem, not a review that
  found something.

Which leaves Claude's review plus `ci` as the real gate, and the owner's
approval on top of it.
