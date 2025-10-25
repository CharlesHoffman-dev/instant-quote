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
  { id: "pressure-driveway", name: "Pressure Wash: Driveway", basePrice: 249, desc: "Clean your concrete driveway, front patio, walkway, and curb." },
  { id: "pressure-patio", name: "Pressure Wash: Back Patio", basePrice: 99, desc: "Clean the concrete patio behind your home." },
  { id: "roof", name: "Roof Clean", basePrice: 899, desc: "Soft wash your roof to remove black organic streaks." },
  { id: "house", name: "House Wash", basePrice: 599, desc: "Get rid of dust, cobwebs, mold, and mildew on exterior walls." },
  { id: "gutter", name: "Gutter Clean", basePrice: 249, desc: "Unclog your gutters and downspouts to prevent flooding." },
  { id: "windows", name: "Window + Screen Clean", basePrice: 449, desc: "Remove dirt, dust, and fingerprints from exterior windows/screens." },
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
  Object.entries(meta).forEach(([k, v]) => u.searchParams.append(`metadata[${k}]`, v));
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
  const adjustedServices: PricedService[] = services.map((s) => ({ ...s, price: s.basePrice }));

  const chosen = adjustedServices.filter((s) => Boolean(selectedMap[s.id])) as PricedService[];

  const selectedCount = chosen.length;
  const effectiveCount = new Set(chosen.map((s) => discountCategoryFor(s.id))).size;
  const subtotal = chosen.reduce((sum, s) => sum + s.price, 0);

  let multiRate = 0;
  if (effectiveCount >= 5) multiRate = 0.2;
  else if (effectiveCount === 4) multiRate = 0.15;
  else if (effectiveCount === 3) multiRate = 0.1;
  else if (effectiveCount === 2) multiRate = 0.05;

  const multiAmt = round2(subtotal * multiRate);
  const afterDiscount = round2(subtotal - multiAmt);

  const MIN_TOTAL = 249;
  const tripFee = afterDiscount < MIN_TOTAL && afterDiscount > 0 ? round2(MIN_TOTAL - afterDiscount) : 0;

  const total = Math.max(0, round2(afterDiscount + tripFee));

  const durationMinutes = chosen.reduce((mins, s) => {
    if (s.id === "gutter") return mins + gutterDuration(false, false);
    return mins + (DURATIONS_MIN[s.id] || 0);
  }, 0);

  return { selectedCount, effectiveCount, subtotal, multiRate, multiAmt, tripFee, total, durationMinutes };
}

