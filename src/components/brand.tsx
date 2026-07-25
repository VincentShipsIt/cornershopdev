import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Wordmark for whichever site is being served. The name and initials are props
 * rather than constants because the same header renders the factory
 * (Cornershopdev) and every niche storefront (Restofront today, more later) —
 * a hardcoded brand here is what would force a second header per niche.
 */
export function Brand({
  name,
  initials,
  href = "/",
  inverse = false,
  className,
}: {
  name: string;
  initials: string;
  href?: string;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em]",
        inverse ? "text-white" : "text-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full border text-[11px] font-bold tracking-[-0.08em]",
          inverse
            ? "border-white/30 bg-white/10 text-white"
            : "border-primary/25 bg-primary text-primary-foreground",
        )}
      >
        {initials}
      </span>
      {name}
    </Link>
  );
}
