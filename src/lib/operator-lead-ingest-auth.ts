import { createHash, timingSafeEqual } from "node:crypto";

export const OPERATOR_LEAD_INGEST_ACTOR = "operator:ingest-token";

export function isOperatorLeadIngestAuthorized(
  request: Request,
  tokens: {
    ingestToken?: string | null;
    healthcheckToken?: string | null;
  } = {
    ingestToken: process.env.OPERATOR_LEAD_INGEST_TOKEN,
    healthcheckToken: process.env.HEALTHCHECK_TOKEN,
  },
): boolean {
  const ingestToken = tokens.ingestToken?.trim() ?? "";
  const healthcheckToken = tokens.healthcheckToken?.trim() ?? "";
  if (!ingestToken) return false;
  if (healthcheckToken && ingestToken === healthcheckToken) return false;

  const authorization = request.headers.get("authorization");
  const suppliedToken = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!suppliedToken) return false;

  const suppliedHash = createHash("sha256").update(suppliedToken).digest();
  const expectedHash = createHash("sha256").update(ingestToken).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}
