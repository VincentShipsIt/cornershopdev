"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Monitor,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { Vertical } from "@/generated/prisma/enums";
import { Brand } from "@/components/brand";
import { InstantRestaurantPreview } from "@/components/instant-restaurant-preview";
import { SiteRenderer } from "@/components/site-renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { sampleSiteDraft } from "@/lib/restaurant";
import type { ImportUrls } from "@/lib/restaurant-import";
import type { SiteDraftView } from "@/lib/site-draft";
import type { VerticalId } from "@/lib/verticals/types";

type Stage = {
  label: string;
  threshold: number;
};

const stages: Stage[] = [
  { label: "Read existing website", threshold: 12 },
  { label: "Recover menu and details", threshold: 42 },
  { label: "Preserve booking and ordering", threshold: 58 },
  { label: "Compose mobile-first design", threshold: 65 },
  { label: "Check and save private preview", threshold: 95 },
];

/**
 * The import API speaks the shared site shape and names the vertical it produced,
 * which is everything the renderer needs — this component never learns what a
 * restaurant is beyond the demo fixture below.
 */
type ImportedSite = {
  draft: SiteDraftView;
  vertical: VerticalId;
};

type ImportResponse =
  | ({
      mode: "inline";
      importJobId: string;
      urls: ImportUrls;
    } & ImportedSite)
  | { mode: "workflow"; runId: string; importJobId: string }
  | { error: string };

