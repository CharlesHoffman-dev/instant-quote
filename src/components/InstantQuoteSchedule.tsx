"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
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
export type Service = { id: string; name: string; basePrice: number; desc: string };
type PricedService = Service & { price: number };

const SERVICES: Service[] = [
  { id: "pressure-driveway", name: "Pressure Wash - Driveway", basePrice: 249, desc: "Concrete driveway, front patio, walkway, and curb cleaning." },
  { id: "pressure-patio", name: "Pressure Wash - Back Patio", basePrice: 99, desc: "Concrete back patio cleaning." },
  { id: "windows", name: "Window/Screen Clean", basePrice: 449, desc: "Exterior window and screen cleaning." },
  { id: "house", name: "House Wash", basePrice: 599, desc: "Low-pressure exterior wall cleaning." },
  { id: "roof", name: "Roof Clean", basePrice: 899, desc: "Low-pressure roof cleaning." },
  { id: "gutter", name: "Gutter Clean", basePrice: 249, desc: "Debris removal and downspout flush." },
];

export const DISCOUNT_BLURB =
  "Bundle & Save: 2 services 5% • 3 services 10% • 4 services 15% • 5+ services 20%";

// Duration (minutes) per service
const DURATIONS_MIN: Record<string, number> = {
  "pressure-driveway": 60,
  "pressure-patio": 60, // 1 hour
  windows: 180, // 3 hours
  house: 120,
  roof: 120,
  gutter: 120, // base for 1-story, adjust via helper
};

function gutterDuration(twoStory: boolean, guards: boolean) {
  const base = twoStory ? 180 : 120; // 2-story = 3h, 1-story = 2h
  return guards ? base * 2 : base; // doubled if guards
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
  selectedCount: number;         // raw count (not used for discount)
  effectiveCount: number;        // discount count (pressure-* collapse to 1)
  subtotal: number;
  multiRate: number;
  multiAmt: number;
  tripFee: number;               // ensures $249 minimum
  total: number;
  durationMinutes: number;       // total estimated duration
};

function discountCategoryFor(serviceId: string): string {
  // Treat both pressure-* options as the same category for discount counting
  if (serviceId.startsWith("pressure-")) return "pressure";
  return serviceId;
}

export function computeTotals(
  selectedMap: Record<string, boolean>,
  services: Service[],
  twoStory: boolean,
  gutterGuards: boolean,
  promoHouseHalf?: boolean
): Totals {
  const adjustedServices: PricedService[] = services.map((s) => {
    let price = s.basePrice;
    if (twoStory) {
      if (s.id === "gutter") price = s.basePrice * 2; // 2-story gutters cost double
      if (s.id === "house") price = s.basePrice + 100;
      if (s.id === "windows") price = s.basePrice + 100;
    }
    if (gutterGuards && s.id === "gutter") price += 749; // surcharge if guards installed
    if (promoHouseHalf && s.id === "house") price = Math.round(price * 0.5); // tripwire discount
    return { ...s, price };
  });

  const chosen: PricedService[] = adjustedServices.filter(
    (s): s is PricedService => Boolean(selectedMap[s.id])
  );

  const selectedCount = chosen.length;

  // Discount “effective” count: pressure-driveway + pressure-patio => 1
  const effectiveCount = new Set(chosen.map((s) => discountCategoryFor(s.id))).size;

  const subtotal = chosen.reduce((sum, s) => sum + s.price, 0);

  // Discount ladder based on effectiveCount: 2→5%, 3→10%, 4→15%, 5+→20%
  let multiRate = 0;
  if (effectiveCount >= 5) multiRate = 0.2;
  else if (effectiveCount === 4) multiRate = 0.15;
  else if (effectiveCount === 3) multiRate = 0.1;
  else if (effectiveCount === 2) multiRate = 0.05;

  const multiAmt = round2(subtotal * multiRate);
  const afterDiscount = round2(subtotal - multiAmt);

  // Trip fee brings total up to $249 minimum
  const MIN_TOTAL = 249;
  const tripFee =
    afterDiscount < MIN_TOTAL && afterDiscount > 0 ? round2(MIN_TOTAL - afterDiscount) : 0;

  const total = Math.max(0, round2(afterDiscount + tripFee));

  // Duration sum
  const durationMinutes = chosen.reduce((mins, s) => {
    if (s.id === "gutter") return mins + gutterDuration(twoStory, gutterGuards);
    return mins + (DURATIONS_MIN[s.id] || 0);
  }, 0);

  return { selectedCount, effectiveCount, subtotal, multiRate, multiAmt, tripFee, total, durationMinutes };
}

