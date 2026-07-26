import { z } from "zod";

const accountEmailSchema = z
  .string()
  .trim()
  .pipe(z.email())
  .transform((email) => email.toLowerCase());

/**
 * PostgreSQL's text uniqueness is case-sensitive, so every account read and
 * write must use the same canonical representation.
 */
export function normalizeAccountEmail(email: string): string {
  return accountEmailSchema.parse(email);
}
