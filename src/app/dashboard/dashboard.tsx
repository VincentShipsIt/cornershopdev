"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenText,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Globe2,
  ImageIcon,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  formatPrice,
  type RestaurantDraft,
} from "@/lib/restaurant";

type DomainSetup = {
  hostname: string;
  attached: boolean;
  verified: boolean;
  records: Array<{ type: string; name: string; value: string }>;
};

export function Dashboard({
  initialDraft,
  email,
  checkoutComplete,
  demo,
}: {
  initialDraft: RestaurantDraft;
  email: string;
  checkoutComplete: boolean;
  demo: boolean;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [domain, setDomain] = useState("");
  const [domainSetup, setDomainSetup] = useState<DomainSetup | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainLoading, setDomainLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      if (!demo) {
        const response = await fetch(`/api/sites/${draft.slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        if (!response.ok) throw new Error("Save failed");
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
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
          <Brand />
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
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </header>

      {checkoutComplete ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-center text-sm text-emerald-800">
          <CircleCheck className="mr-2 inline size-4" />
          Account created. Your website remains private until the domain is
          connected.
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
              <TabsTrigger value="menu">Menu</TabsTrigger>
              <TabsTrigger value="imagery">Imagery</TabsTrigger>
              <TabsTrigger value="integrations">Links</TabsTrigger>
              <TabsTrigger value="domain">Domain</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <PageHeading
                eyebrow="Restaurant overview"
                title={`Good afternoon, ${draft.name}.`}
                copy="Everything guests see, and everything Restofront is watching."
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

            <TabsContent value="menu" className="mt-0">
              <PageHeading
                eyebrow="Menu editor"
                title="The menu, structured."
                copy="Edit what guests see. Prices and dietary labels stay machine-readable."
                action={
                  <Button size="sm">
                    <Plus /> Add item
                  </Button>
                }
              />
              <div className="mt-8 space-y-5">
                {draft.menuSections.map((section, sectionIndex) => (
                  <Card key={section.name}>
                    <CardHeader className="flex-row items-center justify-between">
                      <div>
                        <CardTitle>{section.name}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {section.description}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal />
                      </Button>
                    </CardHeader>
                    <CardContent className="divide-y">
                      {section.items.map((item, itemIndex) => (
                        <div
                          key={`${sectionIndex}-${itemIndex}`}
                          className="grid gap-4 py-5 md:grid-cols-[1fr_1.5fr_110px_auto]"
                        >
                          <Input
                            value={item.name}
                            onChange={(event) =>
                              setDraft((current) => {
                                const menuSections = structuredClone(
                                  current.menuSections,
                                );
                                menuSections[sectionIndex].items[
                                  itemIndex
                                ].name = event.target.value;
                                return { ...current, menuSections };
                              })
                            }
                          />
                          <Input
                            value={item.description}
                            onChange={(event) =>
                              setDraft((current) => {
                                const menuSections = structuredClone(
                                  current.menuSections,
                                );
                                menuSections[sectionIndex].items[
                                  itemIndex
                                ].description = event.target.value;
                                return { ...current, menuSections };
                              })
                            }
                          />
                          <Input
                            type="number"
                            value={item.price ?? ""}
                            onChange={(event) =>
                              setDraft((current) => {
                                const menuSections = structuredClone(
                                  current.menuSections,
                                );
                                menuSections[sectionIndex].items[
                                  itemIndex
                                ].price = event.target.value
                                  ? Number(event.target.value)
                                  : null;
                                return { ...current, menuSections };
                              })
                            }
                            aria-label={`Price for ${item.name}`}
                          />
                          <span className="self-center font-mono text-xs text-muted-foreground">
                            {formatPrice(item.price, item.currency)}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="imagery" className="mt-0">
              <PageHeading
                eyebrow="Image library"
                title="Authentic photos, professionally finished."
                copy="Restofront improves light, colour, crop and clarity without inventing dishes or changing what guests will receive."
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
              <PageHeading
                eyebrow="Existing systems"
                title="Keep what already works."
                copy="Restofront sends guests to the restaurant's current booking, ordering and delivery providers."
              />
              <div className="mt-8 grid gap-4">
                {draft.integrations.map((integration) => (
                  <Card key={integration.url}>
                    <CardContent className="flex items-center gap-4 pt-6">
                      <span className="grid size-10 place-items-center rounded-xl bg-muted">
                        <Link2 className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{integration.label}</p>
                          <Badge variant="secondary" className="text-[10px]">
                            {integration.type}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {integration.provider ?? "External provider"} ·{" "}
                          {integration.url}
                        </p>
                      </div>
                      <Switch defaultChecked />
                      <Button
                        render={
                          <Link href={integration.url} target="_blank" />
                        }
                        variant="ghost"
                        size="icon-sm"
                      >
                        <ExternalLink />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                <Button variant="outline" className="h-14 border-dashed">
                  <Plus /> Add another link
                </Button>
              </div>
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
                      Restofront authorizes the domain for automatic SSL before
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
                          "Restofront authorizes the domain on the production host.",
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
