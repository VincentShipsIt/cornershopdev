import { z } from "zod";
import { getDb } from "@/lib/db";
import { getResend } from "@/lib/resend";

const YEAR_MS = 365 * 24 * 60 * 60_000;

/**
 * A preferred time is intent, not an appointment: it is whatever the visitor
 * picked in a `datetime-local` field, stored so the owner can call back at a
 * sensible hour. It is bounded to a plausible window purely so a malformed or
 * scripted submission cannot park a row in the year 3000 and skew the owner's
 * inbox ordering forever.
 */
const requestedAtSchema = z
  .string()
  .max(64)
  .refine((value) => {
    const parsed = Date.parse(value);
    return (
      Number.isFinite(parsed) &&
      parsed > Date.now() - 24 * 60 * 60_000 &&
      parsed < Date.now() + 2 * YEAR_MS
    );
  }, "Choose a time within the next two years")
  .transform((value) => new Date(value));

/**
 * The public booking-request payload. This is an unauthenticated write on a
 * customer-facing page, so every field is bounded and the only free text
 * (`notes`) is capped well below what would make an owner notification
 * unreadable. A request with no way to reply is worthless to the owner and
 * indistinguishable from noise, hence the contact requirement.
 */
export const bookingRequestInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(180).optional(),
    phone: z.string().trim().min(4).max(40).optional(),
    requestedAt: requestedAtSchema.optional(),
    partySize: z.number().int().min(1).max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Leave an email address or a phone number",
      });
    }
  });

export type BookingRequestInput = z.infer<typeof bookingRequestInputSchema>;

export type BookingRequestSite = {
  id: string;
  name: string;
  slug: string;
  organizationId: string | null;
};

export type CreatedBookingRequest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  requestedAt: Date | null;
  partySize: number | null;
  notes: string | null;
  createdAt: Date;
};

/**
 * Stores a request and its audit trail in one transaction. Notification is
 * deliberately *not* part of this: a Resend outage must not roll back a lead the
 * visitor believes they sent, and the row is the durable record either way.
 *
 * The audit metadata carries no contact details on purpose. `AuditEvent` is a
 * long-lived operational log read by tooling that has no business holding a
 * visitor's phone number; the `BookingRequest` row is the one place that data
 * lives, so it is also the one place that has to be deleted.
 */
export async function createBookingRequest(
  site: BookingRequestSite,
  input: BookingRequestInput,
  source = "site-form",
): Promise<CreatedBookingRequest> {
  const db = getDb();

  return db.$transaction(async (tx) => {
    const created = await tx.bookingRequest.create({
      data: {
        siteId: site.id,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        requestedAt: input.requestedAt ?? null,
        partySize: input.partySize ?? null,
        notes: input.notes ?? null,
        source,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        requestedAt: true,
        partySize: true,
        notes: true,
        createdAt: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        type: "booking_request.created",
        actor: "system:site-form",
        metadata: {
          bookingRequestId: created.id,
          source,
          hasEmail: Boolean(input.email),
          hasPhone: Boolean(input.phone),
        },
        siteId: site.id,
      },
    });

    return created;
  });
}

/**
 * Emails the request to whoever claimed the site, and records that it went out.
 *
 * Unclaimed sites are notified *nobody*, even though the importer usually found
 * a public contact address. Mailing that address would let any visitor to a
 * generated preview trigger unsolicited mail to a business that never signed up
 * — a cold-email cannon wearing our sending domain. The request is still stored,
 * so it is waiting in the dashboard the moment the owner claims the site.
 *
 * Returns whether a notification was actually sent. Failures are reported, not
 * thrown: the caller has already persisted the lead and must still answer the
 * visitor with a success.
 */
export async function notifyOwnerOfBookingRequest(
  site: BookingRequestSite,
  request: CreatedBookingRequest,
): Promise<boolean> {
  if (!site.organizationId) return false;
  if (!process.env.RESEND_API_KEY) return false;

  const db = getDb();
  const memberships = await db.membership.findMany({
    where: { organizationId: site.organizationId },
    select: { user: { select: { email: true } } },
  });
  const recipients = [
    ...new Set(memberships.map((membership) => membership.user.email)),
  ];
  if (recipients.length === 0) return false;

  const { error } = await getResend().emails.send(
    {
      from: process.env.EMAIL_FROM ?? "Cornershopdev <onboarding@resend.dev>",
      to: recipients,
      replyTo: request.email ?? undefined,
      subject: `New booking request for ${site.name}`,
      html: bookingRequestEmailHtml(site, request),
    },
    // One notification per request, no matter how many times a retry replays
    // this send.
    { headers: { "Idempotency-Key": `booking-request-${request.id}` } },
  );
  if (error) return false;

  await db.bookingRequest.update({
    where: { id: request.id },
    data: { status: "NOTIFIED", notifiedAt: new Date() },
  });
  return true;
}

/**
 * Every interpolated value here came from an anonymous form post, so all of it
 * is escaped. An owner's mail client renders this HTML with their session sitting
 * behind it; a visitor's "notes" field is not allowed to contribute markup.
 */
function bookingRequestEmailHtml(
  site: BookingRequestSite,
  request: CreatedBookingRequest,
): string {
  const rows: Array<[string, string]> = [["Name", request.name]];
  if (request.email) rows.push(["Email", request.email]);
  if (request.phone) rows.push(["Phone", request.phone]);
  if (request.requestedAt) {
    rows.push(["Preferred time", request.requestedAt.toUTCString()]);
  }
  if (request.partySize) rows.push(["Party size", String(request.partySize)]);
  if (request.notes) rows.push(["Notes", request.notes]);

  const body = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#7c6f61;font-size:13px">${escapeHtml(label)}</td><td style="padding:6px 0;color:#2f2a24;font-size:15px">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `<div style="font-family:Arial,sans-serif;background:#f4efe5;padding:40px">
  <div style="max-width:520px;margin:0 auto;background:#fffdf8;border-radius:16px;padding:32px">
    <p style="margin:0 0 8px;letter-spacing:0.18em;text-transform:uppercase;font-size:11px;color:#a5482d">CORNERSHOPDEV</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#2f2a24">New booking request</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#5c5147">Someone asked to book with ${escapeHtml(site.name)} through your website.</p>
    <table style="border-collapse:collapse">${body}</table>
    <p style="margin:24px 0 0;font-size:13px;color:#7c6f61">Reply to this email to answer them directly.</p>
  </div>
</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
