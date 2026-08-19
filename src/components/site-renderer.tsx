import {
  ArrowUpRight,
  CalendarDays,
  MapPin,
  ShoppingBag,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BookingEmbed } from "@/components/booking-embed";
import { BookingRequestForm } from "@/components/booking-request-form";
import { RestaurantThemeRenderer } from "@/components/restaurant-themes/restaurant-theme-renderer";
import { RestaurantStructuredData } from "@/components/restaurant-themes/shared";
import { SiteAnalytics } from "@/components/site-analytics";
import { Vertical } from "@/generated/prisma/enums";
import { resolveBookingEmbed } from "@/lib/booking-embed";
import {
  getSiteDictionary,
  getTemplateCopy,
  localizeIntegrationUrl,
} from "@/lib/site-i18n";
import { localeHref } from "@/lib/site-surface";
import {
  formatPrice,
  type SiteDraftView,
  type SiteThemeView,
} from "@/lib/site-draft";
import { parseRestaurantThemeSelection } from "@/lib/site-themes/restaurant/selection";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";
import { cn } from "@/lib/utils";

/**
 * The one renderer every vertical shares. It takes the `Vertical` *value* rather
 * than a resolved config because two of its call sites are client components and
 * a config carries RegExp and functions that cannot cross that boundary — the
 * same reason the import workflow threads the enum value. Everything
 * vertical-specific reaches this file as data: the template's layout primitives,
 * the dictionary, the capability flags, and the item badge strings.
 */
type SiteRendererProps = {
  draft: SiteDraftView;
  vertical: VerticalId;
  embedded?: boolean;
  locale?: string;
  localeBasePath?: string;
  availableLocales?: string[];
  analyticsEnabled?: boolean;
  theme?: SiteThemeView;
};

