"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, RotateCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OperatorSiteRow } from "@/lib/operator-dashboard";

export function ClaimInvitationForm({
  siteSlug,
  invitation,
}: {
  siteSlug: string;
  invitation: OperatorSiteRow["invitation"];
}) {
  const router = useRouter();
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "issue" | "resend") {
    setSending(true);
    setSent(false);
    setError(null);
    try {
      const response = await fetch("/api/admin/claim-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteSlug,
          email,
          action,
          invitationId: invitation?.id,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Invitation could not be sent.");
      }
      setSent(true);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Invitation could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  async function revoke() {
    if (!invitation) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/claim-invitations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteSlug, invitationId: invitation.id }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Invitation could not be revoked.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Invitation could not be revoked.",
      );
    } finally {
      setSending(false);
    }
  }

  const canRevoke =
    invitation &&
    ["ACTIVE", "VERIFIED", "CHECKOUT_STARTED"].includes(invitation.state);
  const hasPreviousInvitation = Boolean(invitation);
  const sameRecipient =
    invitation?.email.trim().toLowerCase() === email.trim().toLowerCase();
  const sendAction =
    hasPreviousInvitation && sameRecipient ? ("resend" as const) : ("issue" as const);
  const checkoutStarted = invitation?.state === "CHECKOUT_STARTED";
  const sendLabel = sent
    ? "Sent"
    : sendAction === "resend"
      ? "Resend"
      : hasPreviousInvitation
        ? "Replace"
        : "Issue";

  return (
    <div className="min-w-56">
      {invitation ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Latest: {humanize(invitation.state)} · expires{" "}
          {formatDate(invitation.expiresAt)}
        </p>
      ) : null}
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
          disabled={!email || sending || checkoutStarted}
          onClick={() => void send(sendAction)}
        >
          {sending ? (
            <LoaderCircle className="animate-spin" />
          ) : sent ? (
            <Check />
          ) : sendAction === "resend" ? (
            <RotateCw />
          ) : (
            <Send />
          )}
          {sendLabel}
        </Button>
        {canRevoke ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={sending}
            onClick={() => void revoke()}
          >
            <X />
            Revoke
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 max-w-64 text-[11px] text-destructive">{error}</p>
      ) : checkoutStarted ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Revoke the checkout-bound invitation before replacing it.
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Sends a 48-hour one-time claim link.
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
  }).format(new Date(value));
}
