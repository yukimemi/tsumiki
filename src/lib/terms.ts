// Bumping this forces every signed-in user, new or existing, to see
// TermsScreen again on next load — src/auth/TermsGate.tsx compares it
// against UserDoc.termsVersion. Bump only on a substantive change to
// docs/terms.md, not wording fixes.
export const CURRENT_TERMS_VERSION = 1;