export function SiteRenderer({
  draft,
  vertical,
  embedded = false,
  locale = draft.defaultLocale,
  localeBasePath,
  availableLocales = [draft.defaultLocale],
  analyticsEnabled = false,
  theme,
}: SiteRendererProps) {
  const config = resolveVerticalConfig(vertical);
  const dictionary = getSiteDictionary(config, locale);

  if (vertical === Vertical.RESTAURANT) {
    const selection = parseRestaurantThemeSelection(
      draft.attributes.themeSelection,
    );
    if (selection) {
      return (
        <RestaurantThemeRenderer
          draft={draft}
          selection={selection}
          locale={locale}
          localeBasePath={localeBasePath}
          availableLocales={availableLocales}
          dictionary={dictionary}
          embedded={embedded}
          analyticsEnabled={analyticsEnabled}
        />
      );
    }
  }

  const booking = draft.integrations.find(
    (integration) =>
      integration.enabled && integration.type === "booking",
  );
  const ordering = draft.integrations.find(
    (integration) =>
      integration.enabled &&
      ["ordering", "delivery"].includes(integration.type),
  );
  const resolvedTemplate = config.templates.resolve(draft.attributes);
  const template = theme
    ? (config.templates.definitions[theme.id] ?? resolvedTemplate)
    : resolvedTemplate;
  const capabilities = config.rendererCapabilities(draft.attributes);
  const bookingEmbed = booking ? resolveBookingEmbed(vertical, booking) : null;
  // A site with no booking tool at all always gets the form — otherwise its only
  // "book" affordance would be a phone number. A site that *has* one gets the form
  // only if its vertical asks for it, because a second, slower way to book next to
  // a live widget is a worse offer, not a better one.
  const showRequestForm = !booking || capabilities.showBookingRequestForm;
  // A booking provider we cannot embed contributes nothing here: the header CTA and
  // the contact column already link out to it. Rendering an empty section for that
  // case would change every existing restaurant site for no gain.
  const showBookingSection = Boolean(bookingEmbed) || showRequestForm;
  const copy = getTemplateCopy(template, locale);
  const picturedItems = draft.catalogSections
    .flatMap((section) => section.items)
    .filter(
      (item): item is typeof item & { imageUrl: string } =>
        item.available && Boolean(item.imageUrl),
    )
    .slice(0, 4);
  const immersiveHero = template.heroLayout === "immersive";
  const heroTitleClassName = cn(
    "min-w-0 break-words",
    template.titleClassName,
    embedded
      ? "text-[clamp(3rem,12vw,4.5rem)]"
      : "text-[clamp(3.25rem,15vw,6rem)] md:text-8xl",
  );
  // Reserve the existing bottom-aligned copy depth while anchoring its top,
  // so longer translations expand downward instead of moving the title.
  const splitHeroPositionClassName = embedded
    ? "lg:pt-20"
    : "lg:pt-[max(3rem,calc(78svh-26.5rem))]";

  return (
    <article
      lang={locale}
      data-site-template={template.id}
      data-site-theme-version={theme?.version}
      className={cn(
        "font-sans",
        embedded
          ? "min-h-[720px] overflow-hidden rounded-[1.65rem]"
          : "min-h-screen",
      )}
      style={
        {
          "--site-bg": draft.palette.background,
          "--site-fg": draft.palette.foreground,
          "--site-accent": draft.palette.accent,
          background: "var(--site-bg)",
          color: "var(--site-fg)",
        } as React.CSSProperties
      }
    >
      {analyticsEnabled ? <SiteAnalytics siteSlug={draft.slug} /> : null}
      {vertical === Vertical.RESTAURANT ? (
        <RestaurantStructuredData draft={draft} enabled={analyticsEnabled} />
      ) : null}
      <header
        className={cn(
          "z-20 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 p-4 sm:flex sm:justify-between sm:gap-4 sm:p-5 md:p-8",
          immersiveHero
            ? "absolute text-white"
            : "relative border-b border-current/10",
        )}
      >
        <span
          className={cn(
            "min-w-0 break-words text-lg leading-tight sm:flex-1 sm:text-xl md:text-2xl",
            template.brandClassName,
          )}
        >
          {draft.name}
        </span>
        <div className="contents sm:flex sm:shrink-0 sm:items-center sm:gap-2">
          {localeBasePath && availableLocales.length > 1 ? (
            <nav
              aria-label={dictionary.language}
              className={cn(
                "col-start-2 row-start-1 flex items-center justify-self-end rounded-full border p-1 text-[11px] font-bold uppercase tracking-[0.08em] backdrop-blur",
                immersiveHero
                  ? "border-white/35 bg-black/10"
                  : "border-current/20",
              )}
            >
              {availableLocales.map((availableLocale) => (
                <Link
                  key={availableLocale}
                  href={
                    localeHref(
                      localeBasePath,
                      availableLocale,
                      draft.defaultLocale,
                    )
                  }
                  hrefLang={availableLocale}
                  aria-current={
                    availableLocale === locale ? "page" : undefined
                  }
                  className={cn(
                    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-7 sm:min-w-7",
                    availableLocale === locale
                      ? immersiveHero
                        ? "bg-white text-black"
                        : "bg-[var(--site-fg)] text-[var(--site-bg)]"
                      : "opacity-75 hover:opacity-100",
                  )}
                >
                  {availableLocale.split("-")[0]}
                </Link>
              ))}
            </nav>
          ) : null}
          {ordering ? (
            <a
              href={localizeIntegrationUrl(ordering.url, locale)}
              data-analytics-cta
              target="_blank"
              rel="noreferrer"
              className={cn(
                "hidden items-center whitespace-nowrap border px-4 py-2 text-xs font-semibold backdrop-blur sm:inline-flex",
                template.id === "bold" ? "rounded-none" : "rounded-full",
                immersiveHero
                  ? "border-white/40 bg-black/10"
                  : "border-current/20",
              )}
            >
              {ordering.label}
            </a>
          ) : null}
          {booking ? (
            <a
              href={localizeIntegrationUrl(booking.url, locale)}
              data-analytics-cta
              target="_blank"
              rel="noreferrer"
              className={cn(
                "col-span-2 row-start-2 inline-flex min-h-11 items-center justify-center px-4 py-2 text-center text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 sm:col-auto sm:row-auto sm:min-h-0 sm:whitespace-nowrap",
                template.id === "bold" ? "rounded-none" : "rounded-full",
              )}
              style={{ background: "var(--site-accent)" }}
            >
              {booking.label}
            </a>
          ) : null}
        </div>
      </header>

      {template.heroLayout === "split" ? (
        <section
          className={cn(
            "grid overflow-hidden lg:grid-cols-[0.9fr_1.1fr]",
            embedded ? "min-h-[520px]" : "min-h-[78svh]",
          )}
        >
          <div
            className={cn(
              "flex items-start p-6 md:p-12 lg:pb-16",
              splitHeroPositionClassName,
            )}
          >
            <div className="max-w-2xl">
              <p
                className="mb-5 text-xs font-bold uppercase tracking-[0.2em]"
                style={{ color: "var(--site-accent)" }}
              >
                {draft.eyebrow}
              </p>
              <h1 className={heroTitleClassName}>
                {draft.name}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 opacity-75 md:text-lg">
                {draft.description}
              </p>
            </div>
          </div>
          <HeroImage
            draft={draft}
            heroImageAlt={dictionary.heroImageAlt}
            className="min-h-[420px] lg:min-h-full"
          />
        </section>
      ) : template.heroLayout === "card" ? (
        <section className="p-4 pt-1 md:p-8 md:pt-2">
          <div
            className={cn(
              "relative flex items-end overflow-hidden rounded-[2rem]",
              embedded ? "min-h-[500px]" : "min-h-[76svh]",
            )}
          >
            <HeroImage
              draft={draft}
              heroImageAlt={dictionary.heroImageAlt}
              className="absolute inset-0"
            />
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,18,15,0.86),rgba(10,18,15,0.02)_70%)]" />
            <HeroCopy draft={draft} titleClassName={heroTitleClassName} />
          </div>
        </section>
      ) : (
        <section
          className={cn(
            "relative flex items-end overflow-hidden",
            embedded ? "min-h-[520px]" : "min-h-[82svh]",
          )}
        >
          <HeroImage
            draft={draft}
            heroImageAlt={dictionary.heroImageAlt}
            className="absolute inset-0"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,12,11,0.88),rgba(10,12,11,0.04)_68%)]" />
          <HeroCopy draft={draft} titleClassName={heroTitleClassName} />
        </section>
      )}

      {capabilities.showGallery && picturedItems.length > 0 ? (
        <section className="mx-auto max-w-7xl px-6 py-14 md:px-10 md:py-20">
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.18em]"
                style={{ color: "var(--site-accent)" }}
              >
                {copy.featuredHeading}
              </p>
              <h2 className="mt-3 break-words text-3xl font-bold tracking-[-0.04em] md:text-5xl">
                {copy.featuredSubheading}
              </h2>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {picturedItems.map((item) => (
              <article
                key={item.name}
                className={cn(
                  "group overflow-hidden",
                  template.id === "bold"
                    ? "border-2 border-current"
                    : "rounded-[1.25rem]",
                )}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-black/5">
                  {item.imageUrl.startsWith("/") ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                    />
                  ) : (
                    <div
                      role="img"
                      aria-label={item.name}
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.025]"
                      style={{ backgroundImage: `url("${item.imageUrl}")` }}
                    />
                  )}
                </div>
                <div className="border-x border-b border-current/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-semibold leading-tight">{item.name}</h3>
                    <span className="font-mono text-xs">
                      {formatPrice(item.price, item.currency, locale)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 opacity-75">
                    {item.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:px-10 md:py-24 lg:grid-cols-[0.68fr_1.32fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">
            {copy.catalogEyebrow}
          </p>
          <h2 className="mt-3 max-w-md break-words text-4xl font-bold leading-[0.96] tracking-[-0.045em] md:text-6xl">
            {copy.catalogHeading}
          </h2>
          <div className="mt-8 flex flex-col gap-3 text-sm opacity-75">
            <span className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {draft.address}
            </span>
            {booking ? (
              <a
                href={localizeIntegrationUrl(booking.url, locale)}
                data-analytics-cta
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 font-semibold opacity-100"
              >
                <CalendarDays className="size-4" />
                {dictionary.reservationsVia}{" "}
                {booking.provider ?? dictionary.bookingPartner}
                <ArrowUpRight className="size-3.5" />
              </a>
            ) : null}
            {ordering ? (
              <a
                href={localizeIntegrationUrl(ordering.url, locale)}
                data-analytics-cta
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 font-semibold opacity-100"
              >
                <ShoppingBag className="size-4" />
                {ordering.label}
                <ArrowUpRight className="size-3.5" />
              </a>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            template.catalogLayout === "stack" && "space-y-12",
            template.catalogLayout === "columns" &&
              "grid content-start gap-x-10 gap-y-12 md:grid-cols-2",
            template.catalogLayout === "cards" &&
              "grid content-start gap-5 md:grid-cols-2",
          )}
        >
          {draft.catalogSections.map((section) => (
            <section
              key={section.name}
              className={template.sectionClassName}
            >
              <div className="mb-5 pb-1">
                <h3 className="text-2xl font-bold tracking-[-0.035em] md:text-3xl">
                  {section.name}
                </h3>
                {section.description ? (
                  <p className="mt-1 text-sm opacity-75">
                    {section.description}
                  </p>
                ) : null}
              </div>
              <div className="space-y-6">
                {section.items.filter((item) => item.available).map((item) => (
                  <div
                    key={item.name}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 sm:gap-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="min-w-0 break-words font-medium">
                          {item.name}
                        </h4>
                        {/* The vertical turns its own item attributes into plain
                            strings, so the renderer never learns what they mean. */}
                        {(
                          config.presentation.itemBadges?.(item.attributes) ?? []
                        ).map((label: string) => (
                          <span
                            key={label}
                            className="rounded-full border border-current/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 max-w-xl text-sm leading-6 opacity-75">
                        {item.description}
                      </p>
                    </div>
                    <span className="whitespace-nowrap font-mono text-sm">
                      {formatPrice(item.price, item.currency, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      {showBookingSection ? (
        <section className="mx-auto grid max-w-7xl gap-10 border-t border-current/10 px-6 py-16 md:px-10 md:py-20 lg:grid-cols-[0.68fr_1.32fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-70">
              {dictionary.bookingHeading}
            </p>
            {showRequestForm ? (
              <>
                <h2 className="mt-3 max-w-md break-words text-4xl font-bold leading-[0.96] tracking-[-0.045em] md:text-5xl">
                  {dictionary.bookingRequestHeading}
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-6 opacity-75">
                  {dictionary.bookingRequestIntro}
                </p>
              </>
            ) : null}
          </div>

          <div className="space-y-8">
            {bookingEmbed ? (
              <BookingEmbed
                embed={bookingEmbed}
                title={`${dictionary.bookingHeading} · ${draft.name}`}
                previewNotice={dictionary.bookingEmbedPreviewNotice}
                embedded={embedded}
              />
            ) : null}
            {showRequestForm ? (
              <BookingRequestForm
                slug={draft.slug}
                embedded={embedded}
                copy={{
                  name: dictionary.bookingRequestName,
                  email: dictionary.bookingRequestEmail,
                  phone: dictionary.bookingRequestPhone,
                  when: dictionary.bookingRequestWhen,
                  partySize: dictionary.bookingRequestPartySize,
                  notes: dictionary.bookingRequestNotes,
                  optional: dictionary.bookingRequestOptional,
                  submit: dictionary.bookingRequestSubmit,
                  sending: dictionary.bookingRequestSending,
                  success: dictionary.bookingRequestSuccess,
                  error: dictionary.bookingRequestError,
                  previewNotice: dictionary.bookingRequestPreviewNotice,
                }}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      <footer className="grid gap-5 border-t border-current/15 px-6 py-8 text-sm opacity-75 sm:grid-cols-3 sm:items-start md:px-10">
        <span>
          {draft.name} · {draft.address}
        </span>
        {draft.businessHours.length > 0 ? (
          <dl className="grid gap-1">
            {draft.businessHours.map((row) => (
              <div
                key={`${row.days}-${row.hours}`}
                className="flex justify-between gap-4"
              >
                <dt>{row.days}</dt>
                <dd>{row.hours}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <span />
        )}
        <span className="sm:text-right">{dictionary.seasonalNotice}</span>
      </footer>
    </article>
  );
}

type HeroImageProps = {
  draft: Pick<SiteDraftView, "heroImageUrl" | "name">;
  heroImageAlt: string;
  className?: string;
};

function HeroImage({ draft, heroImageAlt, className }: HeroImageProps) {
  return draft.heroImageUrl ? (
    <div
      role="img"
      aria-label={`${heroImageAlt} ${draft.name}`}
      className={cn("bg-cover bg-center", className)}
      style={{ backgroundImage: `url("${draft.heroImageUrl}")` }}
    />
  ) : (
    <div
      className={cn("opacity-20", className)}
      style={{ background: "var(--site-accent)" }}
    />
  );
}

type HeroCopyProps = {
  draft: Pick<SiteDraftView, "eyebrow" | "name" | "description">;
  titleClassName: string;
};

function HeroCopy({ draft, titleClassName }: HeroCopyProps) {
  return (
    <div className="relative max-w-4xl p-6 text-white md:p-12">
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-white/75">
        {draft.eyebrow}
      </p>
      <h1 className={titleClassName}>
        {draft.name}
      </h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-white/82 md:text-lg">
        {draft.description}
      </p>
    </div>
  );
}
