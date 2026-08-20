import type { SiteDraftView } from "@/lib/site-draft";
import { cn } from "@/lib/utils";

export function SiteBrand({
  draft,
  href = "#content",
  className,
  markClassName,
}: {
  draft: Pick<SiteDraftView, "name" | "logoUrl">;
  href?: string;
  className?: string;
  markClassName?: string;
}) {
  return (
    <a href={href} className={cn("inline-flex min-w-0 items-center gap-3", className)}>
      {draft.logoUrl ? (
        <span
          aria-hidden="true"
          data-source-brand-mark
          className={cn(
            "size-9 shrink-0 bg-contain bg-center bg-no-repeat",
            markClassName,
          )}
          style={{ backgroundImage: `url("${draft.logoUrl}")` }}
        />
      ) : null}
      <span className="min-w-0 break-words">{draft.name}</span>
    </a>
  );
}

export function SourceNavigation({
  draft,
  className,
}: {
  draft: Pick<SiteDraftView, "sourceData">;
  className?: string;
}) {
  const navigation = draft.sourceData?.navigation ?? [];
  if (navigation.length === 0) return null;
  return (
    <nav
      aria-label="Source website"
      className={cn(
        "flex gap-5 overflow-x-auto border-b border-current/10 px-5 py-3 text-xs font-semibold",
        className,
      )}
    >
      {navigation.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
