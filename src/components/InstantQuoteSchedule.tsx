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

type Promo = {
  code: string; // uppercase canonical
  label: string; // human-readable for UI/metadata
  apply: (args: {
    selected: Record<string, boolean>;
    subtotalAfterBundle: number;
  }) => { applicable: boolean; amount: number; note?: string };
};

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
  promoCode: string | null;
  promoAmt: number;
  tripFee: number;
  total: number;
  durationMinutes: number;
};

function discountCategoryFor(serviceId: string): string {
  if (serviceId.startsWith("pressure-")) return "pressure";
  return serviceId;
}

type PricedServiceMap = Record<string, boolean>;

const PROMOS: Promo[] = [
  // ROOF50 — $50 off when a roof cleaning is in the cart. Applied after bundle discount and before minimum price check.
  {
    code: "ROOF50",
    label: "$50 off Roof Clean",
    apply: ({ selected, subtotalAfterBundle }) => {
      const hasRoof = !!selected["roof"];
      if (!hasRoof)
        return {
          applicable: false,
          amount: 0,
          note: "Add Roof Clean to use ROOF50.",
        };
      const amount = Math.min(50, Math.max(0, subtotalAfterBundle));
      return { applicable: true, amount };
    },
  },
];

function findPromo(code: string | null): Promo | null {
  if (!code) return null;
  const canonical = code.trim().toUpperCase();
  return PROMOS.find((p) => p.code === canonical) || null;
}

