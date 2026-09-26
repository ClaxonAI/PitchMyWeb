import { safeNextPath } from "./safe-next";

// Where the visitor wants to end up (?next=) and which paid order they are
// claiming (?orderId=). Both live in the URL for the email form, but a Google
// or GitHub sign-in leaves the site and comes back via Clerk, which drops the
// query string — so they are also parked in sessionStorage for that trip.

const KEY = "pmw_sign_in_intent";

/** Where every Google/GitHub round trip comes back to; see (auth)/layout.tsx. */
export const CLERK_RETURN = "/login";

// How long after leaving for Google/GitHub a return still counts as one.
const RETURN_WINDOW_MS = 15 * 60 * 1000;

export type SignInIntent = { next: string | null; orderId: string | null };
type Parked = Partial<SignInIntent> & { leftAt?: number };

function clean(orderId: string | null | undefined): string | null {
  return orderId && /^[A-Za-z0-9_-]{8,64}$/.test(orderId) ? orderId : null;
}

/** From the current URL, falling back to what was parked before an OAuth trip. */
export function readSignInIntent(): SignInIntent {
  const params = new URLSearchParams(window.location.search);
  const parked = readParked();
  return {
    next: safeNextPath(params.get("next")) ?? safeNextPath(parked.next),
    orderId: clean(params.get("orderId")) ?? clean(parked.orderId),
  };
}

function readParked(): Parked {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}") as Parked;
  } catch {
    return {};
  }
}

/** Whether this page load is the return from a Google/GitHub sign-in started here. */
export function isReturningFromProvider(): boolean {
  const { leftAt } = readParked();
  return typeof leftAt === "number" && Date.now() - leftAt < RETURN_WINDOW_MS;
}

/** Parked before leaving for Google/GitHub; Clerk drops our query string on the way back. */
export function parkSignInIntent(intent: SignInIntent): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...intent, leftAt: Date.now() } satisfies Parked));
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
