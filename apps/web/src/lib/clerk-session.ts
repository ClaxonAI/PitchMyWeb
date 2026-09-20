const EXCHANGE_ATTEMPTS = 5;
const EXCHANGE_DELAY_MS = 300;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/**
 * Trades the caller's Clerk session for the app's own `pmw_session` cookie
 * (POST /api/auth/clerk/session). Every page that sends a Clerk-signed-in user
 * to the dashboard must go through this first: the dashboard only checks the
 * app cookie, so a Clerk session on its own bounces back to /login.
 *
 * Retries briefly because the Clerk token can lag right after an OAuth
 * callback. Resolves false (never throws) so callers can show an error
 * instead of redirecting into a loop.
 */
export async function exchangeClerkSession(getToken: () => Promise<string | null>): Promise<boolean> {
  for (let attempt = 0; attempt < EXCHANGE_ATTEMPTS; attempt += 1) {
    try {
      const token = await getToken();
      if (token) {
        const response = await fetch("/api/auth/clerk/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "same-origin",
          cache: "no-store",
        });
        if (response.ok) return true;
        // A suspended account or missing email will not fix itself on retry.
        if (response.status === 403 || response.status === 400) return false;
      }
    } catch {
      // network blip: fall through to retry
    }
    if (attempt < EXCHANGE_ATTEMPTS - 1) await wait(EXCHANGE_DELAY_MS);
  }
  return false;
}