export function computeTotals(
  selectedMap: PricedServiceMap,
  services: Service[],
  _twoStory: boolean,
  _gutterGuards: boolean,
  promoCode: string | null
): Totals {
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

  // bundle discount
  let multiRate = 0;
  if (effectiveCount >= 5) multiRate = 0.2;
  else if (effectiveCount === 4) multiRate = 0.15;
  else if (effectiveCount === 3) multiRate = 0.1;
  else if (effectiveCount === 2) multiRate = 0.05;

  const multiAmt = round2(subtotal * multiRate);
  const afterBundle = round2(subtotal - multiAmt);

  // promo (single code only)
  let promoAmt = 0;
  const promo = findPromo(promoCode);
  if (promo) {
    const res = promo.apply({
      selected: selectedMap,
      subtotalAfterBundle: afterBundle,
    });
    if (res.applicable) {
      promoAmt = round2(Math.min(afterBundle, res.amount));
    }
  }

  const afterPromo = round2(afterBundle - promoAmt);

  const MIN_TOTAL = 249;
  const tripFee =
    afterPromo < MIN_TOTAL && afterPromo > 0
      ? round2(MIN_TOTAL - afterPromo)
      : 0;

  const total = Math.max(0, round2(afterPromo + tripFee));

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
    promoCode: promo ? promo.code : null,
    promoAmt,
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
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);

  // Auto-apply ROOF50 and preselect Roof Clean for doorhanger UTM link
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const source = params.get("utm_source");
    const medium = params.get("utm_medium");
    const campaign = params.get("utm_campaign");
    if (
      source === "doorhanger" &&
      medium === "print" &&
      campaign === "roof_cleaning"
    ) {
      setAppliedPromo("ROOF50");
      setPromoInput("ROOF50");
      setSelected((prev) => ({ ...prev, roof: true })); // preselect Roof Clean
    }
  }, []);

  // Height reporting for parent page / iframe autosize
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

  /* ---------- Pricing + booking URL ---------- */
  const totals = useMemo(
    () => computeTotals(selected, SERVICES, false, false, appliedPromo),
    [selected, appliedPromo]
  );

  const adjustedServices = useMemo<PricedService[]>(
    () => SERVICES.map((s) => ({ ...s, price: s.basePrice })),
    []
  );

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
      promoCode: totals.promoCode || "",
      promoAmount: totals.promoAmt.toFixed(2),
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

  // Promo handlers
  const handleApplyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    const promo = findPromo(code);
    if (!promo) {
      setPromoMsg("Invalid code.");
      setAppliedPromo(null);
      return;
    }
    // Preview applicability using current selection
    const selectedServices = adjustedServices.filter((s) => selected[s.id]);
    const categories = new Set(
      selectedServices.map((s) => discountCategoryFor(s.id))
    ).size;
    const tier =
      categories >= 5
        ? 0.2
        : categories === 4
        ? 0.15
        : categories === 3
        ? 0.1
        : categories === 2
        ? 0.05
        : 0;

    const afterBundlePreview = round2(
      selectedServices.reduce((sum, s) => sum + s.price, 0) * (1 - tier)
    );

    const res = promo.apply({
      selected,
      subtotalAfterBundle: afterBundlePreview,
    });
    if (!res.applicable) {
      setPromoMsg(res.note || "Code not applicable to current selection.");
      setAppliedPromo(null);
      return;
    }
    setAppliedPromo(promo.code); // single code at a time
    setPromoMsg(null);
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoInput("");
    setPromoMsg(null);
  };

  // shared width for Apply/Remove to avoid layout shift
  const promoBtnBase = "h-10 w-28 font-bold cursor-pointer";

  return (
    <div
      className="max-w-[1280px] mx-auto px-[8px] sm:px-4 pt-0 bg-[#f2f3f8] text-base"
      style={{
        fontFamily:
          '"Open Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
      }}
    >
      <header className="mt-0 mb-3 sm:mb-4 text-center">
        <p className="text-muted-foreground mb-[25px] text-[18px]">
          Select services to see your discounted price. Book instantly.
        </p>
      </header>

      {/* Custom 992px breakpoint layout (via styled-jsx below) */}
      <div id="bp992-layout" className="grid gap-4 md:gap-6 items-start">
        {/* Left column — grid of cards + Bundle & Save below */}
        <div
          id="bp992-cards"
          className="min-w-0 grid grid-cols-1 gap-1.5 sm:gap-2 items-stretch"
        >
          {adjustedServices.map((svc) => (
            <Card
              key={svc.id}
              data-id={svc.id}
              className={cn(
                "h-full transition hover:shadow-md cursor-pointer",
                selected[svc.id] && "ring-2 ring-[#2755f8]/60"
              )}
              onClick={() =>
                setSelected((prev) => ({ ...prev, [svc.id]: !prev[svc.id] }))
              }
            >
              {/* tighter interior + inline price */}
              <CardContent className="py-1 sm:py-2 px-3 sm:px-4 h-full">
                <div className="flex items-start gap-2.5 w-full">
                  <Checkbox
                    id={svc.id}
                    checked={!!selected[svc.id]}
                    onCheckedChange={(v) =>
                      setSelected((prev) => ({ ...prev, [svc.id]: !!v }))
                    }
                    className="mt-0.5 pointer-events-none border-[#2755f8] data-[state=checked]:bg-[#2755f8] data-[state=checked]:text-white"
                  />
                  <div className="flex-1 min-w-0">
                    {/* Service title → 20px & bold */}
                    <div className="font-bold text-[20px] leading-tight">
                      {svc.name}
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {svc.desc}
                    </div>
                  </div>
                  <div className="ml-auto text-right shrink-0">
                    {/* Price matches title size & weight */}
                    <div className="text-[20px] font-bold">${svc.price}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {svc.id === "gutter"
                        ? `${fmtDuration(gutterDuration(false, false))}`
                        : `${fmtDuration(DURATIONS_MIN[svc.id])}`}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Bundle & Save — span 1 col on mobile, 2 cols at ≥ 992px */}
          <div className="col-span-1 lg:col-span-2 mt-2 rounded-xl border border-blue-100 bg-white shadow-sm p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* Bundle & Save title → 20px & bold */}
              <h3 className="text-[20px] font-bold text-black">
                Bundle & Save 💰
              </h3>
              <p className="text-black">
                Add services to unlock bigger discounts.
              </p>
            </div>

            {/* Tiers grid with blue background (same as discount code section) */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                {
                  n: 2,
                  label: "2 services",
                  rate: "5% off",
                  active: totals.effectiveCount === 2,
                },
                {
                  n: 3,
                  label: "3 services",
                  rate: "10% off",
                  active: totals.effectiveCount === 3,
                },
                {
                  n: 4,
                  label: "4 services",
                  rate: "15% off",
                  active: totals.effectiveCount === 4,
                },
                {
                  n: 5,
                  label: "5+ services",
                  rate: "20% off",
                  active: totals.effectiveCount >= 5,
                },
              ].map((t) => (
                <div
                  key={t.n}
                  className={cn(
                    "rounded-md border px-3 py-2 transition shadow-sm",
                    t.active
                      ? "border-[#2755f8] ring-2 ring-[#2755f8]/30 text-[#2755f8] font-semibold bg-blue-50"
                      : "border-blue-100 bg-blue-50"
                  )}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-[18px] font-bold">{t.rate}</div>
                </div>
              ))}
            </div>

            <p className="mt-3 text-black">
              Current bundle:{" "}
              <span className="font-semibold">{totals.effectiveCount}</span>{" "}
              {totals.effectiveCount === 1 ? "service" : "services"} selected.
            </p>
          </div>
        </div>

        {/* Right column — sticky summary at ≥ 992px; always full-height list */}
        <aside id="bp992-summary" className="self-start z-30 h-fit">
          <Card>
            {/* remove top margin */}
            <CardContent className="py-2 sm:py-3 px-3 sm:px-4 space-y-2 mt-0">
              {/* Summary → 20px & bold */}
              <h2 className="text-[20px] font-bold">Summary</h2>

              <ul className="list-disc pl-5 space-y-1">
                {adjustedServices.map((s) => {
                  const on = !!selected[s.id];
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        !on && "text-muted-foreground line-through opacity-70"
                      )}
                    >
                      {s.name} (${s.price})
                    </li>
                  );
                })}
              </ul>

              {/* Promo code input */}
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-1.5 space-y-1.5 overflow-hidden">
                <label htmlFor="promo" className="font-medium text-[16px]">
                  Discount code
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
                  <input
                    id="promo"
                    type="text"
                    inputMode="text"
                    placeholder="Enter code"
                    className="h-10 min-w-0 rounded-md border px-2 py-2 outline-none focus:ring-2 focus:ring-[#2755f8] bg-white text-base"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    disabled={!!appliedPromo}
                  />
                  {appliedPromo ? (
                    <Button
                      type="button"
                      className="h-10 w-full sm:w-28 bg-neutral-800 hover:bg-neutral-900 text-white font-bold cursor-pointer"
                      onClick={handleRemovePromo}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="h-10 w-full sm:w-28 bg-[#2755f8] hover:bg-[#1e45d1] text-white font-bold cursor-pointer"
                      onClick={handleApplyPromo}
                    >
                      Apply
                    </Button>
                  )}
                </div>

                {/* Reserve space to prevent layout shift for messages */}
                <div className="min-h-[20px]">
                  {appliedPromo ? (
                    <p className="text-green-600">
                      Code {appliedPromo} applied.
                    </p>
                  ) : promoMsg ? (
                    <p className="text-red-600">{promoMsg}</p>
                  ) : (
                    <p className="opacity-0">placeholder</p>
                  )}
                </div>
              </div>

              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Estimated time</span>
                  <span>{fmtDuration(totals.durationMinutes)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${totals.subtotal.toFixed(2)}</span>
                </div>

                <div
                  className={cn(
                    "flex justify-between",
                    totals.multiRate > 0
                      ? "text-green-600"
                      : "text-muted-foreground opacity-60"
                  )}
                >
                  <span>
                    Bundle discount ({Math.round(totals.multiRate * 100) || 0}%)
                  </span>
                  <span>
                    {totals.multiRate > 0 ? "- " : ""}$
                    {totals.multiAmt.toFixed(2)}
                  </span>
                </div>

                <div
                  className={cn(
                    "flex justify-between",
                    totals.promoCode
                      ? "text-green-600"
                      : "text-muted-foreground opacity-60"
                  )}
                >
                  <span>
                    Promo{" "}
                    {totals.promoCode ? `(${totals.promoCode})` : "(none)"}
                  </span>
                  <span>
                    {totals.promoCode && totals.promoAmt > 0 ? "- " : ""}$
                    {totals.promoCode ? totals.promoAmt.toFixed(2) : "0.00"}
                  </span>
                </div>

                <div
                  className={cn(
                    "flex justify-between",
                    totals.tripFee > 0
                      ? "text-amber-600"
                      : "text-muted-foreground opacity-60"
                  )}
                >
                  <span>Minimum price ($249)</span>
                  <span>
                    {totals.tripFee > 0 ? "+ " : ""}${totals.tripFee.toFixed(2)}
                  </span>
                </div>

                {/* Total → 20px & bold */}
                <div className="flex justify-between font-bold text-[20px]">
                  <span>Total</span>
                  <span>${totals.total.toFixed(2)}</span>
                </div>
              </div>

              <Button
                type="button"
                className="w-full h-12 text-base bg-[#2755f8] hover:bg-[#1e45d1] text-white cursor-pointer font-bold"
                disabled={!canSchedule}
                onClick={() => {
                  if (!canSchedule) return;
                  window.open(bookingUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <Calendar className="w-5 h-5 mr-2" /> Schedule Now
              </Button>

              {!canSchedule ? (
                <p className="text-red-600">Select at least one service.</p>
              ) : (
                <p className="text-green-600">
                  No deposit required to schedule.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Custom 992px breakpoint without editing tailwind.config.js */}
      <style jsx>{`
        /* Load Open Sans if not globally present */
        @import url("https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap");

        @media (min-width: 992px) {
          #bp992-layout {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) 340px !important;
            align-items: start !important;
          }
          #bp992-cards {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.5rem !important; /* ~gap-2 */
          }
          #bp992-summary {
            position: sticky !important;
            top: 1.5rem !important; /* ~top-6 */
            height: fit-content !important;
            z-index: 30 !important;
          }
        }
      `}</style>

      {/* sentinel for robust height measurement */}
      <div ref={sizerRef} style={{ height: 1 }} />
    </div>
  );
}
