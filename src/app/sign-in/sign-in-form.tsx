"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SignInCopy } from "@/lib/sign-in-surface";
import { cn } from "@/lib/utils";

export function SignInForm({
  copy,
  inverse,
}: {
  copy: SignInCopy;
  inverse: boolean;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not send link");
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={cn(
        "w-full max-w-md border bg-card p-7",
        inverse
          ? "rounded-2xl shadow-[0_28px_80px_rgb(0_0_0/0.56)]"
          : "rounded-3xl shadow-xl",
      )}
    >
      <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
        {sent ? <Check className="size-5" /> : <Mail className="size-5" />}
      </span>
      <h1
        className={cn(
          "mt-5 leading-none tracking-[-0.045em]",
          inverse
            ? "text-4xl font-semibold"
            : "font-display text-5xl",
        )}
      >
        {sent ? "Check your inbox." : copy.title}
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {sent
          ? `A secure sign-in link is on its way to ${email}.`
          : copy.description}
      </p>
      {!sent ? (
        <form onSubmit={submit} className="mt-7 space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={copy.emailPlaceholder}
            className="h-11"
            required
          />
          {error ? (
            <p className="rounded-lg bg-destructive/8 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="h-11 w-full" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" /> : null}
            Email me a secure link
            {!loading ? <ArrowRight /> : null}
          </Button>
        </form>
      ) : null}
      <div className="mt-6 border-t pt-5 text-center text-xs text-muted-foreground">
        {copy.emptyPrompt}{" "}
        <Link
          href={copy.createHref}
          className="font-semibold text-foreground"
        >
          {copy.createLabel}
        </Link>
      </div>
    </section>
  );
}
