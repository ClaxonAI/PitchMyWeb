import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../db/client";
import type { EmailConfigResult } from "./config";
import { resetEmailReportingForTesting } from "./email.service";
import type { EmailTransport } from "./transport";
import { createTestUser, deleteTestUsers } from "../testing/db-test-helpers";
import { sendWelcomeEmail } from "./welcome";
import { renderPasswordResetCode } from "./templates/password-reset";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});
beforeEach(() => resetEmailReportingForTesting());

const config: EmailConfigResult = { ok: true, config: { apiKey: "test-resend-key-not-real", from: "PitchMyWeb <no-reply@pitchmyweb.in>", replyTo: null } };

describe("sendWelcomeEmail", () => {
  it("welcomes an account once, mentioning its free pitches", async () => {
    const user = await createTestUser("welcome");
    createdUserIds.push(user.id);
    const transport = vi.fn<EmailTransport>(async () => ({ id: "email_1" }));
    const deps = { config, transport, sleep: async () => {}, env: { APP_URL: "https://pitchmyweb.in" } };

    expect(await sendWelcomeEmail(prisma, user.id, deps)).toBe("sent");
    expect(await sendWelcomeEmail(prisma, user.id, deps)).toBe("already_sent");
    expect(transport).toHaveBeenCalledTimes(1);
    const email = transport.mock.calls[0]![0];
    expect(email.to).toBe(user.email);
    expect(email.subject).toContain("5 free pitches");
    expect(email.html).toContain("https://pitchmyweb.in/campaigns/new");
  });

  it("releases the claim when the send fails, so the next try sends", async () => {
    const user = await createTestUser("welcome-fail", { verified: false });
    createdUserIds.push(user.id);
    const transport = vi.fn<EmailTransport>(async () => ({ error: { name: "validation_error", statusCode: 422 } }));
    expect(await sendWelcomeEmail(prisma, user.id, { config, transport, sleep: async () => {} })).toBe("failed");
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.welcomeEmailSentAt).toBeNull();
  });
});

describe("renderPasswordResetCode", () => {
  it("shows the code in the subject and body, with no link that resets anything", () => {
    const email = renderPasswordResetCode({ code: "042917", minutes: 10 });
    expect(email.subject).toBe("042 917 is your PitchMyWeb reset code");
    expect(email.text).toContain("042 917");
    expect(email.html).not.toMatch(/href="[^"]*reset/i);
  });
});
