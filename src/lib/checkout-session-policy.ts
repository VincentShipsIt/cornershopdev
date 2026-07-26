export type BoundCheckoutSession = {
  status: "open" | "complete" | "expired" | null;
  url: string | null;
  priceId: string | null;
};

export type CheckoutSessionAction =
  | "create"
  | "reuse"
  | "expire_and_replace"
  | "replace"
  | "await_provisioning";

export function checkoutSessionAction(
  session: BoundCheckoutSession | null,
  requestedPriceId: string,
): CheckoutSessionAction {
  if (!session) return "create";
  if (session.status === "complete") return "await_provisioning";
  if (session.status === "expired" || !session.url) return "replace";
  if (session.priceId === requestedPriceId) return "reuse";
  return "expire_and_replace";
}
