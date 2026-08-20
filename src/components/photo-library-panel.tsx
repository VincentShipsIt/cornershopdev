"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Photo = {
  id: string;
  sourceUrl: string;
  sourcePageUrl: string | null;
  provenance: "OFFICIAL" | "OWNER" | "PERMISSIONED_UGC";
  sourceKind: "FIRST_PARTY" | "OWNER_REFERENCE" | "OWNER_UPLOAD";
  originalUrl: string;
  candidateUsages: Array<"HERO" | "GALLERY" | "CATALOG">;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  selectedUsage: "HERO" | "GALLERY" | "CATALOG" | null;
  selectedCatalogItemId: string | null;
  activeVariant: "ORIGINAL" | "ENHANCED";
  enhancedUrl: string | null;
  enhancedReviewStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  enhancementStatus:
    | "NOT_REQUESTED"
    | "QUEUED"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "SKIPPED";
  enhancementModel: string | null;
  enhancementCostMicros: number | null;
};

type PhotoLibrary = {
  draftRevision: number;
  photos: Photo[];
  catalogItems: Array<{
    id: string;
    name: string;
    sectionName: string;
    sectionIndex: number;
    itemIndex: number;
  }>;
  budget: {
    committedMicros: number;
    ceilingMicros: number;
    perImageCeilingMicros: number;
  };
};

