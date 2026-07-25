"use client";

import { useState } from "react";

export type BookingRequestFormCopy = {
  name: string;
  email: string;
  phone: string;
  when: string;
  partySize: string;
  notes: string;
  optional: string;
  submit: string;
  sending: string;
  success: string;
  error: string;
  previewNotice: string;
};

type BookingRequestFormProps = {
  slug: string;
  copy: BookingRequestFormCopy;
  embedded?: boolean;
};

const fieldClassName =
  "w-full rounded-xl border border-current/20 bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-50 focus:border-current/45";

const labelClassName =
  "flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] opacity-70";

/**
 * The fallback booking surface: a site with no provider to embed still has to be
 * able to take a request. It posts to the public endpoint, which meters and
 * validates it — this component's own validation is only there to spare the
 * visitor a round trip.
 *
 * In `embedded` mode (our claim preview) the form renders but cannot submit. The
 * preview is a sales pitch shown to a prospect who has not claimed the site;
 * letting it create real `BookingRequest` rows would mean our own marketing page
 * generating leads the owner never sees.
 */
export function BookingRequestForm({
  slug,
  copy,
  embedded = false,
}: BookingRequestFormProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (embedded || status === "sending") return;

    const form = new FormData(event.currentTarget);
    const read = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" && value.trim() ? value.trim() : undefined;
    };
    const partySize = read("partySize");
    const requestedAt = read("requestedAt");

    setStatus("sending");
    setError(null);
    try {
      const response = await fetch(
        `/api/sites/${encodeURIComponent(slug)}/booking-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: read("name"),
            email: read("email"),
            phone: read("phone"),
            notes: read("notes"),
            // `datetime-local` yields no timezone, so it is sent as the visitor
            // typed it and read as local time by the server.
            requestedAt,
            partySize: partySize ? Number(partySize) : undefined,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setError(payload?.error ?? copy.error);
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError(copy.error);
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <p className="rounded-2xl border border-current/15 px-5 py-6 text-sm opacity-80">
        {copy.success}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClassName}>
          {copy.name}
          <input
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            className={fieldClassName}
          />
        </label>
        <label className={labelClassName}>
          {copy.email}
          <input
            name="email"
            type="email"
            maxLength={180}
            autoComplete="email"
            className={fieldClassName}
          />
        </label>
        <label className={labelClassName}>
          {copy.phone}
          <input
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            className={fieldClassName}
          />
        </label>
        <label className={labelClassName}>
          {copy.when}
          <input
            name="requestedAt"
            type="datetime-local"
            className={fieldClassName}
          />
        </label>
        <label className={labelClassName}>
          {copy.partySize}
          <input
            name="partySize"
            type="number"
            min={1}
            max={200}
            className={fieldClassName}
          />
        </label>
      </div>
      <label className={labelClassName}>
        <span>
          {copy.notes}{" "}
          <span className="font-normal normal-case tracking-normal opacity-60">
            ({copy.optional})
          </span>
        </span>
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          className={fieldClassName}
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm font-medium opacity-90">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={embedded || status === "sending"}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--site-accent)" }}
        >
          {status === "sending" ? copy.sending : copy.submit}
        </button>
        {embedded ? (
          <span className="text-xs opacity-60">{copy.previewNotice}</span>
        ) : null}
      </div>
    </form>
  );
}
