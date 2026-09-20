-- CreateIndex
CREATE INDEX "activities_type_leadId_idx" ON "activities"("type", "leadId");

-- CreateIndex
CREATE INDEX "deals_status_idx" ON "deals"("status");
