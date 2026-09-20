ALTER TABLE "orders" ADD COLUMN "payerEmail" TEXT;

CREATE INDEX "orders_payerEmail_idx" ON "orders"("payerEmail");
