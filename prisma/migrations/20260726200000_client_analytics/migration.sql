-- First-party, cookieless conversion events. Privacy-sensitive request data
-- cannot drift into this table because the schema has no IP, user-agent,
-- referrer, URL, query-string, provider-link, metadata, or contact columns.
CREATE TYPE "AnalyticsEventType" AS ENUM (
  'SITE_VIEW',
  'CTA_CLICK',
  'LEAD_CREATED'
);

CREATE TABLE "AnalyticsEvent" (
  "id" UUID NOT NULL,
  "visitId" UUID NOT NULL,
  "type" "AnalyticsEventType" NOT NULL,
  "siteId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_siteId_occurredAt_type_idx"
ON "AnalyticsEvent"("siteId", "occurredAt", "type");

CREATE INDEX "AnalyticsEvent_occurredAt_idx"
ON "AnalyticsEvent"("occurredAt");

ALTER TABLE "AnalyticsEvent"
ADD CONSTRAINT "AnalyticsEvent_siteId_fkey"
FOREIGN KEY ("siteId")
REFERENCES "Site"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