export function PhotoLibraryPanel({
  siteSlug,
  onHeroChange,
  onRevision,
  onCatalogChange,
}: {
  siteSlug: string;
  onHeroChange: (
    hero: { url: string; originalUrl: string; provenance: "official" | "owner" | "permissioned-ugc" } | null,
  ) => void;
  onRevision: (revision: number) => void;
  onCatalogChange: (change: {
    sectionIndex: number;
    itemIndex: number;
    url: string | null;
    originalUrl: string | null;
    provenance: "official" | "owner" | "permissioned-ugc" | null;
  }) => void;
}) {
  const [library, setLibrary] = useState<PhotoLibrary | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enhancementRequest = useRef<{ scope: string; key: string } | null>(null);
  const approvedIds = useMemo(
    () =>
      library?.photos
        .filter(
          (photo) =>
            photo.reviewStatus === "APPROVED" &&
            ["NOT_REQUESTED", "FAILED"].includes(photo.enhancementStatus),
        )
        .map((photo) => photo.id) ?? [],
    [library],
  );

  const syncLibrary = useCallback((next: PhotoLibrary, clearMissingHero = false) => {
    setLibrary(next);
    onRevision(next.draftRevision);
    for (const photo of next.photos) {
      if (!photo.selectedCatalogItemId) continue;
      const item = next.catalogItems.find(
        (candidate) => candidate.id === photo.selectedCatalogItemId,
      );
      if (!item) continue;
      onCatalogChange({
        sectionIndex: item.sectionIndex,
        itemIndex: item.itemIndex,
        url:
          photo.activeVariant === "ENHANCED" &&
          photo.enhancedReviewStatus === "APPROVED" &&
          photo.enhancedUrl
            ? photo.enhancedUrl
            : photo.originalUrl,
        originalUrl: photo.originalUrl,
        provenance: photo.provenance.toLowerCase().replaceAll("_", "-") as
          | "official"
          | "owner"
          | "permissioned-ugc",
      });
    }
    const hero = next.photos.find((photo) => photo.selectedUsage === "HERO");
    if (!hero) {
      if (clearMissingHero) onHeroChange(null);
      return;
    }
    onHeroChange({
      url:
        hero.activeVariant === "ENHANCED" &&
        hero.enhancedReviewStatus === "APPROVED" &&
        hero.enhancedUrl
          ? hero.enhancedUrl
          : hero.originalUrl,
      originalUrl: hero.originalUrl,
      provenance: hero.provenance.toLowerCase().replaceAll("_", "-") as
        | "official"
        | "owner"
        | "permissioned-ugc",
    });
  }, [onCatalogChange, onHeroChange, onRevision]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/sites/${encodeURIComponent(siteSlug)}/photos`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as PhotoLibrary & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Photo library could not load");
        if (active) syncLibrary(body);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Photo library could not load");
      });
    return () => {
      active = false;
    };
  }, [siteSlug, syncLibrary]);

  async function mutate(
    photoId: string,
    action: string,
    extra?: Record<string, string>,
  ) {
    const clearedSelectedHero =
      ["unselect", "select_gallery", "select_catalog"].includes(action) &&
      library?.photos.some(
        (photo) => photo.id === photoId && photo.selectedUsage === "HERO",
      );
    const previousPhoto = library?.photos.find((photo) => photo.id === photoId);
    setPending(`${photoId}:${action}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/sites/${encodeURIComponent(siteSlug)}/photos/${encodeURIComponent(photoId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        },
      );
      const body = (await response.json()) as PhotoLibrary & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Photo review failed");
      syncLibrary(body, clearedSelectedHero);
      const updatedPhoto = body.photos.find((photo) => photo.id === photoId);
      const previousCatalog = library?.catalogItems.find(
        (item) => item.id === previousPhoto?.selectedCatalogItemId,
      );
      if (
        previousCatalog &&
        updatedPhoto?.selectedCatalogItemId !== previousCatalog.id
      ) {
        onCatalogChange({
          sectionIndex: previousCatalog.sectionIndex,
          itemIndex: previousCatalog.itemIndex,
          url: null,
          originalUrl: null,
          provenance: null,
        });
      }
      const selectedCatalog = body.catalogItems.find(
        (item) => item.id === updatedPhoto?.selectedCatalogItemId,
      );
      if (selectedCatalog && updatedPhoto) {
        onCatalogChange({
          sectionIndex: selectedCatalog.sectionIndex,
          itemIndex: selectedCatalog.itemIndex,
          url:
            updatedPhoto.activeVariant === "ENHANCED" &&
            updatedPhoto.enhancedReviewStatus === "APPROVED" &&
            updatedPhoto.enhancedUrl
              ? updatedPhoto.enhancedUrl
              : updatedPhoto.originalUrl,
          originalUrl: updatedPhoto.originalUrl,
          provenance: updatedPhoto.provenance
            .toLowerCase()
            .replaceAll("_", "-") as
            | "official"
            | "owner"
            | "permissioned-ugc",
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Photo review failed");
    } finally {
      setPending(null);
    }
  }

  async function addReference() {
    if (!referenceUrl.trim()) return;
    setPending("reference");
    setError(null);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(siteSlug)}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceImageUrl: referenceUrl.trim(),
          candidateUsages: ["GALLERY"],
        }),
      });
      const body = (await response.json()) as { library?: PhotoLibrary; error?: string };
      if (!response.ok || !body.library) throw new Error(body.error ?? "Photo could not be added");
      syncLibrary(body.library);
      setReferenceUrl("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Photo could not be added");
    } finally {
      setPending(null);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setPending("upload");
    setError(null);
    try {
      const form = new FormData();
      form.set("photo", file);
      form.set("candidateUsages", JSON.stringify(["GALLERY"]));
      const response = await fetch(`/api/sites/${encodeURIComponent(siteSlug)}/photos`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as { library?: PhotoLibrary; error?: string };
      if (!response.ok || !body.library) throw new Error(body.error ?? "Photo could not be uploaded");
      syncLibrary(body.library);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Photo could not be uploaded");
    } finally {
      setPending(null);
    }
  }

  async function enhanceApproved() {
    if (approvedIds.length === 0) return;
    setPending("enhance");
    setError(null);
    try {
      const scope = approvedIds.join(":");
      if (enhancementRequest.current?.scope !== scope) {
        enhancementRequest.current = { scope, key: crypto.randomUUID() };
      }
      const response = await fetch(
        `/api/sites/${encodeURIComponent(siteSlug)}/photos/enhance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoIds: approvedIds,
            idempotencyKey: enhancementRequest.current.key,
          }),
        },
      );
      const body = (await response.json()) as { library?: PhotoLibrary; error?: string };
      if (!response.ok || !body.library) throw new Error(body.error ?? "Enhancement batch failed");
      enhancementRequest.current = null;
      syncLibrary(body.library);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enhancement batch failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Approved-source intake</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            Upload an owner photo or reference an HTTPS original. Every file is copied to immutable storage and deduplicated before it can be selected or enhanced.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="owner-photo-upload">Upload an authentic photo</Label>
            <Input
              id="owner-photo-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={Boolean(pending)}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner-photo-reference">Reference an HTTPS original</Label>
            <div className="flex gap-2">
              <Input
                id="owner-photo-reference"
                type="url"
                value={referenceUrl}
                placeholder="https://business.example/photo.jpg"
                onChange={(event) => setReferenceUrl(event.target.value)}
              />
              <Button type="button" variant="outline" disabled={!referenceUrl.trim() || Boolean(pending)} onClick={() => void addReference()}>
                {pending === "reference" ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Enhancement budget</p>
          <p className="text-xs text-muted-foreground">
            {library ? `${formatCost(library.budget.committedMicros)} committed of ${formatCost(library.budget.ceilingMicros)} per site` : "Loading cost controls…"}
          </p>
        </div>
        <Button type="button" disabled={approvedIds.length === 0 || Boolean(pending)} onClick={() => void enhanceApproved()}>
          {pending === "enhance" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          Enhance approved ({approvedIds.length})
        </Button>
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {!library ? (
        <p className="text-sm text-muted-foreground">Loading photo provenance…</p>
      ) : library.photos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No source photos were found. Add an owner-approved original above.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {library.photos.map((photo) => (
            <PhotoReviewCard
              key={photo.id}
              photo={photo}
              catalogItems={library.catalogItems}
              pending={pending}
              onAction={mutate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoReviewCard({
  photo,
  catalogItems,
  pending,
  onAction,
}: {
  photo: Photo;
  catalogItems: PhotoLibrary["catalogItems"];
  pending: string | null;
  onAction: (
    photoId: string,
    action: string,
    extra?: Record<string, string>,
  ) => Promise<void>;
}) {
  const [catalogItemId, setCatalogItemId] = useState("");
  const busy = pending?.startsWith(`${photo.id}:`) ?? false;
  return (
    <Card className="overflow-hidden py-0">
      <div className="grid grid-cols-2">
        <PhotoPreview label="Immutable original" url={photo.originalUrl} />
        {photo.enhancedUrl ? (
          <PhotoPreview label={`Enhanced · ${photo.enhancedReviewStatus?.toLowerCase() ?? "pending"}`} url={photo.enhancedUrl} />
        ) : (
          <div className="grid aspect-[4/3] place-items-center bg-muted/50 px-5 text-center text-xs text-muted-foreground">No derivative yet. The original remains active.</div>
        )}
      </div>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={photo.reviewStatus === "APPROVED" ? "default" : "outline"}>{photo.reviewStatus.toLowerCase()}</Badge>
          <Badge variant="outline">{photo.sourceKind.replaceAll("_", " ").toLowerCase()}</Badge>
          {photo.selectedUsage ? <Badge variant="secondary">Selected {photo.selectedUsage.toLowerCase()}</Badge> : null}
          {photo.candidateUsages.map((usage) => <Badge key={usage} variant="outline">{usage.toLowerCase()} candidate</Badge>)}
        </div>
        <p className="break-words text-[11px] leading-4 text-muted-foreground">
          {photo.sourcePageUrl ? `Found on ${photo.sourcePageUrl}` : "Provided directly by the owner"}
        </p>
        {photo.enhancementCostMicros !== null ? <p className="text-[11px] text-muted-foreground">Enhancement cost: {formatCost(photo.enhancementCostMicros)} · {photo.enhancementModel}</p> : null}
        <div className="flex flex-wrap gap-2">
          {photo.reviewStatus === "PENDING" ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => void onAction(photo.id, "approve_original")}><Check />Approve original</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction(photo.id, "reject_original")}><X />Reject</Button>
            </>
          ) : null}
          {photo.reviewStatus === "APPROVED" ? (
            <>
              <Button size="sm" variant={photo.selectedUsage === "HERO" ? "default" : "outline"} disabled={busy} onClick={() => void onAction(photo.id, "select_hero")}>Use as hero</Button>
              <Button size="sm" variant={photo.selectedUsage === "GALLERY" ? "default" : "outline"} disabled={busy} onClick={() => void onAction(photo.id, "select_gallery")}>Use in gallery</Button>
              {catalogItems.length > 0 ? (
                <>
                  <select
                    aria-label="Catalog item for this photo"
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    value={catalogItemId}
                    onChange={(event) => setCatalogItemId(event.target.value)}
                  >
                    <option value="">Catalog item…</option>
                    {catalogItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sectionName} · {item.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !catalogItemId}
                    onClick={() =>
                      void onAction(photo.id, "select_catalog", {
                        catalogItemId,
                      })
                    }
                  >
                    Use for item
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          {photo.enhancedUrl && photo.enhancedReviewStatus === "PENDING" ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => void onAction(photo.id, "approve_enhancement")}><Check />Approve enhanced</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction(photo.id, "reject_enhancement")}><X />Reject enhanced</Button>
            </>
          ) : null}
          {photo.activeVariant === "ENHANCED" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction(photo.id, "restore_original")}><RotateCcw />Restore original</Button> : null}
          {photo.selectedUsage ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onAction(photo.id, "unselect")}>Unselect</Button> : null}
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PhotoPreview({ label, url }: { label: string; url: string }) {
  return (
    <div className="relative aspect-[4/3]">
      <div role="img" aria-label={label} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${url}")` }} />
      <Badge className="absolute left-3 top-3 bg-black/60 text-white">{label}</Badge>
    </div>
  );
}

function formatCost(micros: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 3 }).format(micros / 1_000_000);
}
