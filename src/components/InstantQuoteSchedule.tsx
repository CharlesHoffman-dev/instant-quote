"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Calendar } from "lucide-react";

/* =============================================================================
   Utils
============================================================================= */
function cn(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

/* =============================================================================
   Services, Durations, Discounts
============================================================================= */
export type Service = {
  id: string;
  name: string;
  basePrice: number;
  desc: string;
};
type PricedService = Service & { price: number };

const SERVICES: Service[] = [
  {
    id: "pressure-driveway",
    name: "Pressure Wash: Driveway",
    basePrice: 249,
    desc: "Clean your concrete driveway, front patio, walkway, and curb.",
  },
  {
    id: "pressure-patio",
    name: "Pressure Wash: Back Patio",
    basePrice: 99,
    desc: "Clean the concrete patio behind your home.",
  },
  {
    id: "roof",
    name: "Roof Clean",
    basePrice: 899,
    desc: "Soft wash your roof to remove black organic streaks.",
  },
  {
    id: "house",
    name: "House Wash",
    basePrice: 599,
    desc: "Get rid of dust, cobwebs, mold, and mildew on exterior walls.",
  },
  {
    id: "gutter",
    name: "Gutter Clean",
    basePrice: 249,
    desc: "Unclog your gutters and downspouts to prevent flooding.",
  },
  {
    id: "windows",
    name: "Window + Screen Clean",
    basePrice: 449,
    desc: "Remove dirt, dust, and fingerprints from exterior windows/screens.",
  },
];

// Duration (minutes) per service (baseline: single-story, no guards)
const DURATIONS_MIN: Record<string, number> = {
  "pressure-driveway": 60,
  "pressure-patio": 60,
  windows: 180,
  house: 120,
  roof: 120,
  gutter: 120,
};

function gutterDuration(twoStory: boolean, guards: boolean) {
  const base = twoStory ? 180 : 120;
  return guards ? base * 2 : base;
}

// Cal.com mapping to 1–8 hr event types (anything >8 → 8)
const CAL_URLS: Record<number, string> = {
  1: "https://cal.com/guardian-pressure-washing/1-hour-job?overlayCalendar=true",
  2: "https://cal.com/guardian-pressure-washing/2-hour-job?overlayCalendar=true",
  3: "https://cal.com/guardian-pressure-washing/3-hour-job?overlayCalendar=true",
  4: "https://cal.com/guardian-pressure-washing/4-hour-job?overlayCalendar=true",
  5: "https://cal.com/guardian-pressure-washing/5-hour-job?overlayCalendar=true",
  6: "https://cal.com/guardian-pressure-washing/6-hour-job?overlayCalendar=true",
  7: "https://cal.com/guardian-pressure-washing/7-hour-job?overlayCalendar=true",
  8: "https://cal.com/guardian-pressure-washing/8-hour-job?overlayCalendar=true",
};
function mapDurationToHours(mins: number) {
  if (!mins || mins < 0) return 1;
  const h = Math.ceil(mins / 60);
  return Math.min(Math.max(h, 1), 8);
}
function buildBookingUrl(hours: number, meta: Record<string, string>) {
  const base = CAL_URLS[hours] || CAL_URLS[8];
  const u = new URL(base);
  Object.entries(meta).forEach(([k, v]) =>
    u.searchParams.append(`metadata[${k}]`, v)
  );
  return u.toString();
}

/* =============================================================================
   Totals & Pricing Logic
============================================================================= */
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type Totals = {
  selectedCount: number;
  effectiveCount: number;
  subtotal: number;
  multiRate: number;
  multiAmt: number;
  tripFee: number;
  total: number;
  durationMinutes: number;
};

function discountCategoryFor(serviceId: string): string {
  if (serviceId.startsWith("pressure-")) return "pressure";
  return serviceId;
}

export function computeTotals(
  selectedMap: Record<string, boolean>,
  services: Service[],
  _twoStory: boolean,
  _gutterGuards: boolean
): Totals {
  // Pricing is baseline only (single-story, no guards)
  const adjustedServices: PricedService[] = services.map((s) => ({
    ...s,
    price: s.basePrice,
  }));

  const chosen = adjustedServices.filter((s) =>
    Boolean(selectedMap[s.id])
  ) as PricedService[];

  const selectedCount = chosen.length;
  const effectiveCount = new Set(chosen.map((s) => discountCategoryFor(s.id)))
    .size;
  const subtotal = chosen.reduce((sum, s) => sum + s.price, 0);

  let multiRate = 0;
  if (effectiveCount >= 5) multiRate = 0.2;
  else if (effectiveCount === 4) multiRate = 0.15;
  else if (effectiveCount === 3) multiRate = 0.1;
  else if (effectiveCount === 2) multiRate = 0.05;

  const multiAmt = round2(subtotal * multiRate);
  const afterDiscount = round2(subtotal - multiAmt);

  const MIN_TOTAL = 249;
  const tripFee =
    afterDiscount < MIN_TOTAL && afterDiscount > 0
      ? round2(MIN_TOTAL - afterDiscount)
      : 0;

  const total = Math.max(0, round2(afterDiscount + tripFee));

  // Durations baseline: single-story, no guards
  const durationMinutes = chosen.reduce((mins, s) => {
    if (s.id === "gutter") return mins + gutterDuration(false, false);
    return mins + (DURATIONS_MIN[s.id] || 0);
  }, 0);

  return {
    selectedCount,
    effectiveCount,
    subtotal,
    multiRate,
    multiAmt,
    tripFee,
    total,
    durationMinutes,
  };
}

/* =============================================================================
   Component (grid services, compact padding, sticky summary on desktop)
============================================================================= */
export default function InstantQuoteSchedule() {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // --- Mobile sticky "View Total" bar state/refs ---
  const [showMobilePriceBar, setShowMobilePriceBar] = useState(false);
  const scheduleBtnRef = useRef<HTMLButtonElement | null>(null);

  // Height reporting for parent page
  const sizerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;
    let lastQuantized = 0;
    let raf = 0;
    const STEP = 24;

    const measure = () => {
      const el = sizerRef.current;
      if (!el) {
        const doc = document.documentElement;
        const body = document.body;
        return Math.max(
          doc.scrollHeight,
          body.scrollHeight,
          doc.offsetHeight,
          body.offsetHeight
        );
      }
      return el.offsetTop + el.offsetHeight;
    };

    const postHeight = () => {
      const h = Math.ceil(measure());
      if (!Number.isFinite(h)) return;
      const quantized = Math.ceil(h / STEP) * STEP;
      if (quantized !== lastQuantized) {
        lastQuantized = quantized;
        window.parent?.postMessage(
          { type: "resize-quote-iframe", height: quantized },
          "*"
        );
      }
    };

    postHeight();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(postHeight);
    });
    ro.observe(document.documentElement);
    ro.observe(document.body);
    type DocWithFonts = Document & { fonts?: { ready?: Promise<unknown> } };
    (document as DocWithFonts).fonts?.ready?.then(() => postHeight());
    window.addEventListener("load", postHeight);
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(postHeight);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("load", postHeight);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Observe the Schedule button: show mobile bar when it's NOT visible
  useEffect(() => {
    const btn = scheduleBtnRef.current;
    if (!btn) return;

    const io = new IntersectionObserver(
      ([entry]) => setShowMobilePriceBar(!entry.isIntersecting),
      { root: null, threshold: 0, rootMargin: "0px 0px -70% 0px" }
    );

    io.observe(btn);
    return () => io.disconnect();
  }, []);

  /* ---------- Pricing + booking URL ---------- */
  const totals = useMemo(
    () => computeTotals(selected, SERVICES, false, false),
    [selected]
  );

  const adjustedServices = useMemo<PricedService[]>(
    () => SERVICES.map((s) => ({ ...s, price: s.basePrice })),
    []
  );

  const summaryLines = useMemo(() => {
    const items = adjustedServices
      .filter((s) => selected[s.id])
      .map((s) => `${s.name} ($${s.price})`);
    return items.length ? items : ["No services selected"];
  }, [selected, adjustedServices]);

  const hours = mapDurationToHours(totals.durationMinutes);
  const bookingUrl = useMemo(() => {
    const chosen = adjustedServices.filter((s) => selected[s.id]);
    const servicesList =
      chosen.map((s) => `${s.name} ($${s.price.toFixed(2)})`).join(", ") ||
      "None";
    const meta = {
      services: servicesList,
      subtotal: totals.subtotal.toFixed(2),
      discountRate: `${(totals.multiRate * 100).toFixed(0)}%`,
      discountAmount: totals.multiAmt.toFixed(2),
      total: totals.total.toFixed(2),
      durationMinutes: String(totals.durationMinutes),
      effectiveServiceCount: String(totals.effectiveCount),
    } as Record<string, string>;
    return buildBookingUrl(hours, meta);
  }, [hours, adjustedServices, selected, totals]);

  const canSchedule = totals.total > 0;

  const fmtDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (mins === 0) return "0 min";
    if (m === 0) return `${h} hr${h > 1 ? "s" : ""}`;
    return `${h > 0 ? `${h} hr${h > 1 ? "s" : ""} ` : ""}${m} min`;
  };

  return (
    <div className="max-w-[1080px] mx-auto px-3 sm:px-4 pt-0 bg-[#f2f3f8]">
      <header className="mt-0 mb-3 sm:mb-4 text-center">
        <p className="text-muted-foreground text-sm sm:text-base">
          Select services to see your price. Book instantly.
        </p>
      </header>

      {/* Mobile fixed "View Total" bar */}
      <div
        className={cn(
          "md:hidden fixed top-0 left-0 right-0 z-50 transition-all duration-200",
          showMobilePriceBar
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        )}
      >
        <div className="bg-white/85 backdrop-blur supports-[backdrop-filter]:backdrop-blur shadow-sm border-b">
          {/* center to your page width */}
          <div className="mx-auto max-w-[1080px] px-3 sm:px-4 py-2">
            <Button
              type="button"
              className="w-full h-10 rounded-xl bg-[#2755f8] hover:bg-[#1e45d1] text-white"
              onClick={() => {
                // Prefer to align the "Window + Screen Clean" card to the top
                const windowCard = document.querySelector('[data-id="windows"]') as HTMLElement | null;
                if (windowCard) {
                  const rect = windowCard.getBoundingClientRect();
                  window.scrollTo({
                    top: window.scrollY + rect.top - 10, // small cushion
                    behavior: "smooth",
                  });
                  return;
                }
                // Fallback: scroll slightly past the Schedule button so summary is visible
                if (scheduleBtnRef.current) {
                  const rect = scheduleBtnRef.current.getBoundingClientRect();
                  window.scrollTo({
                    top: window.scrollY + rect.top - window.innerHeight / 2,
                    behavior: "smooth",
                  });
                }
              }}
            >
              View Total
            </Button>
          </div>
        </div>
      </div>
      {/* Spacer so the fixed bar doesn't cover content on mobile */}
      <div className={cn("md:hidden", showMobilePriceBar ? "h-12" : "h-0")} />

      {/* Desktop: 2 columns — left (services grid) + right (sticky summary) */}
      <div className="grid gap-4 md:gap-6 items-start md:grid-cols-[minmax(0,_1fr)_340px]">
        {/* Left column — grid of cards */}
        <div className="min-w-0 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch">
          {adjustedServices.map((svc) => (
            <Card
              key={svc.id}
              data-id={svc.id} // enable targeted scrolling
              className={cn(
                "h-full transition hover:shadow-md cursor-pointer",
                selected[svc.id] && "ring-2 ring-[#2755f8]/60"
              )}
              onClick={() =>
                setSelected((prev) => ({ ...prev, [svc.id]: !prev[svc.id] }))
              }
            >
              {/* tighter padding + equal-height */}
              <CardContent className="py-2 sm:py-3 px-3 sm:px-4 h-full flex">
                <div className="flex items-start gap-3 w-full">
                  <Checkbox
                    id={svc.id}
                    checked={!!selected[svc.id]}
                    onCheckedChange={(v) =>
                      setSelected((prev) => ({ ...prev, [svc.id]: !!v }))}
                    className="mt-0.5 pointer-events-none border-[#2755f8] data-[state=checked]:bg-[#2755f8] data-[state=checked]:text-white"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-[15px] sm:text-base leading-tight">
                      {svc.name}
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                      {svc.desc}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg sm:text-xl font-semibold">
                      ${svc.price}
                    </div>
                    <div className="text-[10px] sm:text[11px] text-muted-foreground mt-1">
                      {svc.id === "gutter"
                        ? `${fmtDuration(gutterDuration(false, false))}`
                        : `${fmtDuration(DURATIONS_MIN[svc.id])}`}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right column — sticky summary on desktop */}
        <aside className="md:sticky md:top-6 self-start z-30 h-fit">
          <Card>
            {/* tighter vertical padding, keep comfortable left/right */}
            <CardContent className="py-2 sm:py-3 px-3 sm:px-4 space-y-2">
              <h2 className="text-base sm:text-lg font-semibold">Summary</h2>

              <ul className="text-xs sm:text-sm list-disc pl-5 space-y-1">
                {summaryLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>

              {/* tighter divider block + larger base text */}
              <div className="border-t pt-2 space-y-1 text-sm sm:text-base">
                <div className="flex justify-between">
                  <span>Estimated time</span>
                  <span>{fmtDuration(totals.durationMinutes)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${totals.subtotal.toFixed(2)}</span>
                </div>
                {totals.multiRate > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>
                      Bundle discount ({Math.round(totals.multiRate * 100)}%)
                    </span>
                    <span>- ${totals.multiAmt.toFixed(2)}</span>
                  </div>
                )}
                {totals.tripFee > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Trip Fee (min $249)</span>
                    <span>+ ${totals.tripFee.toFixed(2)}</span>
                  </div>
                )}
                {/* match card price size */}
                <div className="flex justify-between font-semibold text-lg sm:text-xl">
                  <span>Total</span>
                  <span>${totals.total.toFixed(2)}</span>
                </div>
              </div>

              <Button
                ref={scheduleBtnRef}
                type="button"
                className="w-full h-10 sm:h-11 text-sm sm:text-base bg-[#2755f8] hover:bg-[#1e45d1] text-white cursor-pointer"
                disabled={!canSchedule}
                onClick={() => {
                  if (!canSchedule) return;
                  window.open(bookingUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <Calendar className="w-4 h-4 mr-2" /> Schedule Now
              </Button>

              {!canSchedule && (
                <p className="text-xs text-red-600">
                  Select at least one service.
                </p>
              )}

              {/* (optional) tighter bundle box */}
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1.5 text-center text-xs sm:text-sm leading-relaxed text-blue-900 mb-0">
                <p className="font-semibold text-black">Bundle & Save 💰</p>
                <p
                  className={cn(
                    "transition-colors",
                    totals.effectiveCount === 2 &&
                      "font-semibold text-[#2755f8]"
                  )}
                >
                  2 services → 5% off
                </p>
                <p
                  className={cn(
                    "transition-colors",
                    totals.effectiveCount === 3 &&
                      "font-semibold text-[#2755f8]"
                  )}
                >
                  3 services → 10% off
                </p>
                <p
                  className={cn(
                    "transition-colors",
                    totals.effectiveCount === 4 &&
                      "font-semibold text-[#2755f8]"
                  )}
                >
                  4 services → 15% off
                </p>
                <p
                  className={cn(
                    "transition-colors",
                    totals.effectiveCount >= 5 && "font-semibold text-[#2755f8]"
                  )}
                >
                  5+ services → 20% off
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* sentinel for robust height measurement */}
      <div ref={sizerRef} style={{ height: 1 }} />
    </div>
  );
}