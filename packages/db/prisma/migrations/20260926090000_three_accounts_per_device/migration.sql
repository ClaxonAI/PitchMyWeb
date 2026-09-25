-- Up to three accounts may now be created from one device, so a device's
-- hashed fingerprint is no longer unique across accounts. Each account still
-- records only its first device (userId stays unique). Existing rows are one
-- account per device, so nothing needs rewriting.
--
-- NOTE: as with every migration here, the gin_trgm_ops indexes on
-- businesses are left alone even though `prisma migrate dev` proposes
-- dropping them (they are not expressible in schema.prisma).

-- DropIndex
DROP INDEX "trial_devices_visitorIdHash_key";

-- CreateIndex
CREATE INDEX "trial_devices_visitorIdHash_idx" ON "trial_devices"("visitorIdHash");
