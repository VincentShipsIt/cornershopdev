"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, RotateCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLAIM_INVITATION_MAX_RETRIES } from "@/lib/claim-delivery-policy";
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
  const [approvalEvidenceRef, setApprovalEvidenceRef] = useState(
    invitation?.approvalEvidenceRef ?? "",
  );

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
          approvalEvidenceRef:
            action === "issue" ? approvalEvidenceRef : undefined,
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
  const retryExhausted =
    sendAction === "resend" &&
    (invitation?.retryCount ?? 0) >= CLAIM_INVITATION_MAX_RETRIES;
  const deliveryNotRetryable =
    sendAction === "resend" && !invitation?.retryable;
  const approvalEvidenceValid =
    approvalEvidenceRef.length >= 8 && approvalEvidenceRef.length <= 160;
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
            if (
              invitation &&
              event.target.value.trim().toLowerCase() !==
                invitation.email.trim().toLowerCase()
            ) {
              setApprovalEvidenceRef("");
            }
          }}
          placeholder="approved@business.com"
          className="h-8 min-w-44"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            !email ||
            sending ||
            checkoutStarted ||
            retryExhausted ||
            deliveryNotRetryable ||
            (sendAction === "issue" && !approvalEvidenceValid)
          }
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
      {sendAction === "issue" ? (
        <>
          <label
            className="mt-2 block text-[11px] font-medium"
            htmlFor={`claim-approval-evidence-${siteSlug}`}
          >
            Ownership approval evidence reference
          </label>
          <Input
            id={`claim-approval-evidence-${siteSlug}`}
            value={approvalEvidenceRef}
            onChange={(event) => setApprovalEvidenceRef(event.target.value)}
            placeholder="crm:owner-consent-1234"
            minLength={8}
            maxLength={160}
            pattern="[A-Za-z0-9][A-Za-z0-9._:/#-]+"
            className="mt-1 h-8 min-w-56"
          />
          <p className="mt-1 max-w-64 text-[11px] text-muted-foreground">
            Required for concierge approval. Store only a non-sensitive CRM,
            ticket, or consent-record reference.
          </p>
        </>
      ) : invitation?.approvalEvidenceRef ? (
        <p className="mt-1 max-w-64 text-[11px] text-muted-foreground">
          Approval evidence: {invitation.approvalEvidenceRef}
        </p>
      ) : null}
      {invitation ? (
        <p className="mt-1 max-w-64 text-[11px] text-muted-foreground">
          Delivery: {humanize(invitation.deliveryStatus)} · attempt{" "}
          {invitation.deliveryAttempts} · retries {invitation.retryCount}/
          {CLAIM_INVITATION_MAX_RETRIES}
          {invitation.deliveryFailureCode
            ? ` · ${humanize(invitation.deliveryFailureCode)}`
            : ""}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 max-w-64 text-[11px] text-destructive">{error}</p>
      ) : checkoutStarted ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Revoke the checkout-bound invitation before replacing it.
        </p>
      ) : retryExhausted ? (
        <p className="mt-1 text-[11px] text-destructive">
          Delivery retry limit reached. Verify the address and issue a new
          approved invitation.
        </p>
      ) : deliveryNotRetryable ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Retry becomes available only after Resend records a failed, bounced,
          or suppressed delivery.
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
