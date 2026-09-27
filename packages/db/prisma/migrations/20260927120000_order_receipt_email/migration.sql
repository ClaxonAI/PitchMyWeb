-- Payment confirmation email per order (apps/api lib/checkout/order-receipt.ts).
ALTER TABLE "orders" ADD COLUMN "receiptEmailSentAt" TIMESTAMP(3),
                     ADD COLUMN "receiptEmailId" TEXT;

-- Orders paid before this existed never get one: a late webhook redelivery
-- for an old order must not email its buyer out of the blue.
UPDATE "orders" SET "receiptEmailSentAt" = "updatedAt" WHERE "status" = 'PAID';
