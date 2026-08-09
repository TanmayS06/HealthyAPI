-- CreateIndex
-- Enforce at most one active (OPEN or ACKNOWLEDGED) incident per monitor at database level
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_incident_per_monitor" 
ON "incidents" ("monitorId") 
WHERE "status" IN ('OPEN', 'ACKNOWLEDGED');
