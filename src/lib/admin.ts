// Global admin: one hand-maintained email allowlist, matched in
// `firestore.rules` (`isAdmin()`) and here. There is no household-scoped
// role for this — it sits above every family, which is why it lives here
// instead of `Role` in `src/types.ts`.
//
// Adding a name means editing both this array and the matching literal in
// firestore.rules and redeploying rules (`pnpm rules:deploy`); the two lists
// are not read from a shared source because rules cannot import TypeScript.
const ADMIN_EMAILS: readonly string[] = ["yukimemi@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
