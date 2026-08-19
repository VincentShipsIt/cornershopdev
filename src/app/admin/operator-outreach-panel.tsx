"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OperatorSiteRow } from "@/lib/operator-dashboard";

type Props = Pick<
  OperatorSiteRow,
  | "slug"
  | "contactEmail"
  | "outreachMessages"
  | "outreachDispatch"
  | "reviewedAt"
> & { outreachPaused: boolean };

export function OperatorOutreachPanel({
  slug,
  contactEmail,
  outreachMessages,
  outreachDispatch,
  reviewedAt,
  outreachPaused,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = outreachMessages.find(
    (message) => message.template === "preview_ready",
  );
  async function sendInitial() {
    if (!contactEmail) return;
    if (
      !window.confirm(
        `Send the reviewed Restofront preview to ${contactEmail}? This queues one initial email and a pauseable follow-up.`,
      )
    ) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/leads/${encodeURIComponent(slug)}/outreach`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send_initial",
            recipient: contactEmail,
            reviewedAt: new Date(reviewedAt!).toISOString(),
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Outreach could not be queued.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Outreach could not be queued.",
      );
    } finally {
      setPending(false);
    }
  }

  const retryableInitial =
    initial?.status === "FAILED" && initial.retryable === true;
  const retryableDispatch = outreachDispatch?.retryable === true;
  const disabled =
    pending ||
    outreachPaused ||
    !contactEmail ||
    !reviewedAt ||
    (Boolean(initial) && !retryableInitial) ||
    (Boolean(outreachDispatch) && !retryableDispatch);
  const label = retryableInitial
    ? "Retry initial"
    : initial
      ? `Initial ${humanize(initial.status)}`
      : outreachPaused
        ? "Outreach paused"
        : !reviewedAt
          ? "Review first"
          : !contactEmail
            ? "Email required"
            : retryableDispatch
              ? "Retry initial"
              : outreachDispatch
                ? `Initial ${humanize(outreachDispatch.status)}`
                : "Send initial";

  return (
    <div className="min-w-72 space-y-2">
      <p className="text-[11px] text-muted-foreground">
        {contactEmail ?? "No contact email"}
      </p>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => void sendInitial()}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <Send />}
        {pending ? "Queueing…" : label}
      </Button>
      <div aria-live="polite">
        {error ? (
          <p className="text-[11px] text-destructive">{error}</p>
        ) : null}
      </div>
      {!initial && outreachDispatch ? (
        <div className="rounded-md border px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium">Initial dispatch</span>
            <Badge variant={statusVariant(outreachDispatch.status)}>
              {humanize(outreachDispatch.status)}
            </Badge>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {formatDate(outreachDispatch.updatedAt)}
          </p>
          {outreachDispatch.error ? (
            <p className="mt-1 line-clamp-2 text-[10px] text-destructive">
              {outreachDispatch.error}
            </p>
          ) : null}
        </div>
      ) : null}
      {outreachMessages.length > 0 ? (
        <ol className="space-y-1.5" aria-label={`Outreach history for ${slug}`}>
          {outreachMessages.map((message) => (
            <li key={message.id} className="rounded-md border px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium">
                  {humanize(message.template ?? message.direction)}
                </span>
                <Badge variant={statusVariant(message.status)}>
                  {humanize(message.status)}
                </Badge>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {formatDate(
                  message.deliveredAt ?? message.sentAt ?? message.createdAt,
                )}
              </p>
              {message.error ? (
                <p className="mt-1 line-clamp-2 text-[10px] text-destructive">
                  {message.error}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[11px] leading-5 text-muted-foreground">
          {outreachDispatch
            ? "No provider message yet. The dispatch state above survives refresh."
            : "No outreach yet. Sending stays locked until the current preview is marked reviewed."}
        </p>
      )}
    </div>
  );
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (character) => character.toUpperCase());
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusVariant(status: string): "secondary" | "outline" | "destructive" {
  if (status === "DELIVERED" || status === "SENT") return "secondary";
  if (status === "FAILED" || status === "BOUNCED" || status === "COMPLAINED") {
    return "destructive";
  }
  return "outline";
}
