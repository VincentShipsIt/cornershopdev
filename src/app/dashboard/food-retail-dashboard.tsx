"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Save, Send, Trash2 } from "lucide-react";
import { AccountActions } from "@/components/account-actions";
import { Brand } from "@/components/brand";
import { SiteRenderer } from "@/components/site-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Vertical } from "@/generated/prisma/enums";
import type { BrandIdentity } from "@/lib/brand";
import { foodRetailSiteDraftSchema, type FoodRetailSiteDraft } from "@/lib/verticals/food-retail/schema";

export function FoodRetailDashboard({
  email,
  brand,
  initialDraft,
}: {
  email: string;
  brand: BrandIdentity;
  initialDraft: FoodRetailSiteDraft;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [revision, setRevision] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateSection(
    sectionIndex: number,
    update: (section: FoodRetailSiteDraft["catalogSections"][number]) => void,
  ) {
    setDraft((current) => {
      const next = structuredClone(current);
      update(next.catalogSections[sectionIndex]);
      return next;
    });
    setNotice(null);
  }

  function updateItem(
    sectionIndex: number,
    itemIndex: number,
    update: (
      item: FoodRetailSiteDraft["catalogSections"][number]["items"][number],
    ) => void,
  ) {
    updateSection(sectionIndex, (section) => update(section.items[itemIndex]));
  }

  function removeSection(sectionIndex: number) {
    setDraft((current) => ({
      ...current,
      catalogSections: current.catalogSections.filter(
        (_, index) => index !== sectionIndex,
      ),
      translations: current.translations.map((translation) => ({
        ...translation,
        catalogSections: translation.catalogSections.filter(
          (_, index) => index !== sectionIndex,
        ),
      })),
    }));
  }

  function addSection() {
    setDraft((current) => ({
      ...current,
      catalogSections: [
        ...current.catalogSections,
        { name: "", description: "", items: [] },
      ],
      translations: current.translations.map((translation) => ({
        ...translation,
        catalogSections: [
          ...translation.catalogSections,
          { name: "", description: "", items: [] },
        ],
      })),
    }));
  }

  function removeItem(sectionIndex: number, itemIndex: number) {
    setDraft((current) => {
      const next = structuredClone(current);
      next.catalogSections[sectionIndex].items.splice(itemIndex, 1);
      next.translations.forEach((translation) => {
        translation.catalogSections[sectionIndex]?.items.splice(itemIndex, 1);
      });
      return next;
    });
  }

  function addItem(sectionIndex: number) {
    setDraft((current) => {
      const next = structuredClone(current);
      next.catalogSections[sectionIndex].items.push({
        name: "",
        description: "",
        price: null,
        currency: "EUR",
        available: true,
        imageUrl: null,
        attributes: {
          seasonalAvailability: "",
          preorderRequired: null,
          preorderNote: "",
          allergens: [],
          allergenSourceUrl: null,
        },
      });
      next.translations.forEach((translation) => {
        translation.catalogSections[sectionIndex]?.items.push({
          name: "",
          description: "",
          attributes: {
            seasonalAvailability: "",
            preorderNote: "",
            allergens: [],
          },
        });
      });
      return next;
    });
  }

  function addIntegration() {
    setDraft((current) => ({
      ...current,
      integrations: [
        ...current.integrations,
        {
          type: "ordering",
          label: "",
          provider: null,
          url: "",
          enabled: true,
          venueId: null,
        },
      ],
      translations: current.translations.map((translation) => ({
        ...translation,
        integrationLabels: [...translation.integrationLabels, ""],
      })),
    }));
  }

  function removeIntegration(integrationIndex: number) {
    setDraft((current) => ({
      ...current,
      integrations: current.integrations.filter(
        (_, index) => index !== integrationIndex,
      ),
      translations: current.translations.map((translation) => ({
        ...translation,
        integrationLabels: translation.integrationLabels.filter(
          (_, index) => index !== integrationIndex,
        ),
      })),
    }));
  }

  async function saveDraft(): Promise<boolean> {
    const parsed = foodRetailSiteDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the draft fields");
      return false;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/sites/${draft.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          ...(revision === null ? {} : { expectedRevision: revision }),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        revision?: number;
      };
      if (!response.ok) throw new Error(result.error ?? "Save failed");
      setDraft(parsed.data);
      setRevision(result.revision ?? null);
      setNotice("Draft saved privately.");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    const changeSummary = window
      .prompt("Summarize what will change on the public site:", "Update product ranges and shop details")
      ?.trim();
    if (!changeSummary) return;
    if (changeSummary.length < 3 || changeSummary.length > 280) {
      setError("Use a change summary between 3 and 280 characters");
      return;
    }
    if (!window.confirm("Publish this saved food-shop draft now?")) return;
    setPublishing(true);
    setError(null);
    try {
      if (!(await saveDraft())) return;
      const response = await fetch(`/api/sites/${draft.slug}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSummary }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Publish failed");
      setNotice("Published to the site’s configured public address.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/35 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4">
          <Brand {...brand} />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
            <AccountActions canSwitch />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-6 px-5 py-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(430px,1.1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Food retail owner workspace</p>
                <CardTitle className="mt-1">Products, pickup and hours</CardTitle>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button render={<Link href={`/preview/${draft.slug}`} target="_blank" />} nativeButton={false} variant="outline">
                  Preview <ExternalLink />
                </Button>
                <Button variant="outline" disabled={saving || publishing} onClick={() => void saveDraft()}>
                  <Save /> {saving ? "Saving…" : "Save"}
                </Button>
                <Button disabled={saving || publishing} onClick={() => void publishDraft()}>
                  <Send /> {publishing ? "Publishing…" : "Publish"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Shop details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Business name"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
              <Field label="Shop type">
                <select className="h-9 w-full rounded-lg border bg-background px-3 text-sm" value={draft.attributes.shopType} onChange={(event) => setDraft({ ...draft, attributes: { ...draft.attributes, shopType: event.target.value as FoodRetailSiteDraft["attributes"]["shopType"] } })}>
                  <option value="bakery">Bakery</option><option value="patisserie">Patisserie</option><option value="butcher">Butcher</option><option value="deli">Deli</option><option value="cheesemonger">Cheesemonger</option><option value="grocer">Grocer</option><option value="local-food-shop">Local food shop</option>
                </select>
              </Field>
              <Field label="Address"><Input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></Field>
              <Field label="Phone"><Input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></Field>
              <Field label="Pickup details" className="sm:col-span-2"><Textarea value={draft.attributes.pickupDetails} onChange={(event) => setDraft({ ...draft, attributes: { ...draft.attributes, pickupDetails: event.target.value } })} /></Field>
              <Field label="Description" className="sm:col-span-2"><Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
              <div className="flex items-center justify-between gap-4 sm:col-span-2">
                <div><Label htmlFor="show-product-images">Show product gallery</Label><p className="text-xs text-muted-foreground">Only source or owner-approved images are rendered.</p></div>
                <Switch id="show-product-images" checked={draft.attributes.showProductImages} onCheckedChange={(checked) => setDraft({ ...draft, attributes: { ...draft.attributes, showProductImages: checked } })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Store hours</CardTitle><Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, businessHours: [...draft.businessHours, { days: "", hours: "" }] })}><Plus /> Add hours</Button></CardHeader>
            <CardContent className="space-y-3">
              {draft.businessHours.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input aria-label={`Days ${index + 1}`} placeholder="Monday–Friday" value={row.days} onChange={(event) => setDraft({ ...draft, businessHours: draft.businessHours.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, days: event.target.value } : candidate) })} /><Input aria-label={`Hours ${index + 1}`} placeholder="07:00–16:00" value={row.hours} onChange={(event) => setDraft({ ...draft, businessHours: draft.businessHours.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, hours: event.target.value } : candidate) })} /><Button size="icon-sm" variant="ghost" aria-label={`Remove hours ${index + 1}`} onClick={() => setDraft({ ...draft, businessHours: draft.businessHours.filter((_, candidateIndex) => candidateIndex !== index) })}><Trash2 /></Button></div>)}
            </CardContent>
          </Card>

          {draft.catalogSections.map((section, sectionIndex) => (
            <Card key={sectionIndex}>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="grid flex-1 gap-2"><Input aria-label={`Category ${sectionIndex + 1} name`} value={section.name} onChange={(event) => updateSection(sectionIndex, (next) => { next.name = event.target.value; })} /><Input aria-label={`Category ${sectionIndex + 1} description`} placeholder="Category description" value={section.description} onChange={(event) => updateSection(sectionIndex, (next) => { next.description = event.target.value; })} /></div>
                <Button size="icon-sm" variant="ghost" aria-label={`Remove category ${sectionIndex + 1}`} disabled={draft.catalogSections.length === 1} onClick={() => removeSection(sectionIndex)}><Trash2 /></Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {section.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="space-y-3 rounded-xl border p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]"><Input aria-label={`Product ${itemIndex + 1} name`} placeholder="Product name" value={item.name} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.name = event.target.value; })} /><Input aria-label={`Product ${itemIndex + 1} price`} type="number" min="0" step="0.01" placeholder="No price" value={item.price ?? ""} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.price = event.target.value === "" ? null : Number(event.target.value); })} /><Button size="icon-sm" variant="ghost" aria-label={`Remove product ${itemIndex + 1}`} onClick={() => removeItem(sectionIndex, itemIndex)}><Trash2 /></Button></div>
                    <Textarea aria-label={`Product ${itemIndex + 1} description`} placeholder="Sourced product description" value={item.description} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.description = event.target.value; })} />
                    <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/55 px-3 py-2"><div><Label htmlFor={`available-${sectionIndex}-${itemIndex}`}>Show as currently available</Label><p className="text-xs text-muted-foreground">Turn this off only when the source or owner confirms it.</p></div><Switch id={`available-${sectionIndex}-${itemIndex}`} checked={item.available} onCheckedChange={(checked) => updateItem(sectionIndex, itemIndex, (next) => { next.available = checked; })} /></div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_150px_1fr]"><Input aria-label={`Product ${itemIndex + 1} seasonal availability`} placeholder="Seasonal availability (only if sourced)" value={item.attributes.seasonalAvailability} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.attributes.seasonalAvailability = event.target.value; })} /><select aria-label={`Product ${itemIndex + 1} preorder requirement`} className="h-9 rounded-lg border bg-background px-2 text-sm" value={item.attributes.preorderRequired === null ? "unknown" : item.attributes.preorderRequired ? "required" : "not-required"} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.attributes.preorderRequired = event.target.value === "unknown" ? null : event.target.value === "required"; })}><option value="unknown">Preorder unknown</option><option value="required">Preorder required</option><option value="not-required">No preorder required</option></select><Input aria-label={`Product ${itemIndex + 1} preorder note`} placeholder="Preorder note (only if sourced)" value={item.attributes.preorderNote} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.attributes.preorderNote = event.target.value; })} /></div>
                    <div className="grid gap-3 sm:grid-cols-2"><Input aria-label={`Product ${itemIndex + 1} allergens`} placeholder="Allergens, comma separated" value={item.attributes.allergens.join(", ")} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.attributes.allergens = event.target.value.split(",").map((value) => value.trim()).filter(Boolean); })} /><Input aria-label={`Product ${itemIndex + 1} allergen source`} type="url" placeholder="Required source URL for allergens" value={item.attributes.allergenSourceUrl ?? ""} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.attributes.allergenSourceUrl = event.target.value || null; })} /></div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_180px]"><Input aria-label={`Product ${itemIndex + 1} image`} type="url" placeholder="Approved product image URL" value={item.imageUrl ?? ""} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.imageUrl = event.target.value || null; if (!next.imageUrl) next.imageProvenance = null; })} /><select aria-label={`Product ${itemIndex + 1} image provenance`} className="h-9 rounded-lg border bg-background px-2 text-sm" value={item.imageProvenance ?? ""} onChange={(event) => updateItem(sectionIndex, itemIndex, (next) => { next.imageProvenance = (event.target.value || null) as "official" | "owner" | "permissioned-ugc" | null; })}><option value="">Choose image source</option><option value="official">Official source</option><option value="owner">Owner supplied</option><option value="permissioned-ugc">Permissioned UGC</option></select></div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => addItem(sectionIndex)}><Plus /> Add sourced product</Button>
              </CardContent>
            </Card>
          ))}

          <Button variant="outline" onClick={addSection}><Plus /> Add product category</Button>

          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>Preorder and delivery links</CardTitle><Button size="sm" variant="outline" onClick={addIntegration}><Plus /> Add link</Button></CardHeader>
            <CardContent className="space-y-3">
              {draft.integrations.filter((integration) => integration.type !== "social").map((integration) => {
                const integrationIndex = draft.integrations.indexOf(integration);
                return <div key={integrationIndex} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[130px_1fr_1.4fr_auto]"><select aria-label={`Link ${integrationIndex + 1} type`} className="h-9 rounded-lg border bg-background px-2 text-sm" value={integration.type} onChange={(event) => setDraft({ ...draft, integrations: draft.integrations.map((candidate, index) => index === integrationIndex ? { ...candidate, type: event.target.value as "ordering" | "delivery" } : candidate) })}><option value="ordering">Preorder</option><option value="delivery">Delivery</option></select><Input aria-label={`Link ${integrationIndex + 1} label`} placeholder="Order for pickup" value={integration.label} onChange={(event) => setDraft({ ...draft, integrations: draft.integrations.map((candidate, index) => index === integrationIndex ? { ...candidate, label: event.target.value } : candidate) })} /><Input aria-label={`Link ${integrationIndex + 1} URL`} type="url" placeholder="https://…" value={integration.url} onChange={(event) => setDraft({ ...draft, integrations: draft.integrations.map((candidate, index) => index === integrationIndex ? { ...candidate, url: event.target.value } : candidate) })} /><Button size="icon-sm" variant="ghost" aria-label={`Remove link ${integrationIndex + 1}`} onClick={() => removeIntegration(integrationIndex)}><Trash2 /></Button></div>;
              })}
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]">
          <div className="h-full overflow-auto rounded-[2rem] border-[8px] border-[#171914] bg-white shadow-2xl">
            <SiteRenderer draft={draft} vertical={Vertical.FOOD_RETAIL} embedded />
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><Label className="mb-2">{label}</Label>{children}</div>;
}
