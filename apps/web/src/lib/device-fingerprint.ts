// The browser's FingerprintJS visitor id, loaded on demand and computed once
// per page. The API counts accounts created per device against it (up to
// three; apps/api lib/auth/trial-device.ts). Resolves null when the script is
// blocked or fails — sign-in must never depend on it.
let pending: Promise<string | null> | null = null;

export function deviceFingerprint(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  pending ??= import("@fingerprintjs/fingerprintjs")
    .then(({ default: FingerprintJS }) => FingerprintJS.load())
    .then((agent) => agent.get())
    .then((result) => result.visitorId)
    .catch(() => null);
  return pending;
}
