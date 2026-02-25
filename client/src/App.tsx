import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createClient } from "@supabase/supabase-js";

/** =========================
 *  SUPABASE (your project)
 *  ========================= */
const SUPABASE_URL = "https://jpphthbbawkxbhzonvyz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_b6cy5vUSAFkVxWkRyYJSUw_FagY1_5D";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** =========================
 *  SUPPORT / REPORTING
 *  ========================= */
const SUPPORT_EMAIL = "chalkboards.app@gmail.com";

/** =========================
 *  CONSISTENT ICONS
 *  ========================= */
const ICON_NOW = "🔥";
const ICON_UPCOMING = "🕒";
const ICON_FLASH = "⚡";

/** =========================
 *  TYPES
 *  ========================= */
type Weekday =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";

type FlashSpecial = {
  id: string;
  businessName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  lat: number;
  lng: number;
  description: string;
  createdAt: number;
  expiresAt: number;
};

type WeeklySpecial = {
  id: string;
  businessName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  lat: number;
  lng: number;
  day: Weekday;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  description: string;
  createdAt: number;
};

type AmPm = "AM" | "PM";
type Time12 = { hour: number; minute: string; ampm: AmPm };

/** =========================
 *  FONTS
 *  ========================= */
const HANDWRITING_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap";
const UI_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";

function ensureFontsLoaded() {
  if (typeof document === "undefined") return;

  const addLinkOnce = (id: string, href: string) => {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  };

  addLinkOnce("chalkboards-handwriting-font", HANDWRITING_FONT_HREF);
  addLinkOnce("chalkboards-ui-font", UI_FONT_HREF);
}

