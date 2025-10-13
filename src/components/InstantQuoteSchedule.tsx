"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

export const DISCOUNT_BLURB =
  "Bundle & Save: 2 services 5% • 3 services 10% • 4 services 15% • 5+ services 20%";

// Duration (minutes) per service
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
  twoStory: boolean,
  gutterGuards: boolean,
  promoHouseHalf?: boolean
): Totals {
  const adjustedServices: PricedService[] = services.map((s) => {
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

  const chosen: PricedService[] = adjustedServices.filter(
    (s): s is PricedService => Boolean(selectedMap[s.id])
  );

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
  const tripFee =
    afterDiscount < MIN_TOTAL && afterDiscount > 0
      ? round2(MIN_TOTAL - afterDiscount)
      : 0;

  const total = Math.max(0, round2(afterDiscount + tripFee));

  const durationMinutes = chosen.reduce((mins, s) => {
    if (s.id === "gutter") return mins + gutterDuration(twoStory, gutterGuards);
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
   Component
============================================================================= */
export default function InstantQuoteSchedule() {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // REQUIRED fields: start as null (no default)
  const [twoStory, setTwoStory] = useState<boolean | null>(null);
  const [gutterGuards, setGutterGuards] = useState<boolean | null>(null);

  // tripwire state
  const [showTripwire, setShowTripwire] = useState(false);
  const [promoHouseHalf, setPromoHouseHalf] = useState(false);

  // UX: show validation messages after trying to schedule
  const [attemptedSchedule, setAttemptedSchedule] = useState(false);

  // ---- Robust iframe auto-height: sentinel + quantization ----
  const sizerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let lastQuantized = 0;
    let raf = 0;
    const STEP = 24; // snap to 24px to avoid 1–5px jitter loops

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

    // Initial post
    postHeight();

    // Observe layout changes
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(postHeight);
    });
    ro.observe(document.documentElement);
    ro.observe(document.body);

    // Fonts / images / window resizes
    // @ts-ignore
    if (document.fonts?.ready) document.fonts.ready.then(() => postHeight());
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

  // 🔒 Lock body scroll when modal is open (prevents off-screen shift on mobile)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = showTripwire ? "hidden" : prev || "";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [showTripwire]);

  const hasGutter = !!selected["gutter"];
  const hasTwoStoryRelevant = !!(
    selected["windows"] ||
    selected["house"] ||
    selected["gutter"]
  );

  // Use false for pricing/duration when unanswered, but block scheduling separately
  const totals = useMemo(
    () =>
      computeTotals(
        selected,
        SERVICES,
        twoStory ?? false,
        gutterGuards ?? false,
        promoHouseHalf
      ),
    [selected, twoStory, gutterGuards, promoHouseHalf]
  );

  const adjustedServices = useMemo<PricedService[]>(() => {
    return SERVICES.map((s) => {
      let price = s.basePrice;
      if (twoStory ?? false) {
        if (s.id === "gutter") price = s.basePrice * 2;
        if (s.id === "house") price = s.basePrice + 100;
        if (s.id === "windows") price = s.basePrice + 100;
      }
      if ((gutterGuards ?? false) && s.id === "gutter") price += 749;
      if (promoHouseHalf && s.id === "house") price = Math.round(price * 0.5);
      return { ...s, price };
    });
  }, [twoStory, gutterGuards, promoHouseHalf]);

  const summaryLines = useMemo(() => {
    const items = adjustedServices
      .filter((s) => selected[s.id])
      .map((s) => `${s.name} ($${s.price})`);
    if (hasTwoStoryRelevant)
      items.push(
        `Two-story: ${
          twoStory === null ? "Select Yes/No" : twoStory ? "Yes" : "No"
        }`
      );
    if (hasGutter)
      items.push(
        `Gutter Guards: ${
          gutterGuards === null ? "Select Yes/No" : gutterGuards ? "Yes" : "No"
        }`
      );
    return items.length ? items : ["No services selected"];
  }, [
    selected,
    adjustedServices,
    twoStory,
    hasTwoStoryRelevant,
    hasGutter,
    gutterGuards,
  ]);

  // booking link (map minutes to 1..8 hr event type)
  const hours = mapDurationToHours(totals.durationMinutes);
  const bookingUrl = useMemo(() => {
    const chosen = adjustedServices.filter((s) => selected[s.id]);

    // Clean, human-readable services list
    const servicesList =
      chosen.map((s) => `${s.name} ($${s.price.toFixed(2)})`).join(", ") ||
      "None";

    // Include discount breakdown explicitly
    const meta = {
      services: servicesList,
      subtotal: totals.subtotal.toFixed(2),
      discountRate: `${(totals.multiRate * 100).toFixed(0)}%`,
      discountAmount: totals.multiAmt.toFixed(2),
      total: totals.total.toFixed(2),
      durationMinutes: String(totals.durationMinutes),
      effectiveServiceCount: String(totals.effectiveCount),
      twoStory: hasTwoStoryRelevant
        ? twoStory === null
          ? "Required"
          : twoStory
          ? "Yes"
          : "No"
        : "N/A",
      gutterGuards: hasGutter
        ? gutterGuards === null
          ? "Required"
          : gutterGuards
          ? "Yes"
          : "No"
        : "N/A",
      houseTripwire50: promoHouseHalf ? "Yes" : "No",
    } as Record<string, string>;

    return buildBookingUrl(hours, meta);
  }, [
    hours,
    adjustedServices,
    selected,
    totals,
    twoStory,
    gutterGuards,
    hasTwoStoryRelevant,
    hasGutter,
    promoHouseHalf,
  ]);

  // Required-field gating for scheduling
  const needsTwoStory = hasTwoStoryRelevant && twoStory === null;
  const needsGutterGuards = hasGutter && gutterGuards === null;

  const canSchedule = totals.total > 0 && !needsTwoStory && !needsGutterGuards;

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

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-6 pt-0 bg-[#f2f3f8]">
      <header className="mt-0 mb-6 sm:mb-6 text-center">
        <p className="text-muted-foreground mt-2">
          Select services to see your price. Book instantly.
        </p>
      </header>

      {/* Responsive two-column layout: 1-col on mobile, 2-col from md up */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Left: Services & Conditional Details */}
        <div className="min-w-0 space-y-6 md:col-span-2">
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
                      className="mt-1 pointer-events-none border-[#2755f8] data-[state=checked]:bg-[#2755f8] data-[state=checked]:text-white"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-lg leading-tight">
                        {svc.name}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {svc.desc}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold">${svc.price}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {svc.id === "gutter"
                          ? `${fmtDuration(
                              gutterDuration(
                                twoStory ?? false,
                                gutterGuards ?? false
                              )
                            )}`
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
                <h2 className="text-lg font-semibold">
                  Your Home&#39;s Details
                </h2>

                {/* Two-Story (No / Yes) */}
                {hasTwoStoryRelevant && (
                  <div className="mt-1">
                    <Label className="block mb-2 font-medium">
                      Is your home two stories?
                    </Label>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        aria-pressed={twoStory === false}
                        className={cn(
                          "h-10 px-4 rounded-xl border",
                          twoStory === false ? activeBtn : inactiveBtn
                        )}
                        onClick={() => setTwoStory(false)}
                      >
                        No
                      </Button>
                      <Button
                        type="button"
                        aria-pressed={twoStory === true}
                        className={cn(
                          "h-10 px-4 rounded-xl border",
                          twoStory === true ? activeBtn : inactiveBtn
                        )}
                        onClick={() => setTwoStory(true)}
                      >
                        Yes
                      </Button>
                    </div>
                    {attemptedSchedule && twoStory === null && (
                      <p className="text-xs text-red-600 mt-2">
                        Please select Yes or No.
                      </p>
                    )}
                    {!attemptedSchedule && twoStory === null && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Required.
                      </p>
                    )}
                  </div>
                )}

                {/* Gutter Guards (No / Yes) */}
                {hasGutter && (
                  <div className="mt-1">
                    <Label className="block mb-2 font-medium">
                      Do you have gutter guards installed?
                    </Label>
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
                    {attemptedSchedule && gutterGuards === null && (
                      <p className="text-xs text-red-600 mt-2">
                        Please select Yes or No.
                      </p>
                    )}
                    {!attemptedSchedule && gutterGuards === null && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Required.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Sticky Summary (desktop) */}
        <div className="sticky top-4 self-start z-30 md:col-span-1 h-fit">
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
                  setAttemptedSchedule(true);
                  if (!canSchedule) return;
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
                <p className="text-xs text-red-600">
                  {totals.total <= 0
                    ? "Select at least one service."
                    : needsTwoStory && needsGutterGuards
                    ? "Answer the two required questions."
                    : needsTwoStory
                    ? "Please answer: Is your home two stories?"
                    : "Please answer: Do you have gutter guards installed?"}
                </p>
              )}

              {/* Bundle & Save (multiline, only tier highlight) */}
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-center text-sm leading-relaxed text-blue-900 mb-0">
                <p className="font-semibold text-black">Bundle & Save 💰</p>

                <p
                  className={cn(
                    "transition-colors",
                    totals.effectiveCount === 2 && "font-semibold text-[#2755f8]"
                  )}
                >
                  2 services → 5% off
                </p>

                <p
                  className={cn(
                    "transition-colors",
                    totals.effectiveCount === 3 && "font-semibold text-[#2755f8]"
                  )}
                >
                  3 services → 10% off
                </p>

                <p
                  className={cn(
                    "transition-colors",
                    totals.effectiveCount === 4 && "font-semibold text-[#2755f8]"
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
        </div>
      </div>

      {/* Tripwire Modal — fully centered, body-scroll locked while open */}
      {showTripwire && (
        <div className="fixed inset-0 z-[60] grid place-items-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowTripwire(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tripwire-title"
            className="relative z-[61] w-[92vw] max-w-md rounded-2xl bg-white shadow-xl p-6"
          >
            <h3
              id="tripwire-title"
              className="text-lg font-semibold text-center"
            >
              Add a House Wash for 50% Off?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground text-center">
              A house wash cleans the siding of your home using low pressure.
              Save 50% on this service when you add it to your order now.
            </p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                type="button"
                className="h-11 rounded-xl bg-[#2755f8] hover:bg-[#1e45d1] text-white cursor-pointer"
                onClick={() => {
                  setSelected((prev) => ({ ...prev, house: true }));
                  setPromoHouseHalf(true);
                  setShowTripwire(false);
                  setTimeout(
                    () =>
                      window.open(bookingUrl, "_blank", "noopener,noreferrer"),
                    0
                  );
                }}
              >
                Add House Wash
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl border-[#2755f8] text-[#ffffff] hover:bg-[#6E6E6E] cursor-pointer"
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

      {/* sentinel for robust height measurement */}
      <div ref={sizerRef} style={{ height: 1 }} />
    </div>
  );
}