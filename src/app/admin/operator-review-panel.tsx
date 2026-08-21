"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OperatorSiteRow } from "@/lib/operator-dashboard";

type OperatorReviewPanelProps = Pick<
  OperatorSiteRow,
  "slug" | "reviewedAt" | "notes" | "contentReview" | "eligibility"
>;

export function OperatorReviewPanel({
  slug,
  reviewedAt,
  notes,
  contentReview,
  eligibility,
}: OperatorReviewPanelProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "add_note" | "complete_review" | "set_eligibility" | null
  >(null);
  const [eligibilityState, setEligibilityState] = useState(eligibility.state);
  const [eligibilityEvidence, setEligibilityEvidence] = useState(
    Object.entries(eligibility.evidence)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  const [error, setError] = useState<string | null>(null);

  async function mutate(action: "add_note" | "complete_review") {
    setPendingAction(action);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sites/${encodeURIComponent(slug)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note: note.trim() || null }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Review action failed.");
      }
      setNote("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Review action failed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function saveEligibility() {
    let evidence: Record<string, string>;
    try {
      evidence = parseEvidenceFields(eligibilityEvidence);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Check the evidence fields.",
      );
      return;
    }
    setPendingAction("set_eligibility");
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/sites/${encodeURIComponent(slug)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_eligibility",
            eligibility: eligibilityState,
            eligibilityEvidence: evidence,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Eligibility could not be saved.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Eligibility could not be saved.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  const heroLabel =
    contentReview.heroImage === "provenance_recorded"
      ? "image provenance recorded"
      : contentReview.heroImage === "provenance_missing"
        ? "image provenance missing"
        : "hero image missing";

  return (
    <div className="min-w-72 space-y-2">
      <p className="text-[11px] leading-5 text-muted-foreground">
        {contentReview.missingFields.length > 0
          ? `Missing: ${contentReview.missingFields.join(", ")}. `
          : "Core fields present. "}
        {heroLabel}. {contentReview.translationCount} translation
        {contentReview.translationCount === 1 ? "" : "s"},{" "}
        {contentReview.integrationCount} integration
        {contentReview.integrationCount === 1 ? "" : "s"},{" "}
        {contentReview.catalogItemCount} catalog item
        {contentReview.catalogItemCount === 1 ? "" : "s"}.
      </p>
      {notes[0] ? (
        <p className="rounded-md border bg-muted/30 px-2 py-1.5 text-[11px] leading-4">
          {notes[0].note}
        </p>
      ) : null}
      <Textarea
        aria-label={`Operator note for ${slug}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Private operator note"
        maxLength={2_000}
        className="min-h-16 text-xs"
      />
      <div className="grid gap-1.5 rounded-md border p-2">
        <label
          htmlFor={`eligibility-${slug}`}
          className="text-[11px] font-medium"
        >
          Operator eligibility
        </label>
        <select
          id={`eligibility-${slug}`}
          value={eligibilityState}
          onChange={(event) =>
            setEligibilityState(
              event.target.value as "UNKNOWN" | "ELIGIBLE" | "INELIGIBLE",
            )
          }
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          <option value="UNKNOWN">Unknown</option>
          <option value="ELIGIBLE">Eligible</option>
          <option value="INELIGIBLE">Ineligible</option>
        </select>
        <Textarea
          aria-label={`Eligibility evidence for ${slug}`}
          value={eligibilityEvidence}
          onChange={(event) => setEligibilityEvidence(event.target.value)}
          placeholder={
            "channel_basis=VERIFIED_WRITTEN_CONSENT\nrecipient=owner@example.com\ncontroller=Corner Shop Labs Ltd\nchannel=EMAIL\npurpose=CLAIM_INVITATION_AND_FOLLOW_UP\nevidence_timestamp=2026-08-21T09:00:00+02:00\nevidence_source=consent:record-1234"
          }
          maxLength={4_000}
          rows={3}
          className="text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={Boolean(pendingAction)}
          onClick={() => void saveEligibility()}
        >
          {pendingAction === "set_eligibility" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Check />
          )}
          Save eligibility evidence
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!note.trim() || Boolean(pendingAction)}
          onClick={() => void mutate("add_note")}
        >
          {pendingAction === "add_note" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <MessageSquarePlus />
          )}
          Save note
        </Button>
        <Button
          type="button"
          variant={reviewedAt ? "outline" : "default"}
          size="sm"
          disabled={Boolean(pendingAction)}
          onClick={() => void mutate("complete_review")}
        >
          {pendingAction === "complete_review" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Check />
          )}
          {reviewedAt ? "Review again" : "Mark reviewed"}
        </Button>
      </div>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : reviewedAt ? (
        <p className="text-[11px] text-muted-foreground">
          Reviewed {formatDate(reviewedAt)}
        </p>
      ) : null}
    </div>
  );
}

function parseEvidenceFields(value: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of value.split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("Write each evidence field as key=value.");
    }
    const key = line.slice(0, separator).trim();
    const evidence = line.slice(separator + 1).trim();
    if (!key || !evidence) {
      throw new Error("Evidence keys and values cannot be empty.");
    }
    fields[key] = evidence;
  }
  if (Object.keys(fields).length > 20) {
    throw new Error("At most 20 evidence fields are allowed.");
  }
  return fields;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