/* =============================================================================
   Component (grid services, compact padding, sticky summary on desktop)
============================================================================= */
export default function InstantQuoteSchedule() {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Height reporting for parent page
  const sizerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    let lastQuantized = 0;
    let raf = 0;
    const STEP = 24;

    const measure = () => {
      const el = sizerRef.current;
      if (!el) {
        const doc = document.documentElement;
        const body = document.body;
        return Math.max(doc.scrollHeight, body.scrollHeight, doc.offsetHeight, body.offsetHeight);
      }
      return el.offsetTop + el.offsetHeight;
    };

    const postHeight = () => {
      const h = Math.ceil(measure());
      if (!Number.isFinite(h)) return;
      const quantized = Math.ceil(h / STEP) * STEP;
      if (quantized !== lastQuantized) {
        lastQuantized = quantized;
        window.parent?.postMessage({ type: "resize-quote-iframe", height: quantized }, "*");
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

  /* ---------- Pricing + booking URL ---------- */
  const totals = useMemo(() => computeTotals(selected, SERVICES, false, false), [selected]);

  const adjustedServices = useMemo<PricedService[]>(() => SERVICES.map((s) => ({ ...s, price: s.basePrice })), []);

  const hours = mapDurationToHours(totals.durationMinutes);
  const bookingUrl = useMemo(() => {
    const chosen = adjustedServices.filter((s) => selected[s.id]);
    const servicesList = chosen.map((s) => `${s.name} ($${s.price.toFixed(2)})`).join(", ") || "None";
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
        <p className="text-muted-foreground text-sm sm:text-base mb-[25px]">
          Select services to see your discounted price. Book instantly.
        </p>
      </header>

      {/* Use lg breakpoint so ≤991px stacks to one column */}
      <div className="grid gap-4 md:gap-6 items-start lg:grid-cols-[minmax(0,_1fr)_340px]">
        {/* Left column — grid of cards */}
        <div className="min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-1.5 sm:gap-2 items-stretch">
          {adjustedServices.map((svc) => (
            <Card
              key={svc.id}
              data-id={svc.id}
              className={cn(
                "h-full transition hover:shadow-md cursor-pointer",
                selected[svc.id] && "ring-2 ring-[#2755f8]/60"
              )}
              onClick={() => setSelected((prev) => ({ ...prev, [svc.id]: !prev[svc.id] }))}
            >
              {/* tighter interior + inline price */}
              <CardContent className="py-1 sm:py-2 px-3 sm:px-4 h-full">
                <div className="flex items-start gap-2.5 w-full">
                  <Checkbox
                    id={svc.id}
                    checked={!!selected[svc.id]}
                    onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [svc.id]: !!v }))}
                    className="mt-0.5 pointer-events-none border-[#2755f8] data-[state=checked]:bg-[#2755f8] data-[state=checked]:text-white"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[14px] sm:text-base leading-tight">{svc.name}</div>
                    <div className="text-[12px] sm:text-sm text-muted-foreground mt-0.5">{svc.desc}</div>
                  </div>
                  <div className="ml-auto text-right shrink-0">
                    <div className="text-base sm:text-lg font-semibold">${svc.price}</div>
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
                      {svc.id === "gutter" ? `${fmtDuration(gutterDuration(false, false))}` : `${fmtDuration(DURATIONS_MIN[svc.id])}`}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right column — sticky summary on desktop; always full-height list */}
        <aside className="lg:sticky lg:top-6 self-start z-30 h-fit">
          <Card>
            <CardContent className="py-2 sm:py-3 px-3 sm:px-4 space-y-2">
              <h2 className="text-base sm:text-lg font-semibold">Summary</h2>

              {/* Always render every service. Unselected appear greyed + crossed out. */}
              <ul className="text-xs sm:text-sm list-disc pl-5 space-y-1">
                {adjustedServices.map((s) => {
                  const on = !!selected[s.id];
                  return (
                    <li
                      key={s.id}
                      className={cn(!on && "text-muted-foreground line-through opacity-70")}
                    >
                      {s.name} (${s.price})
                    </li>
                  );
                })}
              </ul>

              <div className="border-t pt-2 space-y-1 text-sm sm:text-base">
                <div className="flex justify-between">
                  <span>Estimated time</span>
                  <span>{fmtDuration(totals.durationMinutes)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${totals.subtotal.toFixed(2)}</span>
                </div>

                {/* Always render bundle discount; show 0% / $0.00 when none */}
                <div
                  className={cn(
                    "flex justify-between",
                    totals.multiRate > 0 ? "text-green-600" : "text-muted-foreground"
                  )}
                >
                  <span>Bundle discount ({Math.round(totals.multiRate * 100) || 0}%)</span>
                  <span>
                    {totals.multiRate > 0 ? "- " : ""}
                    ${totals.multiAmt.toFixed(2)}
                  </span>
                </div>

                {/* Always render minimum-price row to avoid layout shift */}
                <div
                  className={cn(
                    "flex justify-between",
                    totals.tripFee > 0 ? "text-amber-600" : "text-muted-foreground"
                  )}
                >
                  <span>Minimum price ($249)</span>
                  <span>
                    {totals.tripFee > 0 ? "+ " : ""}
                    ${totals.tripFee.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between font-semibold text-lg sm:text-xl">
                  <span>Total</span>
                  <span>${totals.total.toFixed(2)}</span>
                </div>
              </div>

              <Button
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

              {/* Updated status line */}
              {!canSchedule ? (
                <p className="text-xs text-red-600">Select at least one service.</p>
              ) : (
                <p className="text-xs text-green-600">No deposit required to schedule.</p>
              )}

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1.5 text-center text-xs sm:text-sm leading-relaxed text-blue-900 mb-0">
                <p className="font-semibold text-black">Bundle & Save 💰</p>
                <p className={cn("transition-colors", totals.effectiveCount === 2 && "font-semibold text-[#2755f8]")}>
                  2 services → 5% off
                </p>
                <p className={cn("transition-colors", totals.effectiveCount === 3 && "font-semibold text-[#2755f8]")}>
                  3 services → 10% off
                </p>
                <p className={cn("transition-colors", totals.effectiveCount === 4 && "font-semibold text-[#2755f8]")}>
                  4 services → 15% off
                </p>
                <p className={cn("transition-colors", totals.effectiveCount >= 5 && "font-semibold text-[#2755f8]")}>
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