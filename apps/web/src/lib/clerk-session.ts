import { deviceFingerprint } from "./device-fingerprint";

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
 * instead of redirecting into a loop, or a message to show as-is when the API
 * refused for a reason the user can act on (the per-device account limit).
 *
 * Sends the device fingerprint so a Google/GitHub sign-up counts against the
 * same three-accounts-per-device limit as email sign-up, and the paid order
 * being claimed (if any) so it is attached whatever email the payment used.
 */
export async function exchangeClerkSession(
  getToken: () => Promise<string | null>,
  orderId?: string | null,
): Promise<true | false | { message: string }> {
  const fingerprint = await deviceFingerprint();
  for (let attempt = 0; attempt < EXCHANGE_ATTEMPTS; attempt += 1) {
    try {
      const token = await getToken();
      if (token) {
        const response = await fetch("/api/auth/clerk/session", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(fingerprint ? { "X-Device-Fingerprint": fingerprint } : {}),
          },
          // A paid order to attach to this account, as email sign-in does.
          body: JSON.stringify(orderId ? { orderId } : {}),
          credentials: "same-origin",
          cache: "no-store",
        });
        if (response.ok) return true;
        if (response.status === 409) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          return { message: body?.error ?? "This device has reached its account limit. Sign in to an existing account instead." };
        }
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
