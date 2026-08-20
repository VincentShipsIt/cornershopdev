-- Additive enum expansion only. Existing sites and integrations retain their
-- current values; no row is rewritten as part of registering LOCAL_SERVICE.
ALTER TYPE "Vertical" ADD VALUE 'LOCAL_SERVICE';
ALTER TYPE "IntegrationType" ADD VALUE 'QUOTE' BEFORE 'ANALYTICS';
ALTER TYPE "IntegrationType" ADD VALUE 'CONTACT' BEFORE 'ANALYTICS';
