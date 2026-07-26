"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { SiteRenderer } from "@/components/site-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SiteDraftView } from "@/lib/site-draft";
import type { VerticalId } from "@/lib/verticals/types";

const plans = [
  {
    id: "starter" as const,
    name: "Starter",
    price: 25,
    description: "For restaurants with a menu that changes occasionally.",
    features: [
      "Mobile-first website and menu",
      "Custom domain and SSL",
      "Existing booking and ordering",
      "Monthly source checks",
    ],
  },
  {
    id: "growth" as const,
    name: "Growth",
    price: 50,
    description: "For active restaurants that want the work handled.",
    features: [
      "Everything in Starter",
      "Weekly menu and hours monitoring",
      "AI-assisted food imagery",
      "Priority review queue",
    ],
  },
];

export function ClaimPanel({
  slug,
  vertical,
  fallbackDraft,
  claimToken,
  checkoutReturn,
}: {
  slug: string;
  vertical: VerticalId;
  fallbackDraft: SiteDraftView;
  claimToken: string;
  checkoutReturn: {
    sessionId: string;
    claimInvitationId: string;
    state: string;
  } | null;
}) {
  const draft = fallbackDraft;
  const [plan, setPlan] = useState<"starter" | "growth">("growth");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(Boolean(checkoutReturn));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checkoutReturn) return;
    let stopped = false;
    let attempt = 0;
    let retryTimer: number | undefined;

    async function reconcile() {
      const params = new URLSearchParams({
        session_id: checkoutReturn!.sessionId,
        claim_id: checkoutReturn!.claimInvitationId,
        state: checkoutReturn!.state,
        poll: "1",
      });
      try {
        const response = await fetch(`/api/auth/checkout?${params}`, {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          ready?: boolean;
          url?: string;
          error?: string;
        };
        if (response.ok && result.ready && result.url) {
          window.location.assign(result.url);
          return;
        }
        if (!response.ok && response.status !== 202) {
          throw new Error(result.error ?? "Account provisioning failed");
        }
      } catch (caught) {
        if (!stopped) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Account provisioning failed",
          );
        }
        return;
      }
      attempt += 1;
      if (!stopped && attempt < 10) {
        retryTimer = window.setTimeout(
          () => void reconcile(),
          Math.min(1_000 * attempt, 3_000),
        );
      } else if (!stopped) {
        setError(
          "Payment succeeded, but the account is still being finalized. Refresh in a moment.",
        );
      }
    }

    void reconcile();
    return () => {
      stopped = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [checkoutReturn]);

  async function checkout() {
    if (!email || !claimToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          siteSlug: slug,
          email,
          claimToken,
        }),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Checkout could not start");
      }
      window.location.assign(result.url);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Checkout could not start",
      );
      setLoading(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_0.9fr]">
      <section className="bg-[#ece8de] p-4 sm:p-8 lg:min-h-[calc(100vh-4rem)] lg:p-10">
        <div className="mx-auto max-w-[700px]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Private preview
              </p>
              <h1 className="font-display mt-1 text-4xl tracking-[-0.04em]">
                Claim {draft.name}
              </h1>
            </div>
            <Button
              render={
                <Link href={`/preview/${slug}`} target="_blank" />
              }
              variant="outline"
              size="sm"
            >
              Full preview <ExternalLink />
            </Button>
          </div>
          <div className="max-h-[690px] overflow-hidden rounded-[1.75rem] border-[7px] border-[#171914] bg-white p-1 shadow-2xl">
            <div className="origin-top scale-[0.72]">
              <div className="w-[138.89%]">
                <SiteRenderer draft={draft} vertical={vertical} embedded />
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="flex items-center px-5 py-12 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-xl">
          <Badge variant="secondary" className="rounded-full">
            <ShieldCheck /> Nothing publishes before payment
          </Badge>
          <h2 className="font-display text-balance mt-5 text-5xl leading-[0.92] tracking-[-0.045em]">
            Keep this site current.
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Claiming creates the owner account and unlocks editing. The current
            website and domain stay untouched until the final DNS step.
          </p>
          {!claimToken && !checkoutReturn ? (
            <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
              A secure, unexpired claim invitation is required before checkout.
            </p>
          ) : null}
          {checkoutReturn ? (
            <p className="mt-4 rounded-xl border bg-muted/45 px-4 py-3 text-xs leading-5">
              Payment received. Finalizing the owner account from Stripe&apos;s
              signed webhook…
            </p>
          ) : null}

          <div className="mt-8 grid gap-3">
            {plans.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPlan(item.id)}
                className={`rounded-2xl border p-5 text-left transition ${
                  plan === item.id
                    ? "border-primary bg-primary/5 ring-2 ring-primary/12"
                    : "bg-card hover:border-foreground/25"
                }`}
              >
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{item.name}</span>
                      {item.id === "growth" ? (
                        <Badge className="text-[10px]">Recommended</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <span className="font-display text-4xl">
                    ${item.price}
                    <small className="font-sans text-xs text-muted-foreground">
                      /mo
                    </small>
                  </span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {item.features.map((feature) => (
                    <span
                      key={feature}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <Check className="size-3 text-primary" /> {feature}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <label className="mt-7 block text-xs font-medium" htmlFor="email">
            Owner email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="owner@restaurant.com"
            className="mt-2 h-11"
          />
          {error ? (
            <p className="mt-3 rounded-lg bg-destructive/8 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            size="lg"
            className="mt-4 h-12 w-full"
            disabled={!email || !claimToken || loading}
            onClick={() => void checkout()}
          >
            {loading ? (
              <>
                <LoaderCircle className="animate-spin" /> Opening secure checkout
              </>
            ) : (
              <>
                Claim and continue <ArrowRight />
              </>
            )}
          </Button>
          <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">
            Secure subscription checkout by Stripe. Cancel any time. Domain
            connection happens after the account is created.
          </p>
        </div>
      </aside>
    </div>
  );
}
