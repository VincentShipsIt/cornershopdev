import { z } from "zod";
import { Vertical } from "@/generated/prisma/enums";

/**
 * Shared with `POST /api/admin/leads/batch` so its request validation is
 * covered by unit tests without importing a route handler (Next.js route
 * files only export HTTP method handlers and route config, not helpers).
 */
export const leadBatchItemSchema = z.object({
  source: z.string().trim().min(2).max(500),
  vertical: z.enum(Vertical).default(Vertical.RESTAURANT),
  contactEmail: z.string().trim().email().max(320).optional(),
});

export const leadBatchRequestSchema = z.object({
  leads: z.array(leadBatchItemSchema).min(1).max(20),
  sendEmail: z.boolean().default(true),
  followUpDelayHours: z
    .number()
    .int()
    .positive()
    .max(24 * 30)
    .optional(),
});

export type LeadBatchRequest = z.infer<typeof leadBatchRequestSchema>;
