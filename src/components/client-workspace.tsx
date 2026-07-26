"use client";

import { useState } from "react";
import { Check, LoaderCircle, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AnalyticsSummaryDto,
  AnalyticsWindowDays,
} from "@/lib/analytics-contract";
import type { BookingRequestInboxDto } from "@/lib/booking-request-inbox";

export function ClientAnalyticsPanel({
  summary,
}: {
  summary: AnalyticsSummaryDto;
}) {
  const [days, setDays] = useState<AnalyticsWindowDays>(30);
  const metrics =
    summary.windows.find((window) => window.days === days) ??
    summary.windows[0];

  if (!metrics) return null;

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Live-site analytics
          </p>
          <h2 className="font-display mt-2 text-4xl tracking-[-0.04em]">
            Traffic that turns into customers.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Cookieless counts from your verified customer domain. Factory and
            preview traffic is excluded.
          </p>
        </div>
        <div className="flex rounded-lg border bg-background p-1">
          {summary.windows.map((window) => (
            <button
              key={window.days}
              type="button"
              onClick={() => setDays(window.days)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                days === window.days
                  ? "bg-foreground text-background"
                  : "text-muted-foreground"
              }`}
            >
              {window.days} days
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetric
          label="Visits"
          value={formatInteger(metrics.visits)}
          detail="Distinct live-site visits"
        />
        <AnalyticsMetric
          label="CTA visitors"
          value={formatInteger(metrics.ctaVisitors)}
          detail={`${formatPercent(metrics.ctaRate)} of visits`}
        />
        <AnalyticsMetric
          label="Live booking leads"
          value={formatInteger(metrics.bookingLeads)}
          detail="Submitted on the live domain"
        />
        <AnalyticsMetric
          label="Lead conversion"
          value={formatPercent(metrics.leadRate)}
          detail="Booking leads ÷ visits"
        />
      </div>
    </div>
  );
}

export function ClientBookingRequestInbox({
  siteSlug,
  initialInbox,
  demo,
}: {
  siteSlug: string;
  initialInbox: BookingRequestInboxDto;
  demo: boolean;
}) {
  const [requests, setRequests] = useState(initialInbox.requests);
  const [awaitingContact, setAwaitingContact] = useState(
    initialInbox.awaitingContact,
  );
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(
    requestId: string,
    status: "CONTACTED" | "CLOSED",
  ) {
    if (demo) return;
    setUpdating(requestId);
    setError(null);
    try {
      const response = await fetch(
        `/api/sites/${encodeURIComponent(siteSlug)}/booking-requests/${encodeURIComponent(requestId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) throw new Error("Status update failed");
      const previous = requests.find((request) => request.id === requestId);
      setRequests((current) =>
        current.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status,
                updatedAt: new Date().toISOString(),
              }
            : request,
        ),
      );
      if (
        previous?.status === "NEW" ||
        previous?.status === "NOTIFIED"
      ) {
        setAwaitingContact((current) => Math.max(0, current - 1));
      }
    } catch {
      setError("The lead status could not be updated. Please try again.");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Lead inbox
          </p>
          <h2 className="font-display mt-2 text-4xl tracking-[-0.04em]">
            Booking requests in one place.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Contact details stay inside your workspace and are never copied into
            analytics events.
          </p>
        </div>
        <Badge variant={awaitingContact > 0 ? "secondary" : "outline"}>
          {awaitingContact} awaiting contact
        </Badge>
      </div>
      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {initialInbox.truncated ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Showing the latest {requests.length} of {initialInbox.total} requests.
          The awaiting-contact count includes the full inbox.
        </p>
      ) : null}

      <div className="mt-8 space-y-4">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>{request.name}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Received {formatDateTime(request.createdAt)}
                </p>
              </div>
              <Badge variant="outline">{humanize(request.status)}</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 lg:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-2 text-sm">
                  {request.email ? (
                    <a
                      href={`mailto:${request.email}`}
                      className="flex items-center gap-2 font-medium"
                    >
                      <Mail className="size-4 text-muted-foreground" />
                      {request.email}
                    </a>
                  ) : null}
                  {request.phone ? (
                    <a
                      href={`tel:${request.phone}`}
                      className="flex items-center gap-2 font-medium"
                    >
                      <Phone className="size-4 text-muted-foreground" />
                      {request.phone}
                    </a>
                  ) : null}
                  {request.requestedAt ? (
                    <p className="text-muted-foreground">
                      Preferred time: {formatDateTime(request.requestedAt)}
                    </p>
                  ) : null}
                  {request.partySize ? (
                    <p className="text-muted-foreground">
                      Party of {request.partySize}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {request.notes || "No additional notes."}
                </p>
                <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                  {request.status !== "CONTACTED" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updating === request.id || demo}
                      onClick={() =>
                        void updateStatus(request.id, "CONTACTED")
                      }
                    >
                      {updating === request.id ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Check />
                      )}
                      Contacted
                    </Button>
                  ) : null}
                  {request.status !== "CLOSED" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updating === request.id || demo}
                      onClick={() => void updateStatus(request.id, "CLOSED")}
                    >
                      Close
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updating === request.id || demo}
                      onClick={() =>
                        void updateStatus(request.id, "CONTACTED")
                      }
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="font-medium">No booking requests yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                New first-party requests will appear here immediately.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function AnalyticsMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="pt-1">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-5 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (character) => character.toUpperCase());
}
