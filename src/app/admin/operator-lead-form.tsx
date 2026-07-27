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
      const response = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, vertical: "RESTAURANT" }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        created?: boolean;
        reopened?: boolean;
        urls?: { preview: string };
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.urls) {
        throw new Error(payload.error ?? "Lead could not be created.");
      }
      setResult({
        preview: payload.urls.preview,
        created: Boolean(payload.created),
        reopened: Boolean(payload.reopened),
      });
      setSource("");
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
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="space-y-2">
        <Label htmlFor="operator-lead-source">Business URL or name</Label>
        <Input
          id="operator-lead-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="https://restaurant.example or Restaurant name"
          maxLength={500}
        />
      </div>
      <Button
        type="button"
        disabled={source.trim().length < 2 || submitting}
        onClick={() => void submit()}
      >
        {submitting ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Plus />
        )}
        {submitting ? "Creating preview…" : "Create or reopen"}
      </Button>
      <div className="md:col-span-2" aria-live="polite">
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
            deterministic private preview for manual enrichment.
          </p>
        )}
      </div>
    </div>
  );
}
