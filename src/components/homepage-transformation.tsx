import Image from "next/image";
import {
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  ShoppingBag,
} from "lucide-react";
import { sampleRestaurant } from "@/lib/restaurant";

const menuItems = sampleRestaurant.menuSections
  .flatMap((section) => section.items)
  .slice(0, 3);

const transformationImageSrc =
  "/marketing/restaurant-transformation.webp";

/**
 * A before/after mock of a real restaurant site, so it is the restaurant niche's
 * hero and nothing else — `VerticalMarketing.heroVisual` opts in. The brand name
 * is a prop because the "after" label names whoever is selling the page, which
 * is the niche's brand, never the factory's.
 */
export function HomepageTransformation({ brandName }: { brandName: string }) {
  return (
    <figure
      aria-labelledby="transformation-caption"
      className="relative mx-auto min-h-[590px] w-full max-w-[620px] lg:min-h-[650px]"
    >
      <div className="absolute left-0 top-12 w-[56%] -rotate-3 sm:left-2 sm:top-16">
        <div className="mb-2 flex items-center gap-2 pl-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Current site
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="overflow-hidden rounded-xl border border-foreground/15 bg-[#e9e5dc] shadow-[0_18px_60px_-34px_rgba(38,30,20,0.42)] grayscale-[0.35]">
          <div className="flex h-8 items-center gap-1.5 border-b border-foreground/10 bg-[#d8d3c9] px-3">
            <span className="size-1.5 rounded-full bg-foreground/20" />
            <span className="size-1.5 rounded-full bg-foreground/20" />
            <span className="size-1.5 rounded-full bg-foreground/20" />
            <span className="ml-2 truncate font-mono text-[8px] text-foreground/45">
              osterialuna.com
            </span>
          </div>
          <div className="relative h-32 overflow-hidden border-b border-foreground/10">
            <Image
              src={transformationImageSrc}
              alt=""
              fill
              sizes="(max-width: 640px) 48vw, 280px"
              className="object-cover opacity-55 saturate-50"
              loading="eager"
            />
            <div className="absolute inset-0 bg-[#bbb4a7]/30" />
            <div className="absolute inset-x-4 bottom-4">
              <p className="font-serif text-2xl text-white/85">
                {sampleRestaurant.name}
              </p>
              <p className="mt-1 text-[8px] uppercase tracking-[0.16em] text-white/65">
                Fine Italian dining
              </p>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3 border-b border-foreground/10 pb-3">
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">
                Our menu
              </span>
              <span className="flex items-center gap-1 rounded-sm border border-foreground/20 bg-white/45 px-2 py-1 font-mono text-[8px]">
                <FileText className="size-2.5" />
                Menu.pdf
              </span>
            </div>
            <p className="max-w-[16rem] text-[9px] leading-4 text-foreground/55">
              For reservations and opening hours, please call the restaurant.
            </p>
            <div className="flex gap-2">
              <span className="h-1.5 w-20 rounded-full bg-foreground/10" />
              <span className="h-1.5 w-12 rounded-full bg-foreground/10" />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute left-[40%] top-[17%] z-20 hidden items-center gap-2 sm:flex">
        <span className="rounded-full border border-primary/20 bg-background/95 px-3 py-1.5 text-[10px] font-semibold text-primary shadow-sm">
          Same restaurant
        </span>
        <ArrowRight className="size-4 text-primary" />
      </div>

      <div className="absolute bottom-1 right-0 z-10 w-[68%] min-w-[250px] max-w-[370px] rotate-[1.5deg] sm:w-[64%]">
        <div className="mb-2 flex items-center gap-2 pr-4">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            With {brandName}
          </span>
          <span className="h-px flex-1 bg-primary/30" />
        </div>
        <div className="rounded-[2.4rem] border-[8px] border-[#171914] bg-[#171914] p-1 shadow-[0_36px_90px_-34px_rgba(38,30,20,0.65)]">
          <div className="relative h-[510px] overflow-hidden rounded-[1.72rem] bg-[#f4efe5] sm:h-[565px]">
            <div className="absolute left-1/2 top-2 z-30 h-4 w-16 -translate-x-1/2 rounded-full bg-[#171914]" />
            <div className="relative h-60 overflow-hidden sm:h-72">
              <Image
                src={transformationImageSrc}
                alt={`${sampleRestaurant.name} dining room`}
                fill
                sizes="(max-width: 640px) 58vw, 350px"
                className="object-cover"
                loading="eager"
              />
              <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(12,17,14,0.85),rgba(12,17,14,0.05)_72%)]" />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 pt-7 text-white">
                <span className="font-serif text-base">
                  {sampleRestaurant.name}
                </span>
                <span className="rounded-full bg-[#a5482d] px-3 py-1.5 text-[9px] font-bold">
                  Book
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-white/70">
                  Seasonal Italian kitchen · Valletta
                </p>
                <p className="mt-2 font-serif text-4xl leading-none">
                  Handmade here.
                  <br />
                  Served when ready.
                </p>
              </div>
            </div>

            <div className="px-5 py-5">
              <div className="flex items-end justify-between border-b border-foreground/10 pb-3">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#a5482d]">
                    The menu
                  </p>
                  <p className="mt-1 font-serif text-2xl">Pasta &amp; mains</p>
                </div>
                <span className="text-[8px] text-foreground/50">
                  Searchable
                </span>
              </div>
              <div className="divide-y divide-foreground/10">
                {menuItems.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="text-[10px] font-semibold">{item.name}</p>
                      <p className="mt-1 line-clamp-1 text-[8px] text-foreground/50">
                        {item.description}
                      </p>
                    </div>
                    <span className="font-mono text-[9px]">
                      €{item.price}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full border border-white/70 bg-white/94 p-1.5 shadow-lg backdrop-blur">
              <span className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#a5482d] px-3 py-2 text-[9px] font-bold text-white">
                <CalendarDays className="size-3" />
                Book a table
              </span>
              <span className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[9px] font-bold">
                <ShoppingBag className="size-3" />
                Order
              </span>
            </div>
          </div>
        </div>
      </div>

      <figcaption
        id="transformation-caption"
        className="absolute bottom-7 left-0 z-30 max-w-[220px] -rotate-2 rounded-2xl border bg-card p-4 shadow-xl sm:bottom-12 sm:max-w-[250px]"
      >
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3" />
          </span>
          Bookings &amp; ordering stay put
        </div>
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          SevenRooms and every existing order link keep working exactly as they
          do today.
        </p>
      </figcaption>
    </figure>
  );
}
