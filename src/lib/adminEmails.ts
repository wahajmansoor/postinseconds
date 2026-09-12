// Split out of auth.tsx so server-only code (src/lib/stripe.ts) can reuse
// the exact same admin-email check without statically importing auth.tsx
// itself (which pulls in React context + Capacitor/native-auth
// dependencies that have no business in a server function module).
// checkUserProStatusServerFn in stripe.ts used to have its OWN, separately
// (and incorrectly) written copy of this check using `.includes(...)`
// instead of an exact match — see that function's own comment for the bug
// that caused. There is now exactly one admin-email check in the app.
export const DEFAULT_ADMIN_EMAILS = ["buildinseconds@gmail.com"];

export function isEmailAdmin(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (DEFAULT_ADMIN_EMAILS.some((adm) => adm.toLowerCase() === normalized)) return true;

  const envAdmins =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.["VITE_ADMIN_EMAILS"]) || "";
  if (envAdmins) {
    const list = envAdmins.split(",").map((e: string) => e.trim().toLowerCase());
    if (list.includes(normalized)) return true;
  }
  return false;
}