export function ImportStudio({ initialSource }: { initialSource: string }) {
  const hasInitialSource = Boolean(initialSource.trim());
  const [source, setSource] = useState(initialSource);
  const [previewSource, setPreviewSource] = useState(initialSource);
  const [progress, setProgress] = useState(hasInitialSource ? 6 : 0);
  const [message, setMessage] = useState(
    hasInitialSource ? "Opening the restaurant" : "Ready when you are",
  );
  const [site, setSite] = useState<ImportedSite | null>(null);
  const [urls, setUrls] = useState<ImportUrls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(hasInitialSource);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const startedSource = useRef<string | null>(null);

  async function runImport(value = source) {
    const cleanSource = value.trim();
    if (!cleanSource) return;

    startedSource.current = cleanSource;
    setPreviewSource(cleanSource);
    setLoading(true);
    setSite(null);
    setUrls(null);
    setError(null);
    setProgress(6);
    setMessage("Opening the restaurant");

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: cleanSource }),
      });
      const result = (await response.json()) as ImportResponse;
      if (!response.ok || "error" in result) {
        throw new Error(
          "error" in result ? result.error : "The preview could not be created",
        );
      }

      if (result.mode === "inline") {
        complete(
          { draft: result.draft, vertical: result.vertical },
          result.urls,
        );
        return;
      }

      const events = new EventSource(
        `/api/workflows/${encodeURIComponent(result.runId)}/events`,
      );
      events.onmessage = (event) => {
        let update:
          | {
              type: "progress";
              progress: number;
              message: string;
            }
          | ({
              type: "complete";
              importJobId: string;
              urls: ImportUrls;
            } & ImportedSite)
          | { type: "failed"; message: string };
        try {
          update = JSON.parse(event.data) as typeof update;
        } catch {
          events.close();
          setError("The workflow returned an unreadable update");
          setLoading(false);
          return;
        }
        if (update.type === "progress") {
          setProgress(update.progress);
          setMessage(update.message);
        }
        if (update.type === "complete") {
          events.close();
          complete(
            { draft: update.draft, vertical: update.vertical },
            update.urls,
          );
        }
        if (update.type === "failed") {
          events.close();
          setError(update.message);
          setLoading(false);
        }
      };
      events.onerror = () => {
        events.close();
        setError("The generation connection was interrupted. Try again.");
        setLoading(false);
      };
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The preview could not be created",
      );
      setLoading(false);
    }
  }

  function complete(nextSite: ImportedSite, nextUrls: ImportUrls) {
    setProgress(100);
    setMessage("Private preview ready");
    setSite(nextSite);
    setUrls(nextUrls);
    setLoading(false);
  }

  useEffect(() => {
    if (initialSource && startedSource.current !== initialSource) {
      void runImport(initialSource);
    }
    // runImport is intentionally called once per initial URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSource]);

  function useDemo() {
    setSource("Osteria Luna");
    setError(null);
    complete(
      { draft: sampleSiteDraft, vertical: Vertical.RESTAURANT },
      {
        preview: `/preview/${sampleSiteDraft.slug}`,
        claim: `/claim/${sampleSiteDraft.slug}`,
      },
    );
  }

  return (
    <main className="min-h-screen bg-[#ece8de]">
      <header className="flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Button
            render={<Link href="/" aria-label="Back to Restofront" />}
            nativeButton={false}
            variant="ghost"
            size="icon-sm"
          >
            <ArrowLeft />
          </Button>
          <Brand />
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="mr-2 text-xs text-muted-foreground">
            Private preview · not published
          </span>
          <Button
            variant={device === "mobile" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setDevice("mobile")}
            aria-label="Mobile preview"
          >
            <Smartphone />
          </Button>
          <Button
            variant={device === "desktop" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setDevice("desktop")}
            aria-label="Desktop preview"
          >
            <Monitor />
          </Button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[390px_1fr]">
        <aside className="border-b bg-background p-5 lg:border-b-0 lg:border-r lg:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            New restaurant
          </p>
          <h1 className="font-display mt-3 text-4xl leading-none tracking-[-0.04em]">
            {previewSource
              ? "Your first look is ready."
              : "Build the first version."}
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {previewSource
              ? "The shape is already here. We are recovering the real menu, imagery and existing links now."
              : "Paste a website or restaurant name. The preview stays private until it is claimed and paid."}
          </p>

          <form
            className="mt-7 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void runImport();
            }}
          >
            <div className="relative">
              <Globe2 className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="restaurant.com or restaurant name"
                className="h-10 pl-9"
                disabled={loading}
              />
            </div>
            <Button className="w-full" disabled={!source.trim() || loading}>
              {loading ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Finishing the details
                </>
              ) : (
                <>
                  Build preview
                  <ArrowRight />
                </>
              )}
            </Button>
          </form>

          {loading || site ? (
            <div className="mt-8">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{message}</span>
                <span className="font-mono text-muted-foreground">
                  {progress}%
                </span>
              </div>
              <Progress value={progress} className="mt-3 h-1.5" />
              <div className="mt-6 space-y-4">
                {stages.map((stage) => {
                  const completeStage = progress >= stage.threshold;
                  return (
                    <div
                      key={stage.label}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span
                        className={`grid size-5 place-items-center rounded-full border ${
                          completeStage
                            ? "border-primary bg-primary text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {completeStage ? (
                          <Check className="size-3" />
                        ) : (
                          <span className="size-1 rounded-full bg-current" />
                        )}
                      </span>
                      <span
                        className={
                          completeStage
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {stage.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-6 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
              <div className="flex gap-2 text-sm text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void runImport()}
                >
                  <RotateCcw /> Retry
                </Button>
                <Button variant="ghost" size="sm" onClick={useDemo}>
                  Open demo instead
                </Button>
              </div>
            </div>
          ) : null}

          {site && urls ? (
            <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
                Ready to claim
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Review the menu and existing links, then choose a plan to keep
                this site current.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  render={<Link href={urls.preview} target="_blank" />}
                  nativeButton={false}
                  variant="outline"
                >
                  Preview
                  <ExternalLink />
                </Button>
                <Button
                  render={<Link href={urls.claim} />}
                  nativeButton={false}
                >
                  Claim
                  <ArrowRight />
                </Button>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="relative overflow-hidden p-4 sm:p-7 lg:p-10">
          {!site && !previewSource ? (
            <div className="grid min-h-[720px] place-items-center rounded-[2rem] border border-dashed border-foreground/15 bg-background/40">
              <div className="max-w-sm px-6 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full border bg-background">
                  <Smartphone className="size-5 text-muted-foreground" />
                </span>
                <h2 className="font-display mt-5 text-3xl tracking-[-0.03em]">
                  Preview appears here
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Start with a website or restaurant name. No account is needed
                  to see the result.
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`mx-auto transition-all duration-500 ${
                device === "mobile"
                  ? "max-w-[430px] rounded-[2.4rem] border-[9px] border-[#171914] p-1 shadow-2xl"
                  : "max-w-6xl rounded-[1.9rem] border-[8px] border-[#171914] p-1 shadow-2xl"
              }`}
            >
              <div
                className={`overflow-hidden bg-white ${
                  device === "mobile"
                    ? "max-h-[790px] rounded-[1.65rem]"
                    : "max-h-[790px] rounded-[1.15rem]"
                }`}
              >
                {site ? (
                  <SiteRenderer
                    draft={site.draft}
                    vertical={site.vertical}
                    embedded
                  />
                ) : (
                  <InstantRestaurantPreview
                    source={previewSource}
                    message={message}
                    progress={progress}
                    status={error ? "error" : "loading"}
                  />
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
