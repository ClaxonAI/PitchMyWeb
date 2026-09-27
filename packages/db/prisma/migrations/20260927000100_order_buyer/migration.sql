-- The signed-in visitor who started a checkout (see Order.buyerId).
ALTER TABLE "orders" ADD COLUMN "buyerId" TEXT;
