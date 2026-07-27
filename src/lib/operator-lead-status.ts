export type OperatorLeadStage =
  | "import"
  | "content_review"
  | "claim"
  | "checkout"
  | "domain_tls"
  | "publish";

export type OperatorLeadStageStatus = "blocked" | "ready" | "complete";

export type OperatorLeadStageRollup = {
  stage: OperatorLeadStage;
  status: OperatorLeadStageStatus;
  label: string;
  detail: string;
};

export type OperatorInvitationState =
  | "NONE"
  | "ACTIVE"
  | "VERIFIED"
  | "CHECKOUT_STARTED"
  | "ACCEPTED"
  | "REVOKED"
  | "EXPIRED";

type InvitationSnapshot = {
  expiresAt: Date;
  verifiedAt: Date | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  checkoutSessionId: string | null;
};

export type OperatorLeadRollupInput = {
  importStatus:
    | "QUEUED"
    | "CRAWLING"
    | "EXTRACTING"
    | "GENERATING"
    | "READY"
    | "FAILED"
    | null;
  reviewedAt: Date | null;
  ownerCount: number;
  invitationState: OperatorInvitationState;
  subscriptionStatus:
    | "INCOMPLETE"
    | "ACTIVE"
    | "PAST_DUE"
    | "CANCELED"
    | null;
  domainCount: number;
  verifiedDomainCount: number;
  isPublished: boolean;
};

export function getOperatorInvitationState(
  invitation: InvitationSnapshot | null,
  now = new Date(),
): OperatorInvitationState {
  if (!invitation) return "NONE";
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.revokedAt) return "REVOKED";
  if (invitation.expiresAt <= now) return "EXPIRED";
  if (invitation.checkoutSessionId) return "CHECKOUT_STARTED";
  if (invitation.verifiedAt) return "VERIFIED";
  return "ACTIVE";
}

export function isOperatorReviewCurrent(
  reviewedAt: Date | null,
  contentUpdatedAt: Date,
): boolean {
  return Boolean(reviewedAt && reviewedAt >= contentUpdatedAt);
}

export function buildOperatorLeadRollup(
  input: OperatorLeadRollupInput,
): OperatorLeadStageRollup[] {
  const importStage: OperatorLeadStageRollup =
    input.importStatus === "READY"
      ? {
          stage: "import",
          status: "complete",
          label: "Import ready",
          detail: "The latest persisted import completed successfully.",
        }
      : {
          stage: "import",
          status: "blocked",
          label:
            input.importStatus === "FAILED"
              ? "Import failed"
              : input.importStatus
                ? "Import in progress"
                : "Import missing",
          detail: input.importStatus
            ? `Latest import state: ${input.importStatus.toLowerCase()}.`
            : "Create or reopen this lead before review.",
        };

  const contentReviewStage: OperatorLeadStageRollup = input.reviewedAt
    ? {
        stage: "content_review",
        status: "complete",
        label: "Content reviewed",
        detail: "An operator accepted the current private preview.",
      }
    : {
        stage: "content_review",
        status: "blocked",
        label: "Content review pending",
        detail:
          "Review content completeness, image provenance, translations, and integrations.",
      };

  const claimStage = claimRollup(input);
  const checkoutStage = checkoutRollup(input);
  const domainStage: OperatorLeadStageRollup =
    input.verifiedDomainCount > 0
      ? {
          stage: "domain_tls",
          status: "complete",
          label: "TLS authorized",
          detail:
            "A verified customer domain is authorized for certificate issuance.",
        }
      : input.domainCount > 0
        ? {
            stage: "domain_tls",
            status: "blocked",
            label: "DNS verification pending",
            detail:
              "A customer domain is attached but is not yet authorized for TLS.",
          }
        : {
            stage: "domain_tls",
            status: "blocked",
            label: "Custom domain missing",
            detail:
              "The platform preview works, but no customer domain is configured.",
          };

  const publishDependenciesReady =
    Boolean(input.reviewedAt) &&
    input.ownerCount > 0 &&
    input.subscriptionStatus === "ACTIVE";
  const publishStage: OperatorLeadStageRollup = input.isPublished
    ? {
        stage: "publish",
        status: "complete",
        label: "Published",
        detail: "A version is live from the immutable publication snapshot.",
      }
    : publishDependenciesReady
      ? {
          stage: "publish",
          status: "ready",
          label: "Ready to publish",
          detail: "The owner can publish the reviewed draft.",
        }
      : {
          stage: "publish",
          status: "blocked",
          label: "Publish blocked",
          detail:
            "Content review, ownership, and an active subscription are required.",
        };

  return [
    importStage,
    contentReviewStage,
    claimStage,
    checkoutStage,
    domainStage,
    publishStage,
  ];
}

function claimRollup(
  input: OperatorLeadRollupInput,
): OperatorLeadStageRollup {
  if (input.ownerCount > 0 || input.invitationState === "ACCEPTED") {
    return {
      stage: "claim",
      status: "complete",
      label: "Claim complete",
      detail: "The site is connected to an owner organization.",
    };
  }
  if (
    input.invitationState === "ACTIVE" ||
    input.invitationState === "VERIFIED" ||
    input.invitationState === "CHECKOUT_STARTED"
  ) {
    return {
      stage: "claim",
      status: "ready",
      label:
        input.invitationState === "CHECKOUT_STARTED"
          ? "Checkout started"
          : input.invitationState === "VERIFIED"
            ? "Invitation verified"
            : "Invitation active",
      detail: "The owner has a current authorized path to claim this preview.",
    };
  }
  return {
    stage: "claim",
    status: "blocked",
    label: "Claim invitation needed",
    detail: "Issue or resend an authorized owner invitation.",
  };
}

function checkoutRollup(
  input: OperatorLeadRollupInput,
): OperatorLeadStageRollup {
  if (input.subscriptionStatus === "ACTIVE") {
    return {
      stage: "checkout",
      status: "complete",
      label: "Subscription active",
      detail: "Stripe access is active for this site.",
    };
  }
  if (input.invitationState === "CHECKOUT_STARTED") {
    return {
      stage: "checkout",
      status: "ready",
      label: "Checkout in progress",
      detail: "The current invitation is bound to a Stripe Checkout session.",
    };
  }
  return {
    stage: "checkout",
    status: "blocked",
    label: input.subscriptionStatus
      ? `Subscription ${input.subscriptionStatus.toLowerCase()}`
      : "Subscription missing",
    detail:
      "The claim Checkout flow must produce an active site subscription.",
  };
}
