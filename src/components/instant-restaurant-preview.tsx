import { Clock3, ListTree, Minus, ShoppingBag } from "lucide-react";

type InstantSitePreviewProps = {
  source: string;
  message: string;
  progress: number;
  status: "loading" | "error";
  catalogLabel: string;
  detailCards: Array<{ title: string; copy: string }>;
};

const palettes = [
  {
    background: "#f2eadc",
    foreground: "#20251f",
    accent: "#a5482d",
    wash: "#d9c5a8",
  },
  {
    background: "#eee9df",
    foreground: "#1f2926",
    accent: "#35675a",
    wash: "#c8d4c7",
  },
  {
    background: "#f3e9e1",
    foreground: "#2b211f",
    accent: "#8b4a3f",
    wash: "#dbc1b5",
  },
];

function sourceIdentity(source: string): {
  displayName: string;
  sourceLabel: string;
  initials: string;
  palette: (typeof palettes)[number];
} {
  const trimmed = source.trim();
  const normalized = /^(?:https?:\/\/|www\.)/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let sourceLabel = trimmed;
  let candidate = trimmed;

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.replace(/^www\./i, "");
    if (hostname.includes(".")) {
      sourceLabel = hostname;
      candidate = hostname.split(".")[0];
    }
  } catch {
    // Restaurant names are already useful identity input.
  }

  const displayName =
    candidate
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
      .trim() || "Your restaurant";
  const initials =
    displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "R";
  const hash = Array.from(trimmed).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return {
    displayName,
    sourceLabel,
    initials,
    palette: palettes[hash % palettes.length],
  };
}

export function InstantSitePreview({
  source,
  message,
  progress,
  status,
  catalogLabel,
  detailCards,
}: InstantSitePreviewProps) {
  const identity = sourceIdentity(source);
  const loading = status === "loading";

  return (
    <article
      aria-busy={loading}
      aria-label={`First look for ${identity.displayName}`}
      className="min-h-[720px] overflow-hidden font-sans"
      style={{
        background: identity.palette.background,
        color: identity.palette.foreground,
      }}
    >
      <div
        className="h-1 origin-left transition-transform duration-700 motion-reduce:transition-none"
        style={{
          background: identity.palette.accent,
          transform: `scaleX(${Math.max(progress, 4) / 100})`,
        }}
      />

      <header className="flex items-center justify-between gap-4 border-b border-current/10 px-5 py-5 md:px-9">
        <span className="font-display text-xl tracking-[-0.03em] md:text-2xl">
          {identity.displayName}
        </span>
        <span
          className="rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white"
          style={{ background: identity.palette.accent }}
        >
          Private first look
        </span>
      </header>

      <section className="relative min-h-[330px] overflow-hidden px-5 py-8 md:min-h-[380px] md:px-9 md:py-12">
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-20 size-72 rounded-full opacity-70 motion-safe:animate-pulse"
          style={{ background: identity.palette.wash }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-28 -left-20 size-64 rounded-full opacity-50"
          style={{ background: identity.palette.accent }}
        />
        <div className="relative z-10 flex min-h-[270px] flex-col justify-between md:min-h-[290px]">
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] opacity-55">
            <span>{identity.sourceLabel}</span>
            <span className="h-px w-8 bg-current opacity-35" />
            <span>{loading ? "Becoming a website" : "First look paused"}</span>
          </div>

          <div>
            <span
              aria-hidden="true"
              className="mb-5 grid size-12 place-items-center rounded-full border border-current/15 font-mono text-xs font-bold"
            >
              {identity.initials}
            </span>
            <h2 className="font-display max-w-2xl text-5xl leading-[0.88] tracking-[-0.05em] md:text-7xl">
              {identity.displayName}
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 opacity-60">
              Your mobile-first front door is already taking shape while we
              recover the facts behind it.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-current/10 bg-white/35 px-5 py-6 md:px-9">
        <div className="flex items-end justify-between gap-4 border-b border-current/10 pb-4">
          <div>
            <p
              className="text-[9px] font-bold uppercase tracking-[0.16em]"
              style={{ color: identity.palette.accent }}
            >
              {catalogLabel}
            </p>
            <h3 className="font-display mt-1 text-3xl tracking-[-0.035em]">
              Recovering the details
            </h3>
          </div>
          <ListTree className="size-4 opacity-45" />
        </div>

        <div className="grid gap-3 py-5 sm:grid-cols-3">
          {detailCards.slice(0, 3).map((item, index) => {
            const Icon = [ListTree, Clock3, ShoppingBag][index] ?? ListTree;
            return (
            <div
              key={item.title}
              className="flex items-start gap-3 border-b border-current/10 pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3 last:border-0"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-current/15 bg-white/35">
                {loading ? (
                  <span className="size-1.5 rounded-full bg-current opacity-45 motion-safe:animate-pulse" />
                ) : (
                  <Minus className="size-3 opacity-45" />
                )}
              </span>
              <div>
                <Icon className="mb-1 size-3 opacity-55" />
                <p className="text-[10px] font-semibold">{item.title}</p>
                <p className="mt-1 text-[9px] leading-3 opacity-55">
                  {loading ? item.copy : "Waiting for retry"}
                </p>
              </div>
            </div>
            );
          })}
        </div>

        <div
          aria-live="polite"
          className="flex items-center gap-2 rounded-full border border-current/10 bg-white/45 px-4 py-2.5 text-[10px] font-medium"
        >
          <span
            className="size-2 rounded-full motion-safe:animate-pulse"
            style={{ background: identity.palette.accent }}
          />
          {loading ? message : "The first look is safe. Retry when ready."}
        </div>
      </section>
    </article>
  );
}
