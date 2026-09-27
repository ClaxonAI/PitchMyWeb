-- Welcome email, once per account (apps/api lib/email/welcome.ts).
ALTER TABLE "users" ADD COLUMN "welcomeEmailSentAt" TIMESTAMP(3);

-- Accounts that existed before welcome emails were sent are never welcomed
-- out of the blue on their next sign-in.
UPDATE "users" SET "welcomeEmailSentAt" = "createdAt";

-- Password reset by emailed code (apps/api lib/auth/password-reset.ts).
CREATE TABLE "password_reset_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "resetTokenHash" TEXT,
    "resetTokenExpiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_codes_resetTokenHash_key" ON "password_reset_codes"("resetTokenHash");
CREATE INDEX "password_reset_codes_userId_createdAt_idx" ON "password_reset_codes"("userId", "createdAt");

ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
