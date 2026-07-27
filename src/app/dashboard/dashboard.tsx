"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenText,
  Check,
  CircleCheck,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  Globe2,
  ImageIcon,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Mail,
  MoreHorizontal,
  Plus,
  Palette,
  RefreshCcw,
  RotateCcw,
  Rocket,
  Save,
  Settings,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Brand } from "@/components/brand";
import {
  ClientAnalyticsPanel,
  ClientBookingRequestInbox,
} from "@/components/client-workspace";
import { RestaurantIntegrationEditor } from "@/components/restaurant-integration-editor";
import { RestaurantMenuEditor } from "@/components/restaurant-menu-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { BrandIdentity } from "@/lib/brand";
import type { AnalyticsSummaryDto } from "@/lib/analytics-contract";
import type { BookingRequestInboxDto } from "@/lib/booking-request-inbox";
import type { BillingAccess } from "@/lib/billing-access";
import type { SitePublicationHistoryItem } from "@/lib/site-publication";
import { listRestaurantThemeManifests } from "@/lib/site-themes/restaurant/registry";
import {
  parseRestaurantThemeSelection,
  restoreAutomaticRestaurantTheme,
  selectOwnerRestaurantTheme,
} from "@/lib/site-themes/restaurant/selection";
import {
  restaurantDraftSchema,
  type RestaurantDraft,
} from "@/lib/restaurant";
import {
  applyRestaurantIntegrationMutation,
  validateRestaurantIntegrations,
  type RestaurantIntegrationMutation,
} from "@/lib/restaurant-integration-editor";
import {
  applyRestaurantMenuMutation,
  hasUnreviewedRestaurantTranslations,
  markRestaurantTranslationReviewed,
  updateRestaurantTranslation,
  validateRestaurantMenuDraft,
  type RestaurantMenuMutation,
} from "@/lib/restaurant-menu-editor";

type DomainSetup = {
  hostname: string;
  attached: boolean;
  verified: boolean;
  records: Array<{ type: string; name: string; value: string }>;
};

type ClientPublicationHistoryItem = Omit<
  SitePublicationHistoryItem,
  "publishedAt"
> & {
  publishedAt: string;
};

/**
 * `brand` is resolved on the server from the host the owner signed in through,
 * so someone managing a site they bought as Restofrontapp keeps seeing
 * Restofrontapp here rather than the factory that built it.
 */
