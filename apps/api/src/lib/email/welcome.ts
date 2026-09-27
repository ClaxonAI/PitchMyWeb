import type { PrismaClient } from "@pitchmyweb/db";
import { FREE_PITCH_ALLOWANCE } from "../checkout/paid-access";
import { readEmailConfig } from "./config";
import { reportEmailSkipped, sendEmail, type SendEmailDeps } from "./email.service";
import { renderWelcome } from "./templates/welcome";

// The welcome email, once per account. Called after an account is created
// (password sign-up, Google, Clerk), after the response has gone out. The
// send is claimed first on welcomeEmailSentAt, like the payment receipt, and
// released if it fails; Resend's idempotency key covers a send that went
// through but looked failed. Accounts from before this existed were marked
// sent by the migration, so they're never welcomed late.

export type WelcomeOutcome = "sent" | "already_sent" | "not_found" | "not_configured" | "failed";

export async function sendWelcomeEmail(
  db: PrismaClient,
  userId: string,
  deps: SendEmailDeps & { env?: Record<string, string | undefined> } = {},
): Promise<WelcomeOutcome> {
  const env = deps.env ?? process.env;
  const config = deps.config ?? readEmailConfig(env);
  if (!config.ok) {
    reportEmailSkipped("welcome", config.reason, { userId });
    return "not_configured";
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailVerifiedAt: true, welcomeEmailSentAt: true } });
  if (!user) return "not_found";
  if (user.welcomeEmailSentAt) return "already_sent";

  const claimed = await db.user.updateMany({ where: { id: userId, welcomeEmailSentAt: null }, data: { welcomeEmailSentAt: new Date() } });
  if (claimed.count === 0) return "already_sent";

  const content = renderWelcome({
    name: user.name,
    // Free pitches come with a verified email (wallet.service.ts's ensureFreeGrant).
    freePitches: user.emailVerifiedAt ? FREE_PITCH_ALLOWANCE : 0,
    appUrl: env.APP_URL?.trim() || "https://pitchmyweb.in",
  });
  const result = await sendEmail(
    { to: user.email, category: "welcome", content, idempotencyKey: `welcome/${userId}`, referenceId: userId, userId },
    { ...deps, config },
  );
  if (result.status === "sent") return "sent";
  await db.user.updateMany({ where: { id: userId }, data: { welcomeEmailSentAt: null } });
  return "failed";
}
