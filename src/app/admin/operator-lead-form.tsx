"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OperatorLeadForm() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    preview: string;
    created: boolean;
    reopened: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/leads/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: [{ source, contactEmail, vertical: "RESTAURANT" }],
          sendEmail: false,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        results?: Array<{
          siteSlug?: string;
          created?: boolean;
          reopened?: boolean;
          error?: string;
        }>;
        error?: string;
      };
      const lead = payload.results?.[0];
      if (!response.ok || !payload.ok || !lead?.siteSlug) {
        throw new Error(
          lead?.error ?? payload.error ?? "Lead could not be created.",
        );
      }
      setResult({
        preview: `/preview/${encodeURIComponent(lead.siteSlug)}`,
        created: Boolean(lead.created),
        reopened: Boolean(lead.reopened),
      });
      setSource("");
      setContactEmail("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Lead could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)_auto] lg:items-end"
      aria-busy={submitting}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="operator-lead-source">Business URL or name</Label>
        <Input
          id="operator-lead-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="https://restaurant.example or Restaurant name"
          minLength={2}
          maxLength={500}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="operator-lead-email">Contact email</Label>
        <Input
          id="operator-lead-email"
          type="email"
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          placeholder="owner@restaurant.com"
          maxLength={320}
          required
        />
      </div>
      <Button
        type="submit"
        disabled={
          source.trim().length < 2 ||
          !contactEmail.includes("@") ||
          submitting
        }
      >
        {submitting ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Plus />
        )}
        {submitting ? "Creating preview…" : "Create preview"}
      </Button>
      <div className="lg:col-span-3" aria-live="polite">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : result ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {result.created
              ? "Lead created."
              : result.reopened
                ? "Existing lead reopened."
                : "Lead ready."}
            <a
              href={result.preview}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              Review preview <ArrowUpRight className="size-3" />
            </a>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            URL imports inspect the public site; a business name creates a
            deterministic private preview for manual enrichment. No email is
            sent until you review the preview and confirm outreach separately.
          </p>
        )}
      </div>
    </form>
  );
}