export function Dashboard({
  initialDraft,
  email,
  checkoutComplete,
  demo,
  brand,
  analyticsSummary,
  bookingInbox,
  billingAccess,
  publicationHistory: initialPublicationHistory,
}: {
  initialDraft: RestaurantDraft;
  email: string;
  checkoutComplete: boolean;
  demo: boolean;
  brand: BrandIdentity;
  analyticsSummary: AnalyticsSummaryDto;
  bookingInbox: BookingRequestInboxDto;
  billingAccess: BillingAccess | null;
  publicationHistory: ClientPublicationHistoryItem[];
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [domainSetup, setDomainSetup] = useState<DomainSetup | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainLoading, setDomainLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [themeDirty, setThemeDirty] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState<string | null>(null);
  const [publicationHistory, setPublicationHistory] = useState(
    initialPublicationHistory,
  );

  const themeManifests = listRestaurantThemeManifests();
  const currentThemeSelection = parseRestaurantThemeSelection(
    draft.themeSelection,
  );
  const automaticThemeSelection = restoreAutomaticRestaurantTheme(
    draft.designProfile,
  );
  const [menuDirty, setMenuDirty] = useState(false);
  const [menuSaveError, setMenuSaveError] = useState<string | null>(null);
  const [menuValidationIssues, setMenuValidationIssues] = useState<
    ReturnType<typeof validateRestaurantMenuDraft>
  >([]);
  const [menuUndoStack, setMenuUndoStack] = useState<RestaurantDraft[]>([]);
  const [integrationDirty, setIntegrationDirty] = useState(false);
  const [integrationSaveError, setIntegrationSaveError] = useState<
    string | null
  >(null);
  const [integrationValidationIssues, setIntegrationValidationIssues] =
    useState<ReturnType<typeof validateRestaurantIntegrations>>([]);
  const [integrationUndoStack, setIntegrationUndoStack] = useState<
    RestaurantDraft[]
  >([]);
  const [regeneratingLocale, setRegeneratingLocale] = useState<string | null>(
    null,
  );

  async function save(): Promise<boolean> {
    const validationIssues = validateRestaurantMenuDraft(draft);
    const integrationIssues = validateRestaurantIntegrations(draft);
    setMenuValidationIssues(validationIssues);
    setIntegrationValidationIssues(integrationIssues);
    if (validationIssues.length > 0 || integrationIssues.length > 0) {
      setMenuSaveError(
        validationIssues.length > 0
          ? "The menu contains invalid or incomplete fields"
          : "Fix the integration labels before saving this draft",
      );
      setIntegrationSaveError(
        integrationIssues.length > 0
          ? "One or more external links are invalid or incomplete"
          : "Fix the invalid menu fields before saving these links",
      );
      return false;
    }
    setSaving(true);
    setSaved(false);
    setPublishError(null);
    setMenuSaveError(null);
    setIntegrationSaveError(null);
    try {
      if (!demo) {
        const response = await fetch(`/api/sites/${draft.slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const result = (await response.json()) as {
          error?: string;
          revision?: number;
        };
        if (!response.ok) {
          throw new Error(result.error ?? "Save failed");
        }
        setSavedRevision(result.revision ?? null);
      }
      setSaved(true);
      setThemeDirty(false);
      setMenuDirty(false);
      setIntegrationDirty(false);
      setMenuValidationIssues([]);
      setIntegrationValidationIssues([]);
      setPublishedVersion(null);
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Save failed";
      setPublishError(message);
      setMenuSaveError(message);
      setIntegrationSaveError(message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (hasUnreviewedRestaurantTranslations(draft)) {
      setPublishError(
        "Review every stale or regenerated translation before publishing",
      );
      return;
    }
    const changeSummary = window
      .prompt(
        "Summarize what will change on the public site:",
        "Publish approved draft",
      )
      ?.trim();
    if (!changeSummary) return;
    if (changeSummary.length < 3 || changeSummary.length > 280) {
      setPublishError("Use a change summary between 3 and 280 characters");
      return;
    }
    if (
      !window.confirm(
        "Publish this saved draft to the connected public domain now?",
      )
    ) {
      return;
    }

    setPublishing(true);
    setPublishError(null);
    try {
      if (!(await save())) return;
      if (demo) {
        setPublishedVersion(1);
        setMenuUndoStack([]);
        setIntegrationUndoStack([]);
        return;
      }

      const response = await fetch(`/api/sites/${draft.slug}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSummary }),
      });
      const result = (await response.json()) as {
        error?: string;
        published?: {
          id: string;
          version: number;
          publishedAt: string;
          theme: { id: string; version: string };
        };
      };
      if (!response.ok || !result.published) {
        throw new Error(result.error ?? "Publish failed");
      }
      setPublishedVersion(result.published.version);
      setPublicationHistory((current) => [
        {
          id: result.published!.id,
          version: result.published!.version,
          publishedAt: result.published!.publishedAt,
          changeSummary,
          current: true,
          theme: result.published!.theme,
        },
        ...current.map((item) => ({ ...item, current: false })),
      ]);
      setMenuUndoStack([]);
      setIntegrationUndoStack([]);
    } catch (caught) {
      setPublishError(
        caught instanceof Error ? caught.message : "Publish failed",
      );
    } finally {
      setPublishing(false);
    }
  }

  function selectTheme(themeId: Parameters<typeof selectOwnerRestaurantTheme>[1]) {
    const selection = selectOwnerRestaurantTheme(
      draft.designProfile,
      themeId,
    );
    setDraft((current) => ({ ...current, themeSelection: selection }));
    setSaved(false);
    setThemeDirty(true);
    setPublishedVersion(null);
    setPublishError(null);
  }

  function restoreAutomaticTheme() {
    setDraft((current) => ({
      ...current,
      themeSelection: restoreAutomaticRestaurantTheme(
        current.designProfile,
      ),
    }));
    setSaved(false);
    setThemeDirty(true);
    setPublishedVersion(null);
    setPublishError(null);
  }

  async function rollback(siteVersionId: string) {
    const target = publicationHistory.find(
      (item) => item.id === siteVersionId,
    );
    if (!target || target.current) return;
    if (
      !window.confirm(
        `Restore the public site to version ${target.version}? Your private draft will not change.`,
      )
    ) {
      return;
    }

    setRollbackLoading(siteVersionId);
    setPublishError(null);
    try {
      const response = await fetch(`/api/sites/${draft.slug}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteVersionId }),
      });
      const result = (await response.json()) as {
        error?: string;
        published?: {
          id: string;
          version: number;
          publishedAt: string;
          theme: { id: string; version: string };
        };
      };
      if (!response.ok || !result.published) {
        throw new Error(result.error ?? "Rollback failed");
      }
      setPublishedVersion(result.published.version);
      setPublicationHistory((current) => [
        {
          id: result.published!.id,
          version: result.published!.version,
          publishedAt: result.published!.publishedAt,
          changeSummary: `Rollback to v${target.version}: ${target.changeSummary}`,
          current: true,
          theme: result.published!.theme,
        },
        ...current.map((item) => ({ ...item, current: false })),
      ]);
    } catch (caught) {
      setPublishError(
        caught instanceof Error ? caught.message : "Rollback failed",
      );
    } finally {
      setRollbackLoading(null);
    }
  }

  function mutateMenu(
    mutation: RestaurantMenuMutation,
    destructive = false,
  ) {
    try {
      if (destructive) {
        setMenuUndoStack((current) => [
          ...current,
          structuredClone(draft),
        ]);
      }
      const next = applyRestaurantMenuMutation(draft, mutation);
      setDraft(next);
      setMenuDirty(true);
      setSaved(false);
      setMenuSaveError(null);
      setMenuValidationIssues(validateRestaurantMenuDraft(next));
    } catch (error) {
      setMenuSaveError(
        error instanceof Error ? error.message : "Menu change failed",
      );
    }
  }

  function changeTranslation(
    locale: string,
    updater: Parameters<typeof updateRestaurantTranslation>[2],
  ) {
    const next = updateRestaurantTranslation(draft, locale, updater);
    setDraft(next);
    setMenuDirty(true);
    setSaved(false);
    setMenuSaveError(null);
    setMenuValidationIssues(validateRestaurantMenuDraft(next));
  }

  function reviewTranslation(locale: string) {
    try {
      const next = markRestaurantTranslationReviewed(draft, locale);
      setDraft(next);
      setMenuDirty(true);
      setSaved(false);
      setMenuSaveError(null);
      setMenuValidationIssues([]);
    } catch {
      setMenuSaveError(
        "Fix the translated menu fields before marking this locale reviewed",
      );
    }
  }

  async function regenerateTranslation(locale: string) {
    if (menuDirty || integrationDirty) {
      setMenuSaveError(
        "Save canonical menu and integration changes before regenerating a translation",
      );
      return;
    }
    setRegeneratingLocale(locale);
    setMenuSaveError(null);
    try {
      const response = await fetch(
        `/api/sites/${draft.slug}/translations/${locale}/regenerate`,
        { method: "POST" },
      );
      const result = (await response.json()) as {
        error?: string;
        draft?: unknown;
      };
      if (!response.ok || !result.draft) {
        throw new Error(result.error ?? "Translation regeneration failed");
      }
      const regenerated = restaurantDraftSchema.parse(result.draft);
      setDraft((current) => ({
        ...current,
        translations: regenerated.translations,
      }));
      setSaved(true);
      setMenuDirty(false);
      setIntegrationDirty(false);
      setMenuValidationIssues([]);
      setIntegrationValidationIssues([]);
    } catch (error) {
      setMenuSaveError(
        error instanceof Error
          ? error.message
          : "Translation regeneration failed",
      );
    } finally {
      setRegeneratingLocale(null);
    }
  }

  function undoMenuDeletion() {
    const previous = menuUndoStack.at(-1);
    if (!previous) return;
    setDraft(previous);
    setMenuUndoStack((current) => current.slice(0, -1));
    setMenuDirty(true);
    setSaved(false);
    setMenuSaveError(null);
    setMenuValidationIssues([]);
  }

  function mutateIntegration(
    mutation: RestaurantIntegrationMutation,
    destructive = false,
  ) {
    try {
      if (destructive) {
        setIntegrationUndoStack((current) => [
          ...current,
          structuredClone(draft),
        ]);
      }
      const next = applyRestaurantIntegrationMutation(draft, mutation);
      setDraft(next);
      setIntegrationDirty(true);
      setSaved(false);
      setIntegrationSaveError(null);
      setIntegrationValidationIssues(
        validateRestaurantIntegrations(next),
      );
    } catch (error) {
      setIntegrationSaveError(
        error instanceof Error
          ? error.message
          : "Integration change failed",
      );
    }
  }

  function changeIntegrationTranslationLabel(
    locale: string,
    integrationIndex: number,
    label: string,
  ) {
    const next = updateRestaurantTranslation(
      draft,
      locale,
      (translation) => {
        translation.integrationLabels[integrationIndex] = label;
      },
    );
    setDraft(next);
    setIntegrationDirty(true);
    setSaved(false);
    setIntegrationSaveError(null);
    setIntegrationValidationIssues(
      validateRestaurantIntegrations(next),
    );
  }

  function reviewIntegrationTranslation(locale: string) {
    try {
      const next = markRestaurantTranslationReviewed(draft, locale);
      setDraft(next);
      setIntegrationDirty(true);
      setSaved(false);
      setIntegrationSaveError(null);
      setIntegrationValidationIssues([]);
    } catch {
      setIntegrationSaveError(
        "Fix every translated label before marking this locale reviewed",
      );
    }
  }

  function undoIntegrationRemoval() {
    const previous = integrationUndoStack.at(-1);
    if (!previous) return;
    setDraft(previous);
    setIntegrationUndoStack((current) => current.slice(0, -1));
    setIntegrationDirty(true);
    setSaved(false);
    setIntegrationSaveError(null);
    setIntegrationValidationIssues([]);
  }

  async function connectDomain() {
    setDomainLoading(true);
    setDomainError(null);
    try {
      const response = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: domain,
          siteSlug: draft.slug,
        }),
      });
      const result = (await response.json()) as DomainSetup & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Could not add domain");
      setDomainSetup(result);
    } catch (caught) {
      setDomainError(
        caught instanceof Error ? caught.message : "Could not add domain",
      );
    } finally {
      setDomainLoading(false);
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteSlug: draft.slug }),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Billing portal could not open");
      }
      window.location.assign(result.url);
    } catch (caught) {
      alert(
        caught instanceof Error
          ? caught.message
          : "Billing portal could not open",
      );
      setPortalLoading(false);
    }
  }

  async function enhanceImage() {
    const sourceImageUrl =
      draft.heroOriginalImageUrl ?? draft.heroImageUrl;
    if (!sourceImageUrl?.startsWith("https://")) return;

    setImageLoading(true);
    try {
      const response = await fetch("/api/images/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceImageUrl,
          siteSlug: draft.slug,
          siteName: draft.name,
        }),
      });
      const result = (await response.json()) as {
        url?: string;
        originalUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Image could not be enhanced");
      }
      setDraft((current) => ({
        ...current,
        heroImageUrl: result.url ?? current.heroImageUrl,
        heroOriginalImageUrl:
          current.heroOriginalImageUrl ??
          result.originalUrl ??
          current.heroImageUrl,
        heroImageProvenance:
          current.heroImageProvenance ??
          (current.sourceUrl ? "official" : "owner"),
      }));
    } catch (caught) {
      alert(
        caught instanceof Error ? caught.message : "Image could not be enhanced",
      );
    } finally {
      setImageLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f1eb]">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
        <div className="flex items-center gap-5">
          <Brand {...brand} />
          <span className="hidden h-5 w-px bg-border sm:block" />
          <button className="hidden items-center gap-2 text-sm font-medium sm:flex">
            {draft.name}
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="hidden rounded-full bg-emerald-500/10 text-emerald-700 sm:inline-flex"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Preview ready
          </Badge>
          <Button
            render={
              <Link href={`/preview/${draft.slug}`} target="_blank" />
            }
            variant="outline"
            size="sm"
          >
            View site <ExternalLink />
          </Button>
          {!demo && billingAccess?.ok ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openBillingPortal()}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CreditCard />
              )}
              Billing
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={saving || publishing}
          >
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saved ? "Saved" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void publish()}
            disabled={saving || publishing}
          >
            {publishing ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Rocket />
            )}
            {publishedVersion
              ? `Published v${publishedVersion}`
              : "Publish"}
          </Button>
        </div>
      </header>

      {publishError ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-center text-sm text-red-800">
          {publishError}
        </div>
      ) : null}
      {checkoutComplete ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-center text-sm text-emerald-800">
          <CircleCheck className="mr-2 inline size-4" />
          Account created. Your website remains private until the domain is
          connected.
        </div>
      ) : null}
      {!demo && billingAccess && !billingAccess.ok ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-sm text-amber-900">
          {billingAccess.message}. Publishing and monitoring are paused.
          {billingAccess.customerPortalAvailable ? (
            <Button
              variant="link"
              className="ml-1 h-auto p-0 text-amber-950 underline"
              onClick={() => void openBillingPortal()}
              disabled={portalLoading}
            >
              Manage billing
            </Button>
          ) : null}
        </div>
      ) : null}
      {demo ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-xs text-amber-900">
          Demo dashboard—changes remain in this browser.{" "}
          <Link href="/create" className="font-semibold underline">
            Build a real preview
          </Link>
        </div>
      ) : null}

      <Tabs defaultValue="overview" className="mx-auto max-w-[1500px]">
        <div className="flex min-h-[calc(100vh-4rem)]">
          <aside className="hidden w-60 shrink-0 border-r bg-background p-4 lg:block">
            <TabsList className="flex h-auto w-full flex-col items-stretch bg-transparent">
              {[
                ["overview", LayoutDashboard, "Overview"],
                ["analytics", TrendingUp, "Analytics"],
                ["leads", Mail, "Leads"],
                ["design", Palette, "Design"],
                ["menu", BookOpenText, "Menu"],
                ["imagery", ImageIcon, "Imagery"],
                ["integrations", Link2, "Integrations"],
                ["domain", Globe2, "Domain"],
                ["settings", Settings, "Settings"],
              ].map(([value, Icon, label]) => (
                <TabsTrigger
                  key={value as string}
                  value={value as string}
                  className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-muted"
                >
                  <Icon className="size-4" />
                  {label as string}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="mt-8 rounded-xl border bg-muted/40 p-3">
              <p className="text-xs font-medium">Signed in as</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {email}
              </p>
            </div>
          </aside>

          <div className="min-w-0 flex-1 p-4 md:p-7 lg:p-10">
            <TabsList className="mb-6 w-full justify-start overflow-x-auto lg:hidden">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="leads">Leads</TabsTrigger>
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="menu">Menu</TabsTrigger>
              <TabsTrigger value="imagery">Imagery</TabsTrigger>
              <TabsTrigger value="integrations">Links</TabsTrigger>
              <TabsTrigger value="domain">Domain</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <PageHeading
                eyebrow="Restaurant overview"
                title={`Good afternoon, ${draft.name}.`}
                copy="Everything guests see, and everything Cornershopdev is watching."
              />
              <div className="mt-8 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
                <Card className="overflow-hidden py-0">
                  <div className="grid md:grid-cols-[1fr_230px]">
                    <div className="p-6">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/10 text-emerald-700"
                        >
                          <Check /> Preview healthy
                        </Badge>
                        <Badge variant="outline">Mobile-first</Badge>
                      </div>
                      <h2 className="font-display mt-6 text-4xl tracking-[-0.04em]">
                        {draft.name}
                      </h2>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                        {draft.description}
                      </p>
                      <div className="mt-6 flex flex-wrap gap-2">
                        <Button
                          render={
                            <Link
                              href={`/preview/${draft.slug}`}
                              target="_blank"
                            />
                          }
                          size="sm"
                        >
                          Open preview <ArrowUpRight />
                        </Button>
                        <Button variant="outline" size="sm">
                          Edit homepage
                        </Button>
                      </div>
                    </div>
                    <div className="relative min-h-64">
                      {draft.heroImageUrl ? (
                        <div
                          role="img"
                          aria-label={`${draft.name} hero`}
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: `url("${draft.heroImageUrl}")`,
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Launch checklist</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      ["Menu imported", true],
                      ["Booking link preserved", true],
                      ["Owner account claimed", !demo],
                      ["Custom domain connected", false],
                    ].map(([label, done]) => (
                      <div
                        key={label as string}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{label as string}</span>
                        <span
                          className={`grid size-5 place-items-center rounded-full ${
                            done
                              ? "bg-emerald-500/12 text-emerald-700"
                              : "border text-muted-foreground"
                          }`}
                        >
                          {done ? <Check className="size-3" /> : null}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                <Metric label="Menu items" value={`${draft.menuSections.reduce((sum, section) => sum + section.items.length, 0)}`} detail={`${draft.menuSections.length} sections`} />
                <Metric label="Preserved systems" value={`${draft.integrations.length}`} detail="No migrations required" />
                <Metric label="Last source check" value="Just now" detail="No changes detected" />
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="mt-0">
              <ClientAnalyticsPanel summary={analyticsSummary} />
            </TabsContent>

            <TabsContent value="leads" className="mt-0">
              <ClientBookingRequestInbox
                siteSlug={draft.slug}
                initialInbox={bookingInbox}
                demo={demo}
              />
            </TabsContent>

            <TabsContent value="design" className="mt-0">
              <PageHeading
                eyebrow="Website design"
                title="Choose the right service experience."
                copy="Preview every compatible renderer with your restaurant content. A choice changes only the private draft until you Save and Publish."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={restoreAutomaticTheme}
                    disabled={
                      currentThemeSelection !== null &&
                      currentThemeSelection.source !== "owner"
                    }
                  >
                    <RotateCcw />
                    {currentThemeSelection
                      ? "Restore automatic"
                      : "Use automatic match"}
                  </Button>
                }
              />

              <Card className="mt-8">
                <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Current private draft
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {currentThemeSelection
                        ? themeManifests.find(
                            (theme) =>
                              theme.id === currentThemeSelection.themeId,
                          )?.name
                        : "Legacy restaurant design"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {currentThemeSelection
                        ? `${currentThemeSelection.source === "owner" ? "Owner selected" : "Automatically matched"} · immutable renderer v${currentThemeSelection.rendererVersion}`
                        : `Automatic match available: ${
                            themeManifests.find(
                              (theme) =>
                                theme.id === automaticThemeSelection.themeId,
                            )?.name
                          }`}
                    </p>
                  </div>
                  {themeDirty ? (
                    <Badge variant="outline">Save to keep this choice</Badge>
                  ) : (
                    <Badge className="bg-emerald-600 text-white">
                      Stored private draft
                    </Badge>
                  )}
                </CardContent>
              </Card>

              <div className="mt-5 grid gap-5 xl:grid-cols-3">
                {themeManifests.map((manifest) => {
                  const selected =
                    currentThemeSelection?.themeId === manifest.id;
                  const automatic =
                    automaticThemeSelection.themeId === manifest.id;
                  return (
                    <Card
                      key={manifest.id}
                      className={
                        selected
                          ? "overflow-hidden border-primary ring-2 ring-primary/15"
                          : "overflow-hidden"
                      }
                    >
                      <div
                        className="relative aspect-[16/9] border-b bg-cover bg-center"
                        style={{
                          backgroundColor:
                            manifest.safeDefaultTokens.colors.background,
                          backgroundImage: `url("/themes/restaurant/${manifest.id}.webp")`,
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 text-white">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/70">
                              renderer v{manifest.rendererVersion}
                            </p>
                            <h2 className="mt-1 text-xl font-semibold">
                              {manifest.name}
                            </h2>
                          </div>
                          {selected ? <Badge>Selected</Badge> : null}
                        </div>
                      </div>
                      <CardContent className="space-y-5 pt-6">
                        <p className="text-sm leading-6 text-muted-foreground">
                          {manifest.description}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {manifest.experience.primaryIntent}-led
                          </Badge>
                          <Badge variant="secondary">
                            {manifest.experience.menuExperience} menu
                          </Badge>
                          {automatic ? (
                            <Badge variant="outline">Automatic match</Badge>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            render={
                              <Link
                                href={`/dashboard/themes/${manifest.id}`}
                                target="_blank"
                              />
                            }
                            nativeButton={false}
                            variant="outline"
                            size="sm"
                          >
                            <Eye /> Preview
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => selectTheme(manifest.id)}
                            disabled={
                              selected &&
                              currentThemeSelection?.source === "owner"
                            }
                          >
                            <Check />
                            {selected ? "Selected" : "Use theme"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className="mt-8">
                <CardHeader>
                  <CardTitle className="text-base">
                    Published history
                  </CardTitle>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Rollback creates a new immutable version from a previous
                    snapshot. Your private draft remains untouched.
                  </p>
                </CardHeader>
                <CardContent>
                  {publicationHistory.length > 0 ? (
                    <div className="divide-y">
                      {publicationHistory.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">
                                Version {item.version}
                              </p>
                              {item.current ? (
                                <Badge className="bg-emerald-600 text-white">
                                  Live
                                </Badge>
                              ) : null}
                              <Badge variant="outline">
                                {item.theme.id} · {item.theme.version}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.changeSummary} ·{" "}
                              {new Intl.DateTimeFormat(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(item.publishedAt))}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              item.current ||
                              rollbackLoading !== null ||
                              demo
                            }
                            onClick={() => void rollback(item.id)}
                          >
                            {rollbackLoading === item.id ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <RotateCcw />
                            )}
                            {item.current ? "Currently live" : "Rollback"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Publish the site once to start immutable version history.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="menu" className="mt-0">
              <RestaurantMenuEditor
                draft={draft}
                dirty={menuDirty}
                saving={saving}
                saveError={menuSaveError}
                validationIssues={menuValidationIssues}
                canUndo={menuUndoStack.length > 0}
                regeneratingLocale={regeneratingLocale}
                onMutation={mutateMenu}
                onTranslationChange={changeTranslation}
                onReviewTranslation={reviewTranslation}
                onRegenerateTranslation={(locale) =>
                  void regenerateTranslation(locale)
                }
                onUndo={undoMenuDeletion}
                onSave={() => void save()}
              />
            </TabsContent>

            <TabsContent value="imagery" className="mt-0">
              <PageHeading
                eyebrow="Image library"
                title="Authentic photos, professionally finished."
                copy="Cornershopdev improves light, colour, crop and clarity without inventing dishes or changing what guests will receive."
                action={
                  <Button
                    size="sm"
                    onClick={() => void enhanceImage()}
                    disabled={
                      imageLoading ||
                      !(
                        draft.heroOriginalImageUrl ??
                        draft.heroImageUrl
                      )?.startsWith("https://")
                    }
                  >
                    {imageLoading ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    Enhance current hero
                  </Button>
                }
              />
              <Card className="mt-8">
                <CardContent className="flex items-center justify-between gap-6 pt-6">
                  <div>
                    <Label htmlFor="auto-enhance-images" className="text-sm">
                      Automatically enhance approved photos
                    </Label>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                      Uses only restaurant-owned or permissioned customer
                      photos. Originals remain stored and every enhanced image
                      still requires review.
                    </p>
                  </div>
                  <Switch
                    id="auto-enhance-images"
                    checked={draft.autoEnhanceImages}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        autoEnhanceImages: checked,
                      }))
                    }
                  />
                </CardContent>
              </Card>
              <Card className="mt-4">
                <CardContent className="flex items-center justify-between gap-6 pt-6">
                  <div>
                    <Label htmlFor="show-menu-images" className="text-sm">
                      Show dish imagery on the website
                    </Label>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                      Keep this off for a clean, text-led menu. Existing images
                      remain saved in the library and can be enabled later.
                    </p>
                  </div>
                  <Switch
                    id="show-menu-images"
                    checked={draft.showMenuImages}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        showMenuImages: checked,
                      }))
                    }
                  />
                </CardContent>
              </Card>
              <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {[draft.heroImageUrl, ...draft.menuSections.flatMap((section) =>
                  section.items.map((item) => item.imageUrl),
                )]
                  .filter(Boolean)
                  .map((src, index) => (
                    <Card key={`${src}-${index}`} className="overflow-hidden py-0">
                      <div className="relative aspect-[4/3]">
                        <div
                          role="img"
                          aria-label={`${draft.name} website visual ${index + 1}`}
                          className="absolute inset-0 bg-cover bg-center"
                          style={{ backgroundImage: `url("${src as string}")` }}
                        />
                        <Badge className="absolute left-3 top-3 bg-black/60 text-white">
                          {index === 0
                            ? draft.heroOriginalImageUrl &&
                              draft.heroImageUrl !==
                                draft.heroOriginalImageUrl
                              ? "Enhanced from authentic original"
                              : "Authentic original"
                            : "Approved menu image"}
                        </Badge>
                      </div>
                    </Card>
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="integrations" className="mt-0">
              <RestaurantIntegrationEditor
                draft={draft}
                dirty={integrationDirty}
                saving={saving}
                saveError={integrationSaveError}
                validationIssues={integrationValidationIssues}
                savedRevision={savedRevision}
                canUndo={integrationUndoStack.length > 0}
                onMutation={mutateIntegration}
                onTranslationLabelChange={
                  changeIntegrationTranslationLabel
                }
                onReviewTranslation={reviewIntegrationTranslation}
                onUndo={undoIntegrationRemoval}
                onSave={() => void save()}
              />
            </TabsContent>

            <TabsContent value="domain" className="mt-0">
              <PageHeading
                eyebrow="Go live"
                title="Connect the restaurant's domain."
                copy="The old website stays live until these records are changed. Email and booking systems remain untouched."
              />
              <div className="mt-8 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Restaurant domain</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Label htmlFor="domain">Domain name</Label>
                    <Input
                      id="domain"
                      value={domain}
                      onChange={(event) => setDomain(event.target.value)}
                      placeholder="restaurant.com"
                      className="mt-2 h-11"
                    />
                    {domainError ? (
                      <p className="mt-3 text-xs text-destructive">
                        {domainError}
                      </p>
                    ) : null}
                    <Button
                      className="mt-4 w-full"
                      onClick={() => void connectDomain()}
                      disabled={!domain || domainLoading}
                    >
                      {domainLoading ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Globe2 />
                      )}
                      Add domain
                    </Button>
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                      Cornershopdev authorizes the domain for automatic SSL before
                      asking for DNS changes.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {domainSetup
                        ? "DNS records to copy"
                        : "What happens next"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {domainSetup ? (
                      <div className="space-y-3">
                        {domainSetup.records.map((record) => (
                          <div
                            key={`${record.type}-${record.name}`}
                            className="grid grid-cols-[70px_1fr_auto] items-center gap-3 rounded-xl border bg-muted/35 p-3"
                          >
                            <Badge variant="outline">{record.type}</Badge>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {record.name}
                              </p>
                              <p className="truncate font-mono text-xs">
                                {record.value}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                navigator.clipboard.writeText(record.value)
                              }
                            >
                              <Copy />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={async () => {
                            const response = await fetch(
                              `/api/domains?hostname=${encodeURIComponent(domainSetup.hostname)}&siteSlug=${encodeURIComponent(draft.slug)}`,
                            );
                            const result = (await response.json()) as {
                              verified?: boolean;
                            };
                            setDomainSetup((current) =>
                              current
                                ? {
                                    ...current,
                                    verified: Boolean(result.verified),
                                  }
                                : current,
                            );
                          }}
                        >
                          <RefreshCcw />
                          {domainSetup.verified
                            ? "Domain connected"
                            : "Check DNS again"}
                        </Button>
                      </div>
                    ) : (
                      <ol className="space-y-5 text-sm">
                        {[
                          "Cornershopdev authorizes the domain on the production host.",
                          "The exact DNS record appears here for copying into your DNS provider.",
                          "Once DNS resolves, SSL is issued and the new site becomes live.",
                        ].map((step, index) => (
                          <li key={step} className="flex gap-3">
                            <span className="grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[10px]">
                              {index + 1}
                            </span>
                            <span className="leading-6 text-muted-foreground">
                              {step}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0">
              <PageHeading
                eyebrow="Restaurant settings"
                title="The source of truth."
                copy="Core business details used across the website and structured metadata."
              />
              <Card className="mt-8 max-w-3xl">
                <CardContent className="grid gap-5 pt-6">
                  <div className="grid gap-2">
                    <Label>Restaurant name</Label>
                    <Input
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Description</Label>
                    <Textarea
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Address</Label>
                      <Input
                        value={draft.address}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            address: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Phone</Label>
                      <Input
                        value={draft.phone}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </main>
  );
}

function PageHeading({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          {eyebrow}
        </p>
        <h1 className="font-display mt-2 text-5xl leading-none tracking-[-0.045em]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy}
        </p>
      </div>
      {action}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display mt-2 text-4xl tracking-[-0.04em]">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
