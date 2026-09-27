import { sendEmail, type SendEmailDeps, type SendEmailResult } from "./email.service";
import { renderPasswordChanged, renderPasswordResetCode } from "./templates/password-reset";
import { CODE_TTL_MINUTES } from "../auth/password-reset";

// The two emails of a password reset (lib/auth/password-reset.ts). The code
// email is sent in the request, not after it: a code that failed to send has
// to be reported to the logs straight away, and the reply to the browser is
// the same either way.

export function sendResetCodeEmail(to: string, code: string, userId: string, deps: SendEmailDeps = {}): Promise<SendEmailResult> {
  return sendEmail({ to, category: "password_reset_code", content: renderPasswordResetCode({ code, minutes: CODE_TTL_MINUTES }), referenceId: userId, userId }, deps);
}

export function sendPasswordChangedEmail(to: string, userId: string, deps: SendEmailDeps & { env?: Record<string, string | undefined> } = {}): Promise<SendEmailResult> {
  const appUrl = (deps.env ?? process.env).APP_URL?.trim() || "https://pitchmyweb.in";
  return sendEmail({ to, category: "password_changed", content: renderPasswordChanged({ appUrl, when: new Date() }), referenceId: userId, userId }, deps);
}
