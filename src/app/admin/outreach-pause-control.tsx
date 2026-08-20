"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePause, LoaderCircle, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function OutreachPauseControl({
  initialPaused,
}: {
  initialPaused: boolean;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updatePause() {
    const nextPaused = !paused;
    const confirmed = window.confirm(
      nextPaused
        ? "Pause all niche outreach? No new email will begin delivery while the pause is active."
        : "Resume niche outreach? Waiting workflows may continue at their next delivery check.",
    );
    if (!confirmed) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/outreach/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: nextPaused }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        paused?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok || payload.paused !== nextPaused) {
        throw new Error(payload.error ?? "Outreach setting could not be updated.");
      }
      setPaused(nextPaused);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Outreach setting could not be updated.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant={paused ? "destructive" : "secondary"}>
            {paused ? "Paused" : "Enabled"}
          </Badge>
          <span className="text-sm font-medium">Global outreach control</span>
        </div>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
          Every workflow checks this switch at each delivery boundary. A
          workflow waiting through a pause may continue after an explicit
          resume. Creating or reopening a lead never sends mail.
        </p>
        <div aria-live="polite">
          {error ? (
            <p className="mt-1 text-xs text-destructive">{error}</p>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        variant={paused ? "outline" : "destructive"}
        disabled={pending}
        onClick={() => void updatePause()}
      >
        {pending ? (
          <LoaderCircle className="animate-spin" />
        ) : paused ? (
          <Play />
        ) : (
          <CirclePause />
        )}
        {pending ? "Updating…" : paused ? "Resume outreach" : "Pause outreach"}
      </Button>
    </div>
  );
}
