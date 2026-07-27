-- Every owner save advances a monotonic private-draft revision. Published
-- versions remain immutable SiteVersion rows; this revision makes pre-publish
-- edits independently auditable without pretending they are live releases.
ALTER TABLE "Site"
ADD COLUMN "draftRevision" INTEGER NOT NULL DEFAULT 0;
