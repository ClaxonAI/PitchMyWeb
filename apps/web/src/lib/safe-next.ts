// The page to return to after signing in, taken from ?next=. Only a path on
// this site is accepted — never another origin ("//evil.test", "/\\evil.test",
// "https://…"), so the parameter cannot be used to bounce someone elsewhere —
// and never the sign-in pages themselves, which would loop. Runs in the
// middleware too, so it uses nothing Node-only.

const NOT_A_DESTINATION = new Set(["/login", "/register", "/logout", "/sso-callback"]);
const BASE = "http://pmw.invalid";

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 512 || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE || NOT_A_DESTINATION.has(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Where to go after signing in: the requested page, or the dashboard. */
export function afterSignIn(raw: string | null | undefined): string {
  return safeNextPath(raw) ?? "/dashboard";
}
