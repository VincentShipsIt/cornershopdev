"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The first step of every lead. `vertical` is the niche slug the visitor arrived
 * through — it rides along to `/create` so a lead from a niche domain opens the
 * studio already on the right vertical instead of defaulting to restaurants.
 * Omitted on the factory homepage, where the visitor picks the niche themselves.
 */
export function ImportForm({
  className,
  compact = false,
  vertical,
  placeholder,
  label,
  submitLabel,
  pendingLabel,
}: {
  className?: string;
  compact?: boolean;
  vertical?: string;
  placeholder: string;
  label: string;
  submitLabel: string;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source.trim()) return;
    const params = new URLSearchParams({ source: source.trim() });
    if (vertical) params.set("vertical", vertical);
    startTransition(() => {
      router.push(`/create?${params.toString()}`);
    });
  }

  return (
    <form
      onSubmit={submit}
      aria-busy={isPending}
      className={cn(
        "flex w-full flex-col gap-2 rounded-2xl border bg-card p-2 shadow-[0_18px_60px_-24px_rgba(68,40,20,0.28)] sm:flex-row",
        compact ? "max-w-2xl" : "max-w-xl",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        <Globe2 className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          placeholder={placeholder}
          aria-label={label}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="h-11 shrink-0 rounded-xl"
        disabled={!source.trim() || isPending}
      >
        {isPending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            {pendingLabel}
          </>
        ) : (
          <>
            {submitLabel}
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
