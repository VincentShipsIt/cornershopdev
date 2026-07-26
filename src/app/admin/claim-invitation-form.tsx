"use client";

import { useState } from "react";
import { Check, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ClaimInvitationForm({ siteSlug }: { siteSlug: string }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setSending(true);
    setSent(false);
    setError(null);
    try {
      const response = await fetch("/api/admin/claim-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteSlug, email }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Invitation could not be sent.");
      }
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Invitation could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-w-56">
      <div className="flex gap-2">
        <Input
          aria-label={`Approved owner email for ${siteSlug}`}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setSent(false);
          }}
          placeholder="approved@business.com"
          className="h-8 min-w-44"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!email || sending}
          onClick={() => void approve()}
        >
          {sending ? (
            <LoaderCircle className="animate-spin" />
          ) : sent ? (
            <Check />
          ) : (
            <Send />
          )}
          {sent ? "Sent" : "Approve"}
        </Button>
      </div>
      {error ? (
        <p className="mt-1 max-w-64 text-[11px] text-destructive">{error}</p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Sends a 48-hour one-time claim link.
        </p>
      )}
    </div>
  );
}
