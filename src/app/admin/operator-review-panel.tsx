"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OperatorSiteRow } from "@/lib/operator-dashboard";

type OperatorReviewPanelProps = Pick<
  OperatorSiteRow,
  "slug" | "reviewedAt" | "notes" | "contentReview"
>;

export function OperatorReviewPanel({
  slug,
  reviewedAt,
  notes,
  contentReview,
}: OperatorReviewPanelProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "add_note" | "complete_review" | null
  >(null);
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

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
