import { safeNextPath } from "./safe-next";

// Where the visitor wants to end up (?next=) and which paid order they are
// claiming (?orderId=). Both live in the URL for the email form, but a Google
// or GitHub sign-in leaves the site and comes back via Clerk, which drops the
// query string — so they are also parked in sessionStorage for that trip.

const KEY = "pmw_sign_in_intent";

export type SignInIntent = { next: string | null; orderId: string | null };

function clean(orderId: string | null | undefined): string | null {
  return orderId && /^[A-Za-z0-9_-]{8,64}$/.test(orderId) ? orderId : null;
}

/** From the current URL, falling back to what was parked before an OAuth trip. */
export function readSignInIntent(): SignInIntent {
  const params = new URLSearchParams(window.location.search);
  let parked: Partial<SignInIntent> = {};
  try {
    parked = JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}") as Partial<SignInIntent>;
  } catch {
    parked = {};
  }
  return {
    next: safeNextPath(params.get("next")) ?? safeNextPath(parked.next),
    orderId: clean(params.get("orderId")) ?? clean(parked.orderId),
  };
}

export function parkSignInIntent(intent: SignInIntent): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    // Private mode: the visitor lands on the dashboard instead; nothing breaks.
  }
}

export function clearSignInIntent(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