/* =============================================================================
   Component (details removed – cal.com collects them)
============================================================================= */
export default function InstantQuoteSchedule() {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [twoStory, setTwoStory] = useState(false);
  const [gutterGuards, setGutterGuards] = useState<boolean>(false); // default No

  // tripwire state
  const [showTripwire, setShowTripwire] = useState(false);
  const [promoHouseHalf, setPromoHouseHalf] = useState(false);

  const hasGutter = !!selected["gutter"];
  const hasTwoStoryRelevant = !!(selected["windows"] || selected["house"] || selected["gutter"]);

  const totals = useMemo(
    () => computeTotals(selected, SERVICES, twoStory, gutterGuards, promoHouseHalf),
    [selected, twoStory, gutterGuards, promoHouseHalf]
  );

  const adjustedServices = useMemo<PricedService[]>(() => {
    return SERVICES.map((s) => {
      let price = s.basePrice;
      if (twoStory) {
        if (s.id === "gutter") price = s.basePrice * 2;
        if (s.id === "house") price = s.basePrice + 100;
        if (s.id === "windows") price = s.basePrice + 100;
      }
      if (gutterGuards && s.id === "gutter") price += 749;
      if (promoHouseHalf && s.id === "house") price = Math.round(price * 0.5);
      return { ...s, price };
    });
  }, [twoStory, gutterGuards, promoHouseHalf]);

  const summaryLines = useMemo(() => {
    const items = adjustedServices
      .filter((s) => selected[s.id])
      .map((s) => `${s.name} ($${s.price})`);
    if (hasTwoStoryRelevant) items.push(`Two-story: ${twoStory ? "Yes" : "No"}`);
    if (hasGutter) items.push(`Gutter Guards: ${gutterGuards ? "Yes" : "No"}`);
    return items.length ? items : ["No services selected"];
  }, [selected, adjustedServices, twoStory, hasTwoStoryRelevant, hasGutter, gutterGuards]);

  // booking link (map minutes to 1..8 hr event type)
  const hours = mapDurationToHours(totals.durationMinutes);
  const bookingUrl = useMemo(() => {
    const meta = {
      services:
        adjustedServices
          .filter((s) => selected[s.id])
          .map((s) => `${s.name}:${s.price}`)
          .join("|") || "None",
      total: String(totals.total),
      durationMinutes: String(totals.durationMinutes),
      twoStory: hasTwoStoryRelevant ? (twoStory ? "Yes" : "No") : "N/A",
      gutterGuards: hasGutter ? (gutterGuards ? "Yes" : "No") : "N/A",
      houseTripwire50: promoHouseHalf ? "Yes" : "No",
    } as Record<string, string>;
    return buildBookingUrl(hours, meta);
  }, [hours, adjustedServices, selected, totals, twoStory, gutterGuards, hasTwoStoryRelevant, hasGutter, promoHouseHalf]);

  const canSchedule = totals.total > 0;

  const activeBtn =
    "bg-[#2755f8] text-white border-[#2755f8] hover:bg-[#1e45d1] hover:text-white cursor-pointer";
  const inactiveBtn =
    "bg-white text-[#2755f8] border-[#2755f8] hover:bg-[#eaf0ff] cursor-pointer";

  const fmtDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (mins === 0) return "0 min";
    if (m === 0) return `${h} hr${h > 1 ? "s" : ""}`;
    return `${h > 0 ? `${h} hr${h > 1 ? "s" : ""} ` : ""}${m} min`;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    function postHeight() {
      try {
        const h = document.documentElement.scrollHeight || document.body.scrollHeight;
        window.parent?.postMessage({ type: "resize-quote-iframe", height: h }, "*");
      } catch {}
    }
    postHeight();
    const handler = () => requestAnimationFrame(postHeight);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 bg-[#f2f3f8]">
      <header className="mb-6 sm:mb-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Instant Exterior Cleaning Quote
        </h1>
        <p className="text-muted-foreground mt-2">
          Select services to see your price. Book instantly.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Services & Conditional Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Services */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {adjustedServices.map((svc) => (
              <Card
                key={svc.id}
                className={cn(
                  "transition hover:shadow-lg cursor-pointer",
                  selected[svc.id] && "ring-2 ring-[#2755f8]/60"
                )}
                onClick={() =>
                  setSelected((prev) => ({ ...prev, [svc.id]: !prev[svc.id] }))
                }
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={svc.id}
                      checked={!!selected[svc.id]}
                      onCheckedChange={(v) =>
                        setSelected((prev) => ({ ...prev, [svc.id]: !!v }))
                      }
                      className="mt-1 pointer-events-none"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-lg leading-tight">{svc.name}</div>
                      <div className="text-sm text-muted-foreground mt-1">{svc.desc}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold">${svc.price}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {svc.id === "gutter"
                          ? `${fmtDuration(gutterDuration(twoStory, gutterGuards))}`
                          : `${fmtDuration(DURATIONS_MIN[svc.id])}`}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>

          {/* Details Card: ONLY shows when relevant yes/no exists */}
          {(hasTwoStoryRelevant || hasGutter) && (
            <Card>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <h2 className="text-lg font-semibold">Your Home&#39;s Details</h2>

                {/* Two-Story (No / Yes) */}
                {hasTwoStoryRelevant && (
                  <div className="mt-1">
                    <Label className="block mb-2 font-medium">Is your home two stories?</Label>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        aria-pressed={!twoStory}
                        className={cn("h-10 px-4 rounded-xl border", !twoStory ? activeBtn : inactiveBtn)}
                        onClick={() => setTwoStory(false)}
                      >
                        No
                      </Button>
                      <Button
                        type="button"
                        aria-pressed={twoStory}
                        className={cn("h-10 px-4 rounded-xl border", twoStory ? activeBtn : inactiveBtn)}
                        onClick={() => setTwoStory(true)}
                      >
                        Yes
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Two-story homes require extra setup time and ladder work.
                    </p>
                  </div>
                )}

                {/* Gutter Guards (No / Yes, default No) */}
                {hasGutter && (
                  <div className="mt-1">
                    <Label className="block mb-2 font-medium">Do you have gutter guards installed?</Label>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        aria-pressed={gutterGuards === false}
                        className={cn(
                          "h-10 px-4 rounded-xl border",
                          gutterGuards === false ? activeBtn : inactiveBtn
                        )}
                        onClick={() => setGutterGuards(false)}
                      >
                        No
                      </Button>
                      <Button
                        type="button"
                        aria-pressed={gutterGuards === true}
                        className={cn(
                          "h-10 px-4 rounded-xl border",
                          gutterGuards === true ? activeBtn : inactiveBtn
                        )}
                        onClick={() => setGutterGuards(true)}
                      >
                        Yes
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Removing and reinstalling gutter guards takes additional time.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Sticky Summary */}
        <div className="lg:sticky lg:top-6 self-start">
          <Card>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <h2 className="text-lg font-semibold">Summary</h2>
              <ul className="text-sm list-disc pl-5 space-y-1">
                {summaryLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <div className="border-t pt-3 space-y-1 text-sm">
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
                    <span>Multi-service discount ({Math.round(totals.multiRate * 100)}%)</span>
                    <span>- ${totals.multiAmt.toFixed(2)}</span>
                  </div>
                )}
                {totals.tripFee > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Trip Fee (min $249)</span>
                    <span>+ ${totals.tripFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span>
                  <span>${totals.total.toFixed(2)}</span>
                </div>
              </div>
              <Button
                type="button"
                className="w-full h-11 text-base bg-[#2755f8] hover:bg-[#1e45d1] text-white cursor-pointer"
                disabled={!canSchedule}
                onClick={() => {
                  if (!selected["house"]) {
                    setShowTripwire(true);
                    return;
                  }
                  window.open(bookingUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <Calendar className="w-4 h-4 mr-2" /> Schedule Now
              </Button>
              {!canSchedule && (
                <p className="text-xs text-muted-foreground">Select at least one service to continue.</p>
              )}
              <p className="text-[11px] text-muted-foreground">{DISCOUNT_BLURB}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tripwire Modal */}
      {showTripwire && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTripwire(false)} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-[61] w-full max-w-md rounded-2xl bg-white shadow-xl p-6"
          >
            <h3 className="text-lg font-semibold text-center">Add a House Wash for 50% Off?</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center">
              A house wash cleans the siding of your home using low pressure. Save 50% on this
              service when you add it to your order now.
            </p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                type="button"
                className="h-11 rounded-xl bg-[#2755f8] hover:bg-[#1e45d1] text-white cursor-pointer"
                onClick={() => {
                  setSelected((prev) => ({ ...prev, house: true }));
                  setPromoHouseHalf(true);
                  setShowTripwire(false);
                  setTimeout(() => window.open(bookingUrl, "_blank", "noopener,noreferrer"), 0);
                }}
              >
                Add House Wash (Save 50%)
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl border-[#2755f8] text-[#2755f8] hover:bg-[#eaf0ff] cursor-pointer"
                onClick={() => {
                  setShowTripwire(false);
                  window.open(bookingUrl, "_blank", "noopener,noreferrer");
                }}
              >
                No Thanks
              </Button>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center text-xs text-muted-foreground mt-8">
        © {new Date().getFullYear()} Guardian Pressure Washing • San Antonio, TX
      </footer>
    </div>
  );
}