const WEEKDAYS: Weekday[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** =========================
 *  HELPERS
 *  ========================= */
function weekdayFromDate(d: Date): Weekday {
  return WEEKDAYS[d.getDay()];
}

function yesterdayFromDate(d: Date): Weekday {
  const idx = d.getDay();
  const y = (idx + 6) % 7;
  return WEEKDAYS[y];
}

function toMinutes(hhmm: string): number {
  const parts = String(hhmm || "").split(":");
  if (parts.length !== 2) return 0;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function format12Hour(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatHHMMTo12(hhmm: string): string {
  const parts = String(hhmm || "").split(":");
  if (parts.length !== 2) return hhmm;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hhmm;

  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function prettyWindow(start: string, end: string): string {
  const s = String(start || "").trim();
  const e = String(end || "").trim();

  const allDay =
    (s === "00:00" && (e === "23:59" || e === "24:00" || e === "00:00")) ||
    (s === "00:00" && e === "00:00");

  if (allDay) return "All day";
  return `${formatHHMMTo12(s)} – ${formatHHMMTo12(e)}`;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3959; // miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function minutesFromNow(ms: number): number {
  return Math.max(0, Math.ceil(ms / 60000));
}

async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(address);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function mapsUrlFromAddress(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
}

function isFlashActiveNow(f: FlashSpecial): boolean {
  const now = Date.now();
  return now >= f.createdAt && now <= f.expiresAt;
}

function normalizeAddress(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bstreet\b/g, "st")
    .replace(/\broad\b/g, "rd")
    .replace(/\broute\b/g, "rte")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\blane\b/g, "ln")
    .replace(/\bhighway\b/g, "hwy")
    .replace(/\bsuite\b/g, "ste")
    .replace(/\bapartment\b/g, "apt")
    .replace(/\s+/g, " ")
    .trim();
}

function includesSearch(
  query: string,
  ...fields: Array<string | undefined | null>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  for (const f of fields) {
    const s = (f ?? "").toLowerCase();
    if (s.includes(q)) return true;
  }
  return false;
}

function statusIcon(status: "active" | "later") {
  return status === "active" ? ICON_NOW : ICON_UPCOMING;
}

/** Report Issue -> opens email to SUPPORT_EMAIL with prefilled context */
function makeReportMailto(params: {
  businessName: string;
  address: string;
  description?: string;
  kind: "flash" | "weekly";
}) {
  const subject = `Chalkboards Report Issue — ${params.businessName}`;
  const bodyLines = [
    "Report issue:",
    "",
    `Business: ${params.businessName}`,
    `Address: ${params.address}`,
    `Type: ${params.kind}`,
    params.description ? `Special: ${params.description}` : "",
    "",
    "What’s wrong? (tell us):",
    "",
  ].filter(Boolean);

  const body = bodyLines.join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

/** =========================
 *  PRICE PARSING (sort cheapest first)
 *  ========================= */
function parsePriceCandidate(text: string): number | null {
  const s = String(text || "");
  if (!s) return null;

  // $8, $8.50, $0.50, etc.
  const m1 = s.match(/\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  if (m1 && m1[1]) {
    const n = parseFloat(m1[1]);
    if (Number.isFinite(n)) return n;
  }

  // "50 cents" -> 0.50
  const m2 = s.match(/([0-9]+(?:\.[0-9]+)?)\s*cents?/i);
  if (m2 && m2[1]) {
    const n = parseFloat(m2[1]);
    if (Number.isFinite(n)) return n / 100;
  }

  return null;
}

function bestPriceForDescriptions(descs: string[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const d of descs) {
    const p = parsePriceCandidate(d);
    if (p != null && p < best) best = p;
  }
  return best;
}

/** =========================
 *  CATEGORY FILTERS
 *  ========================= */
type CategoryKey =
  | "all"
  | "wings"
  | "mexican"
  | "pizza"
  | "burgers"
  | "sushi"
  | "bbq"
  | "seafood"
  | "pasta"
  | "med"
  | "sandwiches"
  | "breakfast"
  | "beer"
  | "cocktails"
  | "coffee"
  | "dessert"
  | "happyhour"
  | "latenight"
  | "barfood";

const CATEGORIES: Array<{ key: CategoryKey; label: string; emoji: string }> = [
  { key: "all", label: "All", emoji: "🗺️" },
  { key: "wings", label: "Wings", emoji: "🍗" },
  { key: "mexican", label: "Mexican", emoji: "🌮" },
  { key: "pizza", label: "Pizza", emoji: "🍕" },
  { key: "burgers", label: "Burgers", emoji: "🍔" },
  { key: "sushi", label: "Sushi", emoji: "🍣" },
  { key: "bbq", label: "BBQ", emoji: "🍖" },
  { key: "seafood", label: "Seafood", emoji: "🦞" },
  { key: "pasta", label: "Pasta", emoji: "🍝" },
  { key: "med", label: "Mediterranean", emoji: "🥙" },
  { key: "sandwiches", label: "Sandwiches", emoji: "🥪" },
  { key: "breakfast", label: "Breakfast", emoji: "🍳" },
  { key: "beer", label: "Beer", emoji: "🍺" },
  { key: "cocktails", label: "Cocktails", emoji: "🍸" },
  { key: "coffee", label: "Coffee", emoji: "☕" },
  { key: "dessert", label: "Dessert", emoji: "🍰" },
  { key: "happyhour", label: "Happy Hour", emoji: "⏰" },
  { key: "latenight", label: "Late Night", emoji: "🌙" },
  { key: "barfood", label: "Bar Food", emoji: "🍻" },
];

const CATEGORY_KEYWORDS: Record<CategoryKey, string[]> = {
  all: [],
  wings: ["wing", "wings", "boneless", "tenders", "drum", "flat"],
  mexican: [
    "mexican",
    "taqueria",
    "cantina",
    "tex-mex",
    "tortilla",
    "taco",
    "tacos",
    "taco tuesday",
    "birria",
    "quesabirria",
    "al pastor",
    "pastor",
    "barbacoa",
    "carnitas",
    "carne asada",
    "burrito",
    "burritos",
    "quesadilla",
    "quesadillas",
    "nacho",
    "nachos",
    "enchilada",
    "enchiladas",
    "fajita",
    "fajitas",
    "tostada",
    "tostadas",
    "tamale",
    "tamales",
    "elote",
    "guac",
    "guacamole",
    "salsa",
    "chips",
    "margarita",
    "margaritas",
    "tequila",
  ],
  pizza: ["pizza", "slice", "pie", "pizzeria", "stromboli", "calzone"],
  burgers: ["burger", "cheeseburger", "patty", "smashburger", "fries"],
  sushi: [
    "sushi",
    "maki",
    "sashimi",
    "roll",
    "nigiri",
    "poke",
    "ramen",
    "hibachi",
    "teriyaki",
  ],
  bbq: ["bbq", "barbecue", "brisket", "ribs", "smoke", "smoked", "pulled pork"],
  seafood: [
    "seafood",
    "shrimp",
    "oyster",
    "oysters",
    "lobster",
    "clams",
    "mussels",
    "crab",
    "fish",
    "salmon",
    "tuna",
  ],
  pasta: [
    "pasta",
    "spaghetti",
    "penne",
    "vodka",
    "alfredo",
    "parm",
    "parmesan",
    "lasagna",
    "gnocchi",
    "ravioli",
    "italian",
  ],
  med: [
    "mediterranean",
    "med",
    "greek",
    "gyro",
    "gyros",
    "shawarma",
    "falafel",
    "halal",
    "kebab",
    "kabob",
    "pita",
    "tzatziki",
    "hummus",
    "platter",
    "lamb",
    "chicken over rice",
  ],
  sandwiches: [
    "sandwich",
    "sub",
    "subs",
    "hero",
    "hoagie",
    "wrap",
    "panini",
    "deli",
    "cheesesteak",
    "chicken sandwich",
  ],
  breakfast: [
    "breakfast",
    "brunch",
    "pancake",
    "waffle",
    "eggs",
    "omelet",
    "bacon",
    "bagel",
  ],
  beer: [
    "beer",
    "draft",
    "pint",
    "ipa",
    "lager",
    "brew",
    "brewery",
    "bucket",
    "pitcher",
  ],
  cocktails: [
    "drink",
    "drinks",
    "cocktail",
    "martini",
    "margarita",
    "mojito",
    "old fashioned",
    "whiskey",
    "vodka",
    "tequila",
    "wine",
    "sangria",
  ],
  coffee: [
    "coffee",
    "espresso",
    "latte",
    "cappuccino",
    "cafe",
    "iced coffee",
    "cold brew",
  ],
  dessert: [
    "dessert",
    "ice cream",
    "gelato",
    "cake",
    "brownie",
    "cookie",
    "donut",
    "cannoli",
    "cheesecake",
  ],
  happyhour: ["happy hour", "hh", "2-for-1", "two for one", "bogo", "half off"],
  latenight: [
    "late night",
    "after 9",
    "after 10",
    "after 11",
    "midnight",
    "kitchen open late",
  ],
  barfood: [
    "bar food",
    "apps",
    "appetizer",
    "nachos",
    "sliders",
    "wings",
    "fries",
    "pub",
    "tavern",
  ],
};

function matchesCategory(
  category: CategoryKey,
  ...fields: Array<string | undefined | null>
) {
  if (category === "all") return true;
  const kws = CATEGORY_KEYWORDS[category] || [];
  const blob = fields.map((x) => (x ?? "").toLowerCase()).join(" • ");
  return kws.some((k) => blob.includes(k));
}

/** =========================
 *  TIME (AM/PM) HELPERS
 *  ========================= */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function time12To24(t: Time12): string {
  let h = t.hour;
  if (t.ampm === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h = h + 12;
  }
  return `${pad2(h)}:${t.minute}`;
}

function prettyTime12(t: Time12): string {
  return `${t.hour}:${t.minute} ${t.ampm}`;
}

function TimePicker12({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Time12;
  onChange: (next: Time12) => void;
}) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = ["00", "15", "30", "45"];

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={styles.label}>{label}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          value={value.hour}
          onChange={(e) =>
            onChange({ ...value, hour: parseInt(e.target.value, 10) })
          }
          style={styles.select}
        >
          {hours.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <select
          value={value.minute}
          onChange={(e) => onChange({ ...value, minute: e.target.value })}
          style={styles.select}
        >
          {minutes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={value.ampm}
          onChange={(e) =>
            onChange({ ...value, ampm: e.target.value as AmPm })
          }
          style={styles.select}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

/** =========================
 *  SUPABASE TABLE SHAPE
 *  ========================= */
type DbSpecialRow = {
  id: string;
  created_at: string;
  type: string | null;
  business_name: string | null;
  deal: string | null;
  address: string | null;
  expires_at: string | null;
  status: string | null;
  extra: any | null; // string OR object
  lat: number | null;
  lng: number | null;
};

function normLower(x: any): string {
  return String(x ?? "").trim().toLowerCase();
}

function isApprovedStatus(status: any): boolean {
  // Treat NULL as approved so legacy rows don't disappear
  if (status == null) return true;
  const s = normLower(status);
  return s === "approved" || s === "approve" || s === "live" || s === "published";
}

function isFlashType(t: any): boolean {
  const s = normLower(t);
  return s === "flash" || s === "f" || s === "flash_special";
}

function isWeeklyType(t: any): boolean {
  const s = normLower(t);
  return s === "weekly" || s === "w" || s === "weekly_special";
}

function normalizeWeekday(input: any): Weekday | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;

  const map: Record<string, Weekday> = {
    sun: "Sunday",
    sunday: "Sunday",
    mon: "Monday",
    monday: "Monday",
    tue: "Tuesday",
    tues: "Tuesday",
    tuesday: "Tuesday",
    wed: "Wednesday",
    weds: "Wednesday",
    wednesday: "Wednesday",
    thu: "Thursday",
    thur: "Thursday",
    thurs: "Thursday",
    thursday: "Thursday",
    fri: "Friday",
    friday: "Friday",
    sat: "Saturday",
    saturday: "Saturday",
  };

  return map[s] ?? null;
}

function tryParseWeeklyMeta(
  extra: any | null
): { day: Weekday; start: string; end: string } | null {
  if (!extra) return null;

  const coerce = (obj: any) => {
    const day = normalizeWeekday(obj?.day);
    const start = String(obj?.start ?? "").trim();
    const end = String(obj?.end ?? "").trim();
    if (!day || !start || !end) return null;
    return { day, start, end };
  };

  if (typeof extra === "object") return coerce(extra);

  if (typeof extra === "string") {
    const trimmed = extra.trim();
    if (!trimmed) return null;
    try {
      return coerce(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  return null;
}

function splitAddress(fullAddress: string) {
  const parts = fullAddress.split(",").map((x) => x.trim());
  const street = parts[0] ?? "";
  const city = parts[1] ?? "";
  let state = "";
  let zip = "";
  if (parts[2]) {
    const p = parts[2].split(" ").filter(Boolean);
    state = p[0] ?? "";
    zip = p[1] ?? "";
  }
  return { street, city, state, zip };
}

function rowsToFlash(rows: DbSpecialRow[]): FlashSpecial[] {
  const list: FlashSpecial[] = [];
  for (const r of rows) {
    if (!isFlashType(r.type)) continue;
    if (!isApprovedStatus(r.status)) continue;
    if (!r.address || !r.business_name || !r.deal) continue;
    if (r.lat == null || r.lng == null) continue;

    if (!r.expires_at) continue;

    const createdAt = new Date(r.created_at).getTime();
    const expiresAt = new Date(r.expires_at).getTime();
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) continue;

    const fullAddress = r.address;
    const { street, city, state, zip } = splitAddress(fullAddress);

    list.push({
      id: r.id,
      businessName: r.business_name,
      street,
      city,
      state,
      zip,
      fullAddress,
      lat: r.lat,
      lng: r.lng,
      description: r.deal,
      createdAt,
      expiresAt,
    });
  }
  return list.filter(isFlashActiveNow);
}

function rowsToWeekly(rows: DbSpecialRow[]): WeeklySpecial[] {
  const list: WeeklySpecial[] = [];
  for (const r of rows) {
    if (!isWeeklyType(r.type)) continue;
    if (!isApprovedStatus(r.status)) continue;
    if (!r.address || !r.business_name || !r.deal) continue;
    if (r.lat == null || r.lng == null) continue;

    const meta = tryParseWeeklyMeta(r.extra);
    if (!meta) continue;

    const createdAt = new Date(r.created_at).getTime();
    if (!Number.isFinite(createdAt)) continue;

    const fullAddress = r.address;
    const { street, city, state, zip } = splitAddress(fullAddress);

    list.push({
      id: r.id,
      businessName: r.business_name,
      street,
      city,
      state,
      zip,
      fullAddress,
      lat: r.lat,
      lng: r.lng,
      day: meta.day,
      start: meta.start,
      end: meta.end,
      description: r.deal,
      createdAt,
    });
  }
  return list;
}

/** =========================
 *  FEED TYPES
 *  ========================= */
type TodayRow = {
  businessName: string;
  address: string;
  lat: number;
  lng: number;
  start: string;
  end: string;
  description: string;
  status: "active" | "later";
  startsInMinutes?: number;
  distance?: number;
};

type RegularFeedItem = {
  kind: "regular";
  businessName: string;
  address: string;
  description: string;
  status: "active" | "later";
  start: string;
  end: string;
  startsInMinutes?: number;
  distance: number;
  priceHint: number;
};

type FlashFeedItem = {
  kind: "flash";
  businessName: string;
  address: string;
  description: string;
  expiresInMinutes: number;
  distance: number;
  priceHint: number;
};

type GroupedFeed = {
  key: string;
  businessName: string;
  address: string;
  distance: number;
  hasActiveRegular: boolean;
  hasFlash: boolean;
  bestPrice: number; // Infinity if unknown
  regularItems: RegularFeedItem[];
  flashItems: FlashFeedItem[];
};

/** Dedup inside a group */
function uniqByKey<T>(arr: T[], keyFn: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function GroupedCard({
  group,
  expanded,
  onToggleExpand,
}: {
  group: GroupedFeed;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const hasActive = group.hasFlash || group.hasActiveRegular;

  const distanceText =
    group.distance >= 999999 ? "" : `${group.distance.toFixed(1)} mi`;

  const reportHref = makeReportMailto({
    businessName: group.businessName || "Business",
    address: group.address || "",
    description:
      group.flashItems[0]?.description || group.regularItems[0]?.description,
    kind: group.flashItems.length > 0 ? "flash" : "weekly",
  });

  const maxLinesCollapsed = 6;

  const flashLines = group.flashItems.map((f) => ({
    line: `${ICON_FLASH} ${f.description}`,
    sub: `expires in ${f.expiresInMinutes} min`,
  }));

  const regularLines = group.regularItems.map((r) => ({
    line: `${statusIcon(r.status)} ${r.description}`,
    sub: prettyWindow(r.start, r.end),
  }));

  const allLines = [
    ...flashLines.map((x) => ({ ...x, kind: "flash" as const })),
    ...regularLines.map((x) => ({ ...x, kind: "regular" as const })),
  ];

  const shownLines = expanded ? allLines : allLines.slice(0, maxLinesCollapsed);
  const hiddenCount = Math.max(0, allLines.length - shownLines.length);

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <div style={styles.cardTitle}>{group.businessName}</div>
          <div style={styles.cardSubtle}>
            {group.address}
            {distanceText ? ` • ${distanceText}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {group.hasFlash && <div style={styles.badgeFlash}>FLASH</div>}
          <div style={hasActive ? styles.badgeActive : styles.badgeLater}>
            {hasActive ? "ACTIVE" : "LATER"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        {shownLines.map((x, idx) => (
          <div key={idx} style={styles.cardText}>
            {x.line}
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
              {x.sub}
            </div>
          </div>
        ))}

        {hiddenCount > 0 && (
          <button
            onClick={onToggleExpand}
            style={{
              ...styles.inlineLinkBtn,
              marginTop: 10,
            }}
          >
            Show {hiddenCount} more
          </button>
        )}

        {expanded && allLines.length > maxLinesCollapsed && (
          <button
            onClick={onToggleExpand}
            style={{
              ...styles.inlineLinkBtn,
              marginTop: 10,
              opacity: 0.9,
            }}
          >
            Collapse
          </button>
        )}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a
          href={mapsUrlFromAddress(group.address)}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.mapLink}
        >
          Open in Maps
        </a>

        <a href={reportHref} style={styles.reportLink}>
          Report issue
        </a>
      </div>
    </div>
  );
}

type FeedMode = "now" | "upcoming";

export default function App() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // ✅ Safe build mode: map OFF by default
  const [mapOn, setMapOn] = useState(false);

  const [feedMode, setFeedMode] = useState<FeedMode>("upcoming");
  const showLaterToday = feedMode === "upcoming";

  const [radius, setRadius] = useState(10);
  const [userLocation, setUserLocation] = useState({ lat: 40.88, lng: -74.07 });
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<CategoryKey>("all");

  const [dbStatus, setDbStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );
  const [dbErrorText, setDbErrorText] = useState<string>("");

  useEffect(() => {
    ensureFontsLoaded();
  }, []);

  // Try to set user location on load (silent)
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);

  // FLASH
  const [flashSpecials, setFlashSpecials] = useState<FlashSpecial[]>([]);
  const [showFlashForm, setShowFlashForm] = useState(false);
  const [flashBusinessName, setFlashBusinessName] = useState("");
  const [flashStreet, setFlashStreet] = useState("");
  const [flashCity, setFlashCity] = useState("");
  const [flashState, setFlashState] = useState("");
  const [flashZip, setFlashZip] = useState("");
  const [flashDescription, setFlashDescription] = useState("");
  const [flashDurationMins, setFlashDurationMins] = useState(120);
  const [flashPosting, setFlashPosting] = useState(false);

  // WEEKLY
  const [weeklySpecials, setWeeklySpecials] = useState<WeeklySpecial[]>([]);
  const [showWeeklyForm, setShowWeeklyForm] = useState(false);
  const [weeklyBusinessName, setWeeklyBusinessName] = useState("");
  const [weeklyStreet, setWeeklyStreet] = useState("");
  const [weeklyCity, setWeeklyCity] = useState("");
  const [weeklyState, setWeeklyState] = useState("");
  const [weeklyZip, setWeeklyZip] = useState("");
  const [weeklyDescription, setWeeklyDescription] = useState("");
  const [weeklyDay, setWeeklyDay] = useState<Weekday>("Monday");

  const [weeklyStart12, setWeeklyStart12] = useState<Time12>({
    hour: 11,
    minute: "00",
    ampm: "AM",
  });
  const [weeklyEnd12, setWeeklyEnd12] = useState<Time12>({
    hour: 2,
    minute: "00",
    ampm: "PM",
  });

  const [weeklyPosting, setWeeklyPosting] = useState(false);

  /** =========================
   *  REFRESH CONTROL
   *  ========================= */
  const [reloadTick, setReloadTick] = useState(0);

  /** =========================
   *  LOAD FROM SUPABASE
   *  ========================= */
  useEffect(() => {
    let cancelled = false;

    async function loadFromSupabase() {
      setDbStatus("loading");
      setDbErrorText("");

      const { data, error } = await supabase
        .from("specials")
        .select(
          "id, created_at, type, business_name, deal, address, expires_at, status, extra, lat, lng"
        )
        .order("created_at", { ascending: false })
        .limit(800);

      if (cancelled) return;

      if (error) {
        console.log("SUPABASE LOAD ERROR:", error);
        setDbStatus("error");
        setDbErrorText(error.message || "Unknown Supabase error");
        setFlashSpecials([]);
        setWeeklySpecials([]);
        return;
      }

      const rows = (data ?? []) as DbSpecialRow[];

      let nextFlash: FlashSpecial[] = [];
      let nextWeekly: WeeklySpecial[] = [];
      try {
        nextFlash = rowsToFlash(rows);
      } catch (e) {
        console.log("FLASH PARSE ERROR:", e);
        nextFlash = [];
      }
      try {
        nextWeekly = rowsToWeekly(rows);
      } catch (e) {
        console.log("WEEKLY PARSE ERROR:", e);
        nextWeekly = [];
      }

      setFlashSpecials(nextFlash);
      setWeeklySpecials(nextWeekly);
      setDbStatus("ok");
    }

    loadFromSupabase();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  /** =========================
   *  TICK for countdown + expiry + auto refresh
   *  ========================= */
  const [timeTick, setTimeTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setTimeTick((x) => x + 1);
      setReloadTick((x) => x + 1);
    }, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setFlashSpecials((prev) => prev.filter((f) => isFlashActiveNow(f)));
  }, [timeTick]);

  const todayDate = new Date();
  const today = weekdayFromDate(todayDate);
  const yesterday = yesterdayFromDate(todayDate);
  const nowMins = nowMinutes();

  const wingIcon = useMemo(
    () =>
      L.icon({
        iconUrl: "https://cdn-icons-png.flaticon.com/512/1147/1147850.png",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      }),
    []
  );

  const userIcon = useMemo(
    () =>
      L.icon({
        iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149059.png",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      }),
    []
  );

  /** =========================
   *  TODAY ROWS (handles overnight weekly specials)
   *  ========================= */
  const todayRows = useMemo((): TodayRow[] => {
    const rows: TodayRow[] = [];

    for (const w of weeklySpecials) {
      const dist = getDistance(userLocation.lat, userLocation.lng, w.lat, w.lng);
      if (radius !== 999 && dist > radius) continue;

      const startM = toMinutes(w.start);
      const endRaw = toMinutes(w.end);
      const crossesMidnight = endRaw <= startM;

      // Case A: scheduled for today
      if (w.day === today) {
        let endM = endRaw;
        if (crossesMidnight) endM += 24 * 60;

        const isLater = nowMins < startM;
        const isActive = nowMins >= startM && nowMins <= endM;

        if (isActive) {
          rows.push({
            businessName: w.businessName,
            address: w.fullAddress,
            lat: w.lat,
            lng: w.lng,
            start: w.start,
            end: w.end,
            description: w.description,
            status: "active",
            distance: dist,
          });
        } else if (isLater) {
          rows.push({
            businessName: w.businessName,
            address: w.fullAddress,
            lat: w.lat,
            lng: w.lng,
            start: w.start,
            end: w.end,
            description: w.description,
            status: "later",
            startsInMinutes: startM - nowMins,
            distance: dist,
          });
        }
        continue;
      }

      // Case B: after midnight tail of yesterday's overnight special
      if (crossesMidnight && w.day === yesterday) {
        const endM = endRaw + 24 * 60;
        const nowM = nowMins + 24 * 60;
        const isActive = nowM >= startM && nowM <= endM;

        if (isActive) {
          rows.push({
            businessName: w.businessName,
            address: w.fullAddress,
            lat: w.lat,
            lng: w.lng,
            start: w.start,
            end: w.end,
            description: w.description,
            status: "active",
            distance: dist,
          });
        }
      }
    }

    const filtered = rows
      .filter((r) =>
        includesSearch(searchTerm, r.businessName, r.address, r.description)
      )
      .filter((r) =>
        matchesCategory(category, r.description, r.businessName, r.address)
      );

    // active first, then cheaper first, then distance
    filtered.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;

      const ap = parsePriceCandidate(a.description);
      const bp = parsePriceCandidate(b.description);
      const aPrice = ap == null ? Number.POSITIVE_INFINITY : ap;
      const bPrice = bp == null ? Number.POSITIVE_INFINITY : bp;
      if (aPrice !== bPrice) return aPrice - bPrice;

      const aDist = a.distance ?? 999999;
      const bDist = b.distance ?? 999999;
      if (aDist !== bDist) return aDist - bDist;

      return toMinutes(a.start) - toMinutes(b.start);
    });

    return filtered;
  }, [
    today,
    yesterday,
    nowMins,
    userLocation,
    radius,
    weeklySpecials,
    searchTerm,
    category,
  ]);

  const visibleTodayRows = useMemo(() => {
    return todayRows.filter((r) => (showLaterToday ? true : r.status === "active"));
  }, [todayRows, showLaterToday]);

  const activeFlashInRadiusSorted = useMemo(() => {
    return flashSpecials
      .filter(isFlashActiveNow)
      .map((f) => ({
        f,
        distance: getDistance(userLocation.lat, userLocation.lng, f.lat, f.lng),
      }))
      .filter((x) => radius === 999 || x.distance <= radius)
      .filter(({ f }) =>
        includesSearch(searchTerm, f.businessName, f.fullAddress, f.description)
      )
      .filter(({ f }) =>
        matchesCategory(category, f.description, f.businessName, f.fullAddress)
      )
      .sort((a, b) => a.distance - b.distance);
  }, [flashSpecials, timeTick, userLocation, radius, searchTerm, category]);

  /** =========================
   *  GROUP + SORT (Featured + Full)
   *  ========================= */
  const groupedAllFeed = useMemo((): GroupedFeed[] => {
    const map = new Map<string, GroupedFeed>();

    const ensure = (key: string, businessName: string, address: string, distance: number) => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          businessName,
          address,
          distance,
          hasActiveRegular: false,
          hasFlash: false,
          bestPrice: Number.POSITIVE_INFINITY,
          regularItems: [],
          flashItems: [],
        });
      } else {
        const g = map.get(key)!;
        if (distance < g.distance) g.distance = distance;
        if (!g.address && address) g.address = address;
        if (!g.businessName && businessName) g.businessName = businessName;
      }
    };

    // Regular (today)
    visibleTodayRows.forEach((r) => {
      const key = normalizeAddress(r.address);
      ensure(key, r.businessName, r.address, r.distance ?? 999999);

      const g = map.get(key)!;
      const p = parsePriceCandidate(r.description);
      const priceHint = p == null ? Number.POSITIVE_INFINITY : p;

      g.regularItems.push({
        kind: "regular",
        businessName: r.businessName,
        address: r.address,
        description: r.description,
        status: r.status,
        start: r.start,
        end: r.end,
        startsInMinutes: r.startsInMinutes,
        distance: r.distance ?? 999999,
        priceHint,
      });

      if (r.status === "active") g.hasActiveRegular = true;
    });

    // Flash (always shown)
    activeFlashInRadiusSorted.forEach(({ f, distance }) => {
      const key = normalizeAddress(f.fullAddress);
      ensure(key, f.businessName, f.fullAddress, distance);

      const g = map.get(key)!;
      const p = parsePriceCandidate(f.description);
      const priceHint = p == null ? Number.POSITIVE_INFINITY : p;

      g.flashItems.push({
        kind: "flash",
        businessName: f.businessName,
        address: f.fullAddress,
        description: f.description,
        expiresInMinutes: minutesFromNow(f.expiresAt - Date.now()),
        distance,
        priceHint,
      });

      g.hasFlash = true;
    });

    // Dedup + sort within each restaurant
    map.forEach((g) => {
      g.flashItems = uniqByKey(
        g.flashItems,
        (x) => `${normalizeAddress(x.address)}|flash|${x.description}`
      );
      g.regularItems = uniqByKey(
        g.regularItems,
        (x) =>
          `${normalizeAddress(x.address)}|weekly|${x.description}|${x.start}|${x.end}|${x.status}`
      );

      g.flashItems.sort((a, b) => {
        // active flash always active; sort by cheaper first then expires soon
        if (a.priceHint !== b.priceHint) return a.priceHint - b.priceHint;
        return a.expiresInMinutes - b.expiresInMinutes;
      });

      g.regularItems.sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        if (a.priceHint !== b.priceHint) return a.priceHint - b.priceHint;
        return toMinutes(a.start) - toMinutes(b.start);
      });

      const descs = [
        ...g.flashItems.map((x) => x.description),
        ...g.regularItems.map((x) => x.description),
      ];
      g.bestPrice = bestPriceForDescriptions(descs);
    });

    const list = Array.from(map.values());

    // Group sort: active first → cheaper first → distance
    list.sort((a, b) => {
      const aActive = a.hasFlash || a.hasActiveRegular;
      const bActive = b.hasFlash || b.hasActiveRegular;
      if (aActive !== bActive) return aActive ? -1 : 1;

      if (a.bestPrice !== b.bestPrice) return a.bestPrice - b.bestPrice;

      return a.distance - b.distance;
    });

    return list;
  }, [visibleTodayRows, activeFlashInRadiusSorted, timeTick]);

  const groupedTopFeed = useMemo(() => groupedAllFeed.slice(0, 5), [groupedAllFeed]);

  /** =========================
   *  FULL LIST PAGINATION
   *  ========================= */
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    // reset paging when filters change
    setPageSize(10);
  }, [radius, category, searchTerm, feedMode]);

  const visibleFullFeed = useMemo(() => {
    return groupedAllFeed.slice(0, pageSize);
  }, [groupedAllFeed, pageSize]);

  /** =========================
   *  MAP INIT / DESTROY (only when mapOn)
   *  ========================= */
  useEffect(() => {
    if (!mapOn) return;

    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView(
        [userLocation.lat, userLocation.lng],
        11
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOn]);

  // keep map centered when userLocation changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView([userLocation.lat, userLocation.lng], 12);
  }, [userLocation.lat, userLocation.lng]);

  /** =========================
   *  MAP MARKERS UPDATE (only when mapOn)
   *  ========================= */
  useEffect(() => {
    if (!mapOn) return;
    if (!mapRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const esc = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // show markers for visibleFullFeed (so map isn't overloaded)
    visibleFullFeed.forEach((g) => {
      const lat = g.regularItems[0]?.distance != null ? undefined : undefined;

      // We don’t store lat/lng on group itself, so infer from a sample row:
      // - If has flash, take flash item (we don't keep lat/lng there)
      // - So instead, find an underlying today row (we have no lat there either in grouped)
      // => easiest: just place no marker if we can't (but in your old MVP you used row lat/lng)
      // ✅ Fix: we can reconstruct lat/lng by finding the nearest match among todayRows/flash list.
      const addrKey = normalizeAddress(g.address);

      // from flashSpecials / weeklySpecials
      const f = flashSpecials.find((x) => normalizeAddress(x.fullAddress) === addrKey);
      const w = weeklySpecials.find((x) => normalizeAddress(x.fullAddress) === addrKey);

      const latlng =
        f != null
          ? { lat: f.lat, lng: f.lng }
          : w != null
            ? { lat: w.lat, lng: w.lng }
            : null;

      if (!latlng) return;

      const reportHref = makeReportMailto({
        businessName: g.businessName || "Business",
        address: g.address || "",
        description:
          g.flashItems[0]?.description || g.regularItems[0]?.description || "",
        kind: g.flashItems.length > 0 ? "flash" : "weekly",
      });

      const flashLines = g.flashItems
        .slice(0, 3)
        .map((x) => `${ICON_FLASH} ${x.description}`)
        .map((x) => `<div>${esc(x)}</div>`)
        .join("");

      const regularLines = g.regularItems
        .slice(0, 3)
        .map((x) => `${statusIcon(x.status)} ${x.description} (${prettyWindow(x.start, x.end)})`)
        .map((x) => `<div>${esc(x)}</div>`)
        .join("");

      const popupHtml = `
        <b>${esc(g.businessName || "Business")}</b><br/>
        ${esc(g.address || "")}
        ${g.flashItems.length ? `<div style="margin-top:8px;"><b>Flash</b>${flashLines}</div>` : ""}
        ${g.regularItems.length ? `<div style="margin-top:8px;"><b>Today</b>${regularLines}</div>` : ""}
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <a href="${mapsUrlFromAddress(g.address)}" target="_blank" rel="noopener noreferrer">Open in Maps</a>
          <a href="${reportHref}">Report issue</a>
        </div>
      `;

      const marker = L.marker([latlng.lat, latlng.lng], { icon: wingIcon })
        .addTo(mapRef.current!)
        .bindPopup(popupHtml);

      markersRef.current.push(marker);
    });
  }, [mapOn, visibleFullFeed, wingIcon, flashSpecials, weeklySpecials]);

  /** =========================
   *  LOCATE ME
   *  ========================= */
  const handleLocateMe = () => {
    if (!("geolocation" in navigator)) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(newLocation);

        if (mapRef.current) {
          mapRef.current.setView([newLocation.lat, newLocation.lng], 12);

          if (userMarkerRef.current) userMarkerRef.current.remove();
          userMarkerRef.current = L.marker([newLocation.lat, newLocation.lng], {
            icon: userIcon,
          })
            .addTo(mapRef.current)
            .bindPopup("You are here")
            .openPopup();
        }
      },
      (error) => alert("Error getting location: " + error.message)
    );
  };

  /** =========================
   *  FLASH SUBMIT -> SUPABASE
   *  ========================= */
  const addFlashSpecial = async () => {
    if (flashPosting) return;

    const typedName = flashBusinessName.trim();
    const street = flashStreet.trim();
    const city = flashCity.trim();
    const state = flashState.trim();
    const zip = flashZip.trim();
    const description = flashDescription.trim();

    if (!typedName || !street || !city || !state || !zip || !description) {
      alert(
        "Please fill in ALL fields: business name, street, city, state, zip, and special."
      );
      return;
    }

    const fullAddress = `${street}, ${city}, ${state} ${zip}`;

    setFlashPosting(true);
    const coords = await geocodeAddress(fullAddress);

    if (!coords) {
      setFlashPosting(false);
      alert(
        "Could not find that address. Please double-check the street, city, state, and ZIP."
      );
      return;
    }

    const now = Date.now();
    const expiresAt = now + flashDurationMins * 60 * 1000;

    const addrKey = normalizeAddress(fullAddress);
    const fromExistingFlash =
      flashSpecials.find((f) => normalizeAddress(f.fullAddress) === addrKey)
        ?.businessName ?? null;
    const fromWeekly =
      weeklySpecials.find((w) => normalizeAddress(w.fullAddress) === addrKey)
        ?.businessName ?? null;

    const canonicalName = fromWeekly ?? fromExistingFlash ?? typedName;

    const { error } = await supabase.from("specials").insert([
      {
        type: "flash",
        business_name: canonicalName,
        deal: description,
        address: fullAddress,
        expires_at: new Date(expiresAt).toISOString(),
        status: "approved",
        extra: null,
        lat: coords.lat,
        lng: coords.lng,
      },
    ]);

    if (error) {
      console.log("SUPABASE INSERT ERROR:", error);
      setFlashPosting(false);
      alert(
        "Flash special could not save to the database.\n\nOpen Console and copy the error to me."
      );
      return;
    }

    if (mapRef.current) mapRef.current.setView([coords.lat, coords.lng], 14);

    setFlashBusinessName("");
    setFlashStreet("");
    setFlashCity("");
    setFlashState("");
    setFlashZip("");
    setFlashDescription("");
    setFlashDurationMins(120);
    setShowFlashForm(false);
    setFlashPosting(false);

    setReloadTick((x) => x + 1);
    alert("Posted live ✅");
  };

  /** =========================
   *  WEEKLY SUBMIT -> SUPABASE
   *  ========================= */
  const addWeeklySpecial = async () => {
    if (weeklyPosting) return;

    const typedName = weeklyBusinessName.trim();
    const street = weeklyStreet.trim();
    const city = weeklyCity.trim();
    const state = weeklyState.trim();
    const zip = weeklyZip.trim();
    const description = weeklyDescription.trim();
    const day = weeklyDay;

    if (
      !typedName ||
      !street ||
      !city ||
      !state ||
      !zip ||
      !description ||
      !day
    ) {
      alert(
        "Please fill in ALL fields (name, address, day, time window, special)."
      );
      return;
    }

    const start = time12To24(weeklyStart12);
    const end = time12To24(weeklyEnd12);

    if (start === end) {
      alert("Start and End time cannot be the same.");
      return;
    }

    const fullAddress = `${street}, ${city}, ${state} ${zip}`;

    setWeeklyPosting(true);
    const coords = await geocodeAddress(fullAddress);

    if (!coords) {
      setWeeklyPosting(false);
      alert(
        "Could not find that address. Please double-check the street, city, state, and ZIP."
      );
      return;
    }

    const addrKey = normalizeAddress(fullAddress);
    const fromExistingFlash =
      flashSpecials.find((f) => normalizeAddress(f.fullAddress) === addrKey)
        ?.businessName ?? null;
    const fromExistingWeekly =
      weeklySpecials.find((w) => normalizeAddress(w.fullAddress) === addrKey)
        ?.businessName ?? null;

    const canonicalName = fromExistingWeekly ?? fromExistingFlash ?? typedName;
    const extraObj = { day, start, end };

    const { error } = await supabase.from("specials").insert([
      {
        type: "weekly",
        business_name: canonicalName,
        deal: description,
        address: fullAddress,
        expires_at: null,
        status: "pending",
        extra: extraObj,
        lat: coords.lat,
        lng: coords.lng,
      },
    ]);

    if (error) {
      console.log("SUPABASE WEEKLY INSERT ERROR:", error);
      setWeeklyPosting(false);
      alert(
        "Weekly special could not save to the database.\n\nOpen Console and copy the error to me."
      );
      return;
    }

    if (mapRef.current) mapRef.current.setView([coords.lat, coords.lng], 14);

    setWeeklyBusinessName("");
    setWeeklyStreet("");
    setWeeklyCity("");
    setWeeklyState("");
    setWeeklyZip("");
    setWeeklyDescription("");
    setWeeklyDay("Monday");
    setWeeklyStart12({ hour: 11, minute: "00", ampm: "AM" });
    setWeeklyEnd12({ hour: 2, minute: "00", ampm: "PM" });
    setShowWeeklyForm(false);
    setWeeklyPosting(false);

    setReloadTick((x) => x + 1);
    alert("Submitted for approval ✅ (pending)");
  };

  const [hovered, setHovered] = useState<string | null>(null);

  const buttonStyle = (
    key: string,
    variant: "primary" | "secondary" = "primary"
  ): React.CSSProperties => {
    const base =
      variant === "primary"
        ? {
            background: "rgba(0, 140, 255, 0.16)",
            border: "1px solid rgba(0, 140, 255, 0.34)",
          }
        : {
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
          };

    const isHover = hovered === key;
    return {
      ...styles.buttonBase,
      ...base,
      transform: isHover ? "translateY(-1px)" : "translateY(0)",
      boxShadow: isHover
        ? "0 10px 22px rgba(0,0,0,0.32)"
        : "0 6px 14px rgba(0,0,0,0.22)",
      filter: isHover ? "brightness(1.06)" : "brightness(1)",
      opacity: 1,
    };
  };

  const chipStyle = (key: CategoryKey): React.CSSProperties => {
    const active = category === key;
    return {
      flex: "0 0 auto",
      padding: "8px 10px",
      borderRadius: 999,
      cursor: "pointer",
      userSelect: "none",
      fontWeight: 800,
      fontSize: 13,
      letterSpacing: 0.1,
      border: active
        ? "1px solid rgba(0, 140, 255, 0.55)"
        : "1px solid rgba(255,255,255,0.12)",
      background: active
        ? "rgba(0, 140, 255, 0.18)"
        : "rgba(255,255,255,0.05)",
      color: "#f2f2f2",
      whiteSpace: "nowrap",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    };
  };

  const segmentBtn = (active: boolean): React.CSSProperties => ({
    ...styles.segmentBtn,
    border: active
      ? "1px solid rgba(0, 140, 255, 0.55)"
      : "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(0, 140, 255, 0.18)" : "rgba(255,255,255,0.05)",
  });

  const formField = (label: string, child: React.ReactNode) => (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={styles.label}>{label}</div>
      {child}
    </div>
  );

  /** Expanded cards state */
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const toggleExpand = (key: string) =>
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/favicon.png"
            alt="Chalkboards"
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              objectFit: "contain",
              flex: "0 0 auto",
            }}
          />

          <div style={{ minWidth: 0 }}>
            <div className="cb-title" style={styles.title}>
              Chalkboards
            </div>

            <div style={styles.subtitle}>
              Live Local Specials • <b>{today}</b> • {format12Hour(new Date())} •{" "}
              {dbStatus === "ok" ? (
                <span
                  onClick={() => setReloadTick((x) => x + 1)}
                  style={{
                    color: "#00FF00",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                  title="Tap to refresh"
                >
                  LIVE ↻
                </span>
              ) : dbStatus === "loading" ? (
                <span style={{ opacity: 0.85 }}>Loading…</span>
              ) : dbStatus === "error" ? (
                <span style={{ color: "#ff6b6b", fontWeight: 800 }}>
                  Offline
                </span>
              ) : null}
              {dbStatus === "error" && dbErrorText ? (
                <span style={{ marginLeft: 10, opacity: 0.85 }}>
                  ({dbErrorText})
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* CONTROLS */}
      <div style={styles.controlsShell}>
        <div
          className="cb-chipRow"
          style={styles.categoryRow}
          onWheel={(e: React.WheelEvent<HTMLDivElement>) => {
            const el = e.currentTarget;
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX))
              el.scrollLeft += e.deltaY;
            else el.scrollLeft += e.deltaX;
          }}
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              style={chipStyle(c.key)}
              title={c.label}
            >
              <span style={{ opacity: 0.95 }}>{c.emoji}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>

        <div className="cb-controlsRow" style={styles.controlsRow}>
          <div className="cb-groupLeft" style={styles.groupLeft}>
            <button
              onClick={() => setReloadTick((x) => x + 1)}
              style={buttonStyle("refresh", "secondary")}
              onMouseEnter={() => setHovered("refresh")}
              onMouseLeave={() => setHovered(null)}
            >
              Refresh
            </button>

            <button
              onClick={() => setMapOn((v) => !v)}
              style={buttonStyle("maptoggle", "secondary")}
              onMouseEnter={() => setHovered("maptoggle")}
              onMouseLeave={() => setHovered(null)}
              title="Toggle map (safe build mode starts OFF)"
            >
              Map: {mapOn ? "ON" : "OFF"}
            </button>

            <div style={styles.field}>
              <div style={styles.label}>Distance</div>
              <select
                value={radius}
                onChange={(e) => setRadius(parseFloat(e.target.value))}
                style={styles.select}
              >
                <option value="0.5">0.5 mi</option>
                <option value="1">1 mi</option>
                <option value="2">2 mi</option>
                <option value="5">5 mi</option>
                <option value="10">10 mi</option>
                <option value="999">Anywhere</option>
              </select>
            </div>

            <div className="cb-searchField" style={styles.searchField}>
              <div style={styles.label}>Search</div>
              <input
                className="cb-searchInput"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="name, address, or special…"
                style={styles.searchInput}
              />
              {searchTerm.trim() && (
                <button
                  onClick={() => setSearchTerm("")}
                  style={buttonStyle("clearsearch", "secondary")}
                  onMouseEnter={() => setHovered("clearsearch")}
                  onMouseLeave={() => setHovered(null)}
                >
                  Clear
                </button>
              )}
            </div>

            <button
              onClick={handleLocateMe}
              style={buttonStyle("locate", "secondary")}
              onMouseEnter={() => setHovered("locate")}
              onMouseLeave={() => setHovered(null)}
            >
              Use My Location
            </button>

            <div style={{ opacity: 0.9, fontSize: 13, fontWeight: 800 }}>
              Featured {groupedTopFeed.length} • Showing {visibleFullFeed.length} /{" "}
              {groupedAllFeed.length}
            </div>
          </div>

          <div className="cb-groupRight" style={styles.groupRight}>
            <button
              onClick={() => setShowFlashForm((v) => !v)}
              style={buttonStyle("flash", "primary")}
              onMouseEnter={() => setHovered("flash")}
              onMouseLeave={() => setHovered(null)}
            >
              {showFlashForm ? "Close Flash" : "Post Flash"}
            </button>

            <button
              onClick={() => setShowWeeklyForm((v) => !v)}
              style={buttonStyle("weekly", "secondary")}
              onMouseEnter={() => setHovered("weekly")}
              onMouseLeave={() => setHovered(null)}
            >
              {showWeeklyForm ? "Close Weekly" : "Post Weekly"}
            </button>
          </div>
        </div>

        {/* 🔥 Happening Now / 🕒 Upcoming */}
        <div className="cb-controlsFooterRow" style={styles.controlsFooterRow}>
          <div style={styles.segmentWrap} aria-label="Feed mode">
            <button
              type="button"
              onClick={() => setFeedMode("now")}
              style={segmentBtn(feedMode === "now")}
              title="Only active specials"
            >
              {ICON_NOW} Happening Now
            </button>
            <button
              type="button"
              onClick={() => setFeedMode("upcoming")}
              style={segmentBtn(feedMode === "upcoming")}
              title="Active + later today"
            >
              {ICON_UPCOMING} Upcoming
            </button>
          </div>
        </div>

        {/* Map message */}
        {!mapOn && (
          <div style={styles.safeModeBanner}>
            Map is OFF (safe build mode). Turn it on whenever you want.
          </div>
        )}

        {showFlashForm && (
          <div style={styles.formCard}>
            <div style={styles.formTitle}>Post a Flash Special (same-day)</div>

            <div style={styles.formGrid}>
              {formField(
                "Business name",
                <input
                  value={flashBusinessName}
                  onChange={(e) => setFlashBusinessName(e.target.value)}
                  style={styles.input}
                />
              )}
              {formField(
                "Street",
                <input
                  value={flashStreet}
                  onChange={(e) => setFlashStreet(e.target.value)}
                  style={styles.input}
                />
              )}
              {formField(
                "City",
                <input
                  value={flashCity}
                  onChange={(e) => setFlashCity(e.target.value)}
                  style={styles.input}
                />
              )}
              {formField(
                "State",
                <input
                  value={flashState}
                  onChange={(e) => setFlashState(e.target.value)}
                  style={styles.input}
                />
              )}
              {formField(
                "ZIP",
                <input
                  value={flashZip}
                  onChange={(e) => setFlashZip(e.target.value)}
                  style={styles.input}
                />
              )}
              {formField(
                "Duration (minutes)",
                <input
                  type="number"
                  min={15}
                  max={720}
                  value={flashDurationMins}
                  onChange={(e) =>
                    setFlashDurationMins(parseInt(e.target.value || "120", 10))
                  }
                  style={styles.input}
                />
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                {formField(
                  "Special description",
                  <input
                    value={flashDescription}
                    onChange={(e) => setFlashDescription(e.target.value)}
                    placeholder='Example: "Extra wings — 8 for $10 until 5pm"'
                    style={styles.input}
                  />
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={addFlashSpecial}
                disabled={flashPosting}
                style={{
                  ...buttonStyle("flashsubmit", "primary"),
                  opacity: flashPosting ? 0.6 : 1,
                }}
                onMouseEnter={() => setHovered("flashsubmit")}
                onMouseLeave={() => setHovered(null)}
              >
                {flashPosting ? "Posting..." : "Submit Flash"}
              </button>

              <button
                onClick={() => setShowFlashForm(false)}
                style={buttonStyle("flashcancel", "secondary")}
                onMouseEnter={() => setHovered("flashcancel")}
                onMouseLeave={() => setHovered(null)}
              >
                Cancel
              </button>
            </div>

            <div style={styles.microcopy}>
              Flash Specials expire automatically. We use the address to drop a
              pin on the map.
            </div>
          </div>
        )}

        {showWeeklyForm && (
          <div style={styles.formCard}>
            <div style={styles.formTitle}>Post a Weekly Special (recurring)</div>

            <div style={styles.formGrid}>
              {formField(
                "Business name",
                <input
                  value={weeklyBusinessName}
                  onChange={(e) => setWeeklyBusinessName(e.target.value)}
                  style={styles.input}
                />
              )}
              {formField(
                "Street",
                <input
                  value={weeklyStreet}
                  onChange={(e) => setWeeklyStreet(e.target.value)}
                  style={styles.input}
                />
              )}
              {formField(
                "City",
                <input
                  value={weeklyCity}
                  onChange={(e) => setWeeklyCity(e.target.value)}
                  style={styles.input}
                />
              )}
              {formField(
                "State",
                <input
                  value={weeklyState}
                  onChange={(e) => setWeeklyState(e.target.value)}
                  style={styles.input}
                />
              )}
              {formField(
                "ZIP",
                <input
                  value={weeklyZip}
                  onChange={(e) => setWeeklyZip(e.target.value)}
                  style={styles.input}
                />
              )}

              {formField(
                "Day",
                <select
                  value={weeklyDay}
                  onChange={(e) => setWeeklyDay(e.target.value as Weekday)}
                  style={styles.select}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}

              <TimePicker12
                label="Start"
                value={weeklyStart12}
                onChange={setWeeklyStart12}
              />
              <TimePicker12
                label="End"
                value={weeklyEnd12}
                onChange={setWeeklyEnd12}
              />

              <div style={{ gridColumn: "1 / -1", fontSize: 12, opacity: 0.9 }}>
                You chose: <b>{prettyTime12(weeklyStart12)}</b> –{" "}
                <b>{prettyTime12(weeklyEnd12)}</b>
                <span style={{ marginLeft: 8, opacity: 0.8 }}>
                  (Overnight is allowed)
                </span>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                {formField(
                  "Special description",
                  <input
                    value={weeklyDescription}
                    onChange={(e) => setWeeklyDescription(e.target.value)}
                    placeholder='Example: "Mexican Night — tacos + margarita special"'
                    style={styles.input}
                  />
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={addWeeklySpecial}
                disabled={weeklyPosting}
                style={{
                  ...buttonStyle("weeklysubmit", "primary"),
                  opacity: weeklyPosting ? 0.6 : 1,
                }}
                onMouseEnter={() => setHovered("weeklysubmit")}
                onMouseLeave={() => setHovered(null)}
              >
                {weeklyPosting ? "Posting..." : "Submit Weekly"}
              </button>

              <button
                onClick={() => setShowWeeklyForm(false)}
                style={buttonStyle("weeklycancel", "secondary")}
                onMouseEnter={() => setHovered("weeklycancel")}
                onMouseLeave={() => setHovered(null)}
              >
                Cancel
              </button>
            </div>

            <div style={styles.microcopy}>
              Weekly Specials show on the chosen weekday (and overnight tails
              show after midnight).
            </div>
          </div>
        )}
      </div>

      {/* MAP */}
      {mapOn ? (
        <div ref={mapContainerRef} className="cb-map" style={styles.map} />
      ) : null}

      {/* TOP 5 */}
      <div style={styles.section}>
        <div style={styles.sectionHeaderRow}>
          <div style={styles.sectionTitle}>Top 5 Near You</div>
          <div style={styles.sectionMeta}>
            <span style={{ opacity: 0.9 }}>
              {radius === 999 ? "Anywhere" : `${radius} mi`}
            </span>
            <span style={{ opacity: 0.35, margin: "0 8px" }}>•</span>
            <span style={{ opacity: 0.85 }}>
              {category === "all"
                ? "All categories"
                : CATEGORIES.find((c) => c.key === category)?.label}
            </span>
            <span style={{ opacity: 0.35, margin: "0 8px" }}>•</span>
            <span style={{ opacity: 0.9 }}>
              {feedMode === "now"
                ? `${ICON_NOW} Happening Now`
                : `${ICON_UPCOMING} Upcoming`}
            </span>
            {searchTerm.trim() ? (
              <>
                <span style={{ opacity: 0.35, margin: "0 8px" }}>•</span>
                <span style={{ opacity: 0.9 }}>
                  Searching: <b>{searchTerm.trim()}</b>
                </span>
              </>
            ) : null}
          </div>
        </div>

        {groupedTopFeed.length === 0 ? (
          <div style={styles.card}>
            <div style={styles.cardTitle}>No nearby specials right now</div>
            <div style={styles.cardText}>
              {searchTerm.trim()
                ? "Try a different search word, or clear search."
                : 'Try increasing your distance or tap "Use My Location".'}
            </div>
          </div>
        ) : (
          groupedTopFeed.map((g) => (
            <GroupedCard
              key={g.key}
              group={g}
              expanded={!!expandedKeys[g.key]}
              onToggleExpand={() => toggleExpand(g.key)}
            />
          ))
        )}
      </div>

      {/* FULL LIST */}
      <div style={styles.section}>
        <div style={styles.sectionHeaderRow}>
          <div style={styles.sectionTitle}>All Nearby (Grouped)</div>
          <div style={styles.sectionMeta}>
            Showing <b>{visibleFullFeed.length}</b> / <b>{groupedAllFeed.length}</b>
          </div>
        </div>

        {visibleFullFeed.map((g) => (
          <GroupedCard
            key={`all-${g.key}`}
            group={g}
            expanded={!!expandedKeys[`all-${g.key}`]}
            onToggleExpand={() => toggleExpand(`all-${g.key}`)}
          />
        ))}

        {visibleFullFeed.length < groupedAllFeed.length && (
          <button
            onClick={() => setPageSize((n) => Math.min(groupedAllFeed.length, n + 10))}
            style={styles.loadMoreBtn}
          >
            Load more (next 10)
          </button>
        )}
      </div>

      <div style={styles.footer}>
        Active first • cheaper first (when detected) • then distance. • Support:{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{ color: "#f2f2f2", textDecoration: "underline" }}
        >
          {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}

/** =========================
 *  STYLES
 *  ========================= */
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    paddingTop: "calc(16px + env(safe-area-inset-top))",
    paddingLeft: "calc(16px + env(safe-area-inset-left))",
    paddingRight: "calc(16px + env(safe-area-inset-right))",
    paddingBottom: 16,
    background:
      "radial-gradient(1200px 700px at 20% -10%, rgba(0, 140, 255, 0.10), transparent 60%), #141414",
    color: "#f2f2f2",
    fontFamily:
      '"Inter", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    letterSpacing: 0.1,
    lineHeight: 1.35,
  },
  header: {
    padding: 12,
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    marginBottom: 12,
  },
  title: {
    fontSize: "clamp(28px, 8vw, 42px)",
    fontWeight: 900,
    letterSpacing: 0.8,
    lineHeight: 1,
    fontFamily:
      '"Permanent Marker", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    textShadow:
      "0 2px 0 rgba(0,0,0,0.45), 0 6px 14px rgba(0,0,0,0.45), 0 16px 28px rgba(0,0,0,0.35)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  subtitle: { marginTop: 4, opacity: 0.92, fontSize: 13, lineHeight: 1.2 },

  controlsShell: {
    padding: 12,
    borderRadius: 18,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
    marginBottom: 12,
  },
  controlsRow: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  groupLeft: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  groupRight: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  categoryRow: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    overflowY: "hidden",
    flexWrap: "nowrap",
    padding: "6px 2px 10px",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    marginBottom: 10,
  },

  controlsFooterRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginTop: 10,
    paddingTop: 10,
  },

  safeModeBanner: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.04)",
    border: "1px dashed rgba(255,255,255,0.16)",
    opacity: 0.92,
    fontWeight: 700,
  },

  field: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.10)",
  },

  searchField: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.10)",
    minWidth: 0,
    flex: "1 1 320px",
  },

  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    opacity: 0.85,
    whiteSpace: "nowrap",
  },

  select: {
    background: "rgba(20,20,20,0.35)",
    color: "#f2f2f2",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 12,
    padding: "8px 10px",
    outline: "none",
    fontWeight: 650,
    letterSpacing: 0.1,
    fontSize: 13,
  },

  input: {
    background: "rgba(20,20,20,0.35)",
    color: "#f2f2f2",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 14,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 500,
    width: "100%",
    boxSizing: "border-box",
    fontSize: 14,
  },

  searchInput: {
    background: "rgba(20,20,20,0.35)",
    color: "#f2f2f2",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 12,
    padding: "8px 10px",
    outline: "none",
    fontWeight: 650,
    letterSpacing: 0.1,
    width: "100%",
    minWidth: 0,
    fontSize: 13,
  },

  buttonBase: {
    padding: "9px 12px",
    borderRadius: 13,
    color: "#f2f2f2",
    cursor: "pointer",
    fontWeight: 800,
    letterSpacing: 0.15,
    lineHeight: 1,
    whiteSpace: "nowrap",
    transition: "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease",
    userSelect: "none",
    fontSize: 13,
  },

  segmentWrap: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  segmentBtn: {
    padding: "9px 12px",
    borderRadius: 999,
    color: "#f2f2f2",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: 0.15,
    lineHeight: 1,
    whiteSpace: "nowrap",
    transition: "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease",
    userSelect: "none",
    fontSize: 13,
  },

  map: {
    height: 270,
    borderRadius: 18,
    marginBottom: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 14px 34px rgba(0,0,0,0.45)",
    overflow: "hidden",
  },

  section: { marginTop: 12 },
  sectionHeaderRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 850,
    opacity: 0.98,
    letterSpacing: 0.2,
  },
  sectionMeta: { fontSize: 12, opacity: 0.85 },

  card: {
    padding: 14,
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.10)",
    marginBottom: 10,
    boxShadow: "0 10px 26px rgba(0,0,0,0.30)",
  },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: 850 },
  cardSubtle: { fontSize: 12, opacity: 0.75 },
  cardText: { marginTop: 6, fontSize: 14.5, lineHeight: 1.45, opacity: 0.98 },
  microcopy: { marginTop: 10, fontSize: 12, opacity: 0.78, lineHeight: 1.4 },

  badgeActive: {
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.6,
    background: "rgba(0, 255, 140, 0.16)",
    border: "1px solid rgba(0, 255, 140, 0.28)",
  },
  badgeLater: {
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.6,
    background: "rgba(255, 210, 0, 0.14)",
    border: "1px solid rgba(255, 210, 0, 0.26)",
  },
  badgeFlash: {
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.6,
    background: "rgba(0, 140, 255, 0.14)",
    border: "1px solid rgba(0, 140, 255, 0.28)",
  },

  mapLink: {
    display: "inline-block",
    padding: "9px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#f2f2f2",
    textDecoration: "none",
    fontWeight: 850,
    letterSpacing: 0.2,
    fontSize: 13,
  },

  reportLink: {
    display: "inline-block",
    padding: "9px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#f2f2f2",
    textDecoration: "none",
    fontWeight: 850,
    letterSpacing: 0.2,
    fontSize: 13,
    opacity: 0.95,
  },

  inlineLinkBtn: {
    background: "transparent",
    border: "none",
    color: "#f2f2f2",
    textDecoration: "underline",
    cursor: "pointer",
    fontWeight: 800,
    padding: 0,
    textAlign: "left",
  },

  loadMoreBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#f2f2f2",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
  },

  footer: { marginTop: 16, opacity: 0.72, fontSize: 12, lineHeight: 1.4 },

  formCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
  },
  formTitle: {
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
};