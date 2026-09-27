-- When a user's email was proven theirs (Google/GitHub sign-in).
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Accounts that have signed in with Google/GitHub already proved their address.
UPDATE "users" SET "emailVerifiedAt" = COALESCE("lastLoginAt", "createdAt") WHERE "googleId" IS NOT NULL;
