import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createClient } from "@supabase/supabase-js";

/** =========================
 *  SUPABASE
 *  ========================= */
const SUPABASE_URL = "https://jpphthbbawkxbhzonvyz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_b6cy5vUSAFkVxWkRyYJSUw_FagY1_5D";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SUPPORT_EMAIL = "chalkboards.app@gmail.com";

/** =========================
 *  ICONS
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
  const R = 3959;
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
  beer: ["beer", "draft", "pint", "ipa", "lager", "brew", "brewery", "bucket", "pitcher"],
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
  coffee: ["coffee", "espresso", "latte", "cappuccino", "cafe", "iced coffee", "cold brew"],
  dessert: ["dessert", "ice cream", "gelato", "cake", "brownie", "cookie", "donut", "cannoli", "cheesecake"],
  happyhour: ["happy hour", "hh", "2-for-1", "two for one", "bogo", "half off"],
  latenight: ["late night", "after 9", "after 10", "after 11", "midnight", "kitchen open late"],
  barfood: ["bar food", "apps", "appetizer", "nachos", "sliders", "wings", "fries", "pub", "tavern"],
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
 *  TIME PICKER
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
  extra: any | null;
  lat: number | null;
  lng: number | null;
};

function normLower(x: any): string {
  return String(x ?? "").trim().toLowerCase();
}

function isApprovedStatus(status: any): boolean {
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
  distance: number;
};

type RegularFeedItem = {
  kind: "regular";
  description: string;
  status: "active" | "later";
  start: string;
  end: string;
};

type FlashFeedItem = {
  kind: "flash";
  description: string;
  expiresInMinutes: number;
};

type GroupedFeed = {
  key: string; // normalized address
  businessName: string;
  address: string;
  lat: number;
  lng: number;
  distance: number;
  hasActive: boolean;
  regularItems: RegularFeedItem[];
  flashItems: FlashFeedItem[];
};

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
  variant,
}: {
  group: GroupedFeed;
  expanded: boolean;
  onToggleExpand: () => void;
  variant: "top" | "all";
}) {
  const distanceText = `${group.distance.toFixed(1)} mi`;
  const reportHref = makeReportMailto({
    businessName: group.businessName || "Business",
    address: group.address || "",
    description:
      group.flashItems[0]?.description || group.regularItems[0]?.description,
    kind: group.flashItems.length > 0 ? "flash" : "weekly",
  });

  const maxLinesCollapsed = 6;

  const lines: Array<{ line: string; sub: string }> = [
    ...group.flashItems.map((f) => ({
      line: `${ICON_FLASH} ${f.description}`,
      sub: `expires in ${f.expiresInMinutes} min`,
    })),
    ...group.regularItems.map((r) => ({
      line: `${statusIcon(r.status)} ${r.description}`,
      sub: prettyWindow(r.start, r.end),
    })),
  ];

  const shownLines = expanded ? lines : lines.slice(0, maxLinesCollapsed);
  const hiddenCount = Math.max(0, lines.length - shownLines.length);

  const cardStyle = variant === "top" ? styles.cardTop5 : styles.card;

  return (
    <div style={cardStyle}>
      <div style={styles.cardTopRow}>
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <div style={styles.cardTitle}>{group.businessName}</div>
          <div style={styles.cardSubtle}>
            {group.address} • {distanceText}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {group.flashItems.length > 0 && (
            <div style={styles.badgeFlash}>FLASH</div>
          )}
          <div style={group.hasActive ? styles.badgeActive : styles.badgeLater}>
            {group.hasActive ? "ACTIVE" : "LATER"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        {shownLines.map((x, idx) => (
          <div key={idx} style={styles.cardText}>
            {x.line}
            <div style={styles.cardSubline}>{x.sub}</div>
          </div>
        ))}

        {hiddenCount > 0 && (
          <button onClick={onToggleExpand} style={styles.inlineLinkBtn}>
            Show {hiddenCount} more
          </button>
        )}

        {expanded && lines.length > maxLinesCollapsed && (
          <button onClick={onToggleExpand} style={styles.inlineLinkBtn}>
            Collapse
          </button>
        )}
      </div>

      <div style={styles.cardActions}>
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

  /** ✅ CHANGE #1: default is Happening Now */
  const [feedMode, setFeedMode] = useState<FeedMode>("now");
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

  // location
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

  const [reloadTick, setReloadTick] = useState(0);

  // Load from supabase
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

  // countdown tick + refresh
  const [timeTick, setTimeTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setTimeTick((x) => x + 1);
      setReloadTick((x) => x + 1);
    }, 240000);
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

  /** Build "today rows" (weekly specials that matter now or later today) */
  const todayRows = useMemo((): TodayRow[] => {
    const rows: TodayRow[] = [];

    for (const w of weeklySpecials) {
      const dist = getDistance(userLocation.lat, userLocation.lng, w.lat, w.lng);
      if (radius !== 999 && dist > radius) continue;

      const startM = toMinutes(w.start);
      const endRaw = toMinutes(w.end);
      const crossesMidnight = endRaw <= startM;

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

      // after-midnight tail
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

    // Sort by distance first (closest first)
    filtered.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      // tie-breaker: active first
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
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

  const activeFlashInRadius = useMemo(() => {
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

  /** Group by restaurant (address normalized) */
  const groupedAllFeed = useMemo((): GroupedFeed[] => {
    const map = new Map<string, GroupedFeed>();

    const ensure = (
      key: string,
      sample: {
        businessName: string;
        address: string;
        lat: number;
        lng: number;
        distance: number;
      }
    ) => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          businessName: sample.businessName,
          address: sample.address,
          lat: sample.lat,
          lng: sample.lng,
          distance: sample.distance,
          hasActive: false,
          regularItems: [],
          flashItems: [],
        });
      } else {
        const g = map.get(key)!;
        if (sample.distance < g.distance) g.distance = sample.distance;
      }
    };

    // weekly/today
    for (const r of visibleTodayRows) {
      const key = normalizeAddress(r.address);
      ensure(key, {
        businessName: r.businessName,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        distance: r.distance,
      });

      const g = map.get(key)!;
      g.regularItems.push({
        kind: "regular",
        description: r.description,
        status: r.status,
        start: r.start,
        end: r.end,
      });
      if (r.status === "active") g.hasActive = true;
    }

    // flash
    for (const { f, distance } of activeFlashInRadius) {
      const key = normalizeAddress(f.fullAddress);
      ensure(key, {
        businessName: f.businessName,
        address: f.fullAddress,
        lat: f.lat,
        lng: f.lng,
        distance,
      });

      const g = map.get(key)!;
      g.flashItems.push({
        kind: "flash",
        description: f.description,
        expiresInMinutes: minutesFromNow(f.expiresAt - Date.now()),
      });
      g.hasActive = true;
    }

    // dedupe within restaurant
    map.forEach((g) => {
      g.flashItems = uniqByKey(g.flashItems, (x) => `flash|${x.description}`);
      g.regularItems = uniqByKey(
        g.regularItems,
        (x) => `weekly|${x.description}|${x.start}|${x.end}|${x.status}`
      );

      // stable order inside card
      g.flashItems.sort((a, b) => a.expiresInMinutes - b.expiresInMinutes);
      g.regularItems.sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return toMinutes(a.start) - toMinutes(b.start);
      });
    });

    const list = Array.from(map.values());

    // Sort by distance first
    list.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
      return a.businessName.localeCompare(b.businessName);
    });

    return list;
  }, [visibleTodayRows, activeFlashInRadius, timeTick]);

  const groupedTopFeed = useMemo(() => groupedAllFeed.slice(0, 5), [groupedAllFeed]);

  const groupedAllExceptTop = useMemo(() => {
    const topKeys = new Set(groupedTopFeed.map((g) => g.key));
    return groupedAllFeed.filter((g) => !topKeys.has(g.key));
  }, [groupedAllFeed, groupedTopFeed]);

  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    setPageSize(10);
  }, [radius, category, searchTerm, feedMode]);

  const visibleFullFeed = useMemo(() => {
    return groupedAllExceptTop.slice(0, pageSize);
  }, [groupedAllExceptTop, pageSize]);

  /** =========================
   *  MAP
   *  ========================= */
  useEffect(() => {
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
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView([userLocation.lat, userLocation.lng], 12);
  }, [userLocation.lat, userLocation.lng]);

  useEffect(() => {
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

    for (const g of groupedAllFeed) {
      const reportHref = makeReportMailto({
        businessName: g.businessName || "Business",
        address: g.address || "",
        description:
          g.flashItems[0]?.description || g.regularItems[0]?.description || "",
        kind: g.flashItems.length > 0 ? "flash" : "weekly",
      });

      const flashLines = g.flashItems
        .slice(0, 3)
        .map((x) => `<div>${esc(`${ICON_FLASH} ${x.description}`)}</div>`)
        .join("");

      const regularLines = g.regularItems
        .slice(0, 3)
        .map((x) =>
          `<div>${esc(
            `${statusIcon(x.status)} ${x.description} (${prettyWindow(
              x.start,
              x.end
            )})`
          )}</div>`
        )
        .join("");

      const popupHtml = `
        <b>${esc(g.businessName || "Business")}</b><br/>
        ${esc(g.address || "")}
        ${
          g.flashItems.length
            ? `<div style="margin-top:8px;"><b>Flash</b>${flashLines}</div>`
            : ""
        }
        ${
          g.regularItems.length
            ? `<div style="margin-top:8px;"><b>Today</b>${regularLines}</div>`
            : ""
        }
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <a href="${mapsUrlFromAddress(
            g.address
          )}" target="_blank" rel="noopener noreferrer">Open in Maps</a>
          <a href="${reportHref}">Report issue</a>
        </div>
      `;

      const marker = L.marker([g.lat, g.lng], { icon: wingIcon })
        .addTo(mapRef.current)
        .bindPopup(popupHtml);

      markersRef.current.push(marker);
    }
  }, [groupedAllFeed, wingIcon]);

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
   *  FLASH SUBMIT
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
   *  WEEKLY SUBMIT
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

    if (!typedName || !street || !city || !state || !zip || !description || !day) {
      alert("Please fill in ALL fields (name, address, day, time window, special).");
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
            <div style={styles.title}>Chalkboards</div>

            <div style={styles.subtitle}>
              Digital Restaurant Chalkboards + Live Local Specials • <b>{today}</b> •{" "}
              {format12Hour(new Date())} •{" "}
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

      {/* CATEGORY BAR */}
      <div style={styles.pod}>
        <div
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
              style={{
                ...styles.chip,
                ...(category === c.key ? styles.chipActive : null),
              }}
              title={c.label}
            >
              <span style={{ opacity: 0.95 }}>{c.emoji}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CONTROLS PODS (Filters + Mode only) */}
      <div style={styles.controlsGrid}>
        <div style={styles.pod}>
          <div style={styles.podTitle}>Filters</div>
          <div style={styles.podRow}>
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

            <div style={styles.searchField}>
              <div style={styles.label}>Search</div>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="name, address, or special…"
                style={styles.searchInput}
              />
              {searchTerm.trim() && (
                <button
                  onClick={() => setSearchTerm("")}
                  style={styles.btnSecondary}
                >
                  Clear
                </button>
              )}
            </div>

            <button onClick={handleLocateMe} style={styles.btnSmall}>
              Use My Location
            </button>
          </div>
        </div>

        <div style={styles.pod}>
          <div style={styles.podTitle}>Mode</div>
          <div style={styles.segmentWrap} aria-label="Feed mode">
            <button
              type="button"
              onClick={() => setFeedMode("now")}
              style={{
                ...styles.segmentBtn,
                ...(feedMode === "now" ? styles.segmentBtnActive : null),
              }}
              title="Only active specials"
            >
              {ICON_NOW} Happening Now
            </button>
            <button
              type="button"
              onClick={() => setFeedMode("upcoming")}
              style={{
                ...styles.segmentBtn,
                ...(feedMode === "upcoming" ? styles.segmentBtnActive : null),
              }}
              title="Active + later today"
            >
              {ICON_UPCOMING} Upcoming
            </button>
          </div>
        </div>
      </div>

      {/* ✅ CHANGE #2: MAP ABOVE POST */}
      <div ref={mapContainerRef} style={styles.map} />

      {/* POST POD (now below map) */}
      <div style={styles.pod}>
        <div style={styles.podTitle}>Post</div>
        <div style={styles.podRow}>
          <button
            onClick={() => setShowFlashForm((v) => !v)}
            style={styles.btnPrimarySmall}
          >
            {showFlashForm ? "Close Flash" : "Post Flash"}
          </button>
          <button
            onClick={() => setShowWeeklyForm((v) => !v)}
            style={styles.btnSmall}
          >
            {showWeeklyForm ? "Close Weekly" : "Post Weekly"}
          </button>
        </div>
      </div>

      {/* FORMS */}
      {showFlashForm && (
        <div style={styles.formCard}>
          <div style={styles.formTitle}>Post a Flash Special (same-day)</div>

          <div style={styles.formGrid}>
            <div style={styles.formField}>
              <div style={styles.label}>Business name</div>
              <input
                value={flashBusinessName}
                onChange={(e) => setFlashBusinessName(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formField}>
              <div style={styles.label}>Street</div>
              <input
                value={flashStreet}
                onChange={(e) => setFlashStreet(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formField}>
              <div style={styles.label}>City</div>
              <input
                value={flashCity}
                onChange={(e) => setFlashCity(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formField}>
              <div style={styles.label}>State</div>
              <input
                value={flashState}
                onChange={(e) => setFlashState(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formField}>
              <div style={styles.label}>ZIP</div>
              <input
                value={flashZip}
                onChange={(e) => setFlashZip(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formField}>
              <div style={styles.label}>Duration (minutes)</div>
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
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={styles.label}>Special description</div>
              <input
                value={flashDescription}
                onChange={(e) => setFlashDescription(e.target.value)}
                placeholder='Example: "Extra wings — 8 for $10 until 5pm"'
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.formActions}>
            <button
              onClick={addFlashSpecial}
              disabled={flashPosting}
              style={{
                ...styles.btnPrimary,
                opacity: flashPosting ? 0.65 : 1,
              }}
            >
              {flashPosting ? "Posting..." : "Submit Flash"}
            </button>
            <button
              onClick={() => setShowFlashForm(false)}
              style={styles.btnSecondary}
            >
              Cancel
            </button>
          </div>

          <div style={styles.microcopy}>Flash Specials expire automatically.</div>
        </div>
      )}

      {showWeeklyForm && (
        <div style={styles.formCard}>
          <div style={styles.formTitle}>Post a Weekly Special (recurring)</div>

          <div style={styles.formGrid}>
            <div style={styles.formField}>
              <div style={styles.label}>Business name</div>
              <input
                value={weeklyBusinessName}
                onChange={(e) => setWeeklyBusinessName(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formField}>
              <div style={styles.label}>Street</div>
              <input
                value={weeklyStreet}
                onChange={(e) => setWeeklyStreet(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formField}>
              <div style={styles.label}>City</div>
              <input
                value={weeklyCity}
                onChange={(e) => setWeeklyCity(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formField}>
              <div style={styles.label}>State</div>
              <input
                value={weeklyState}
                onChange={(e) => setWeeklyState(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formField}>
              <div style={styles.label}>ZIP</div>
              <input
                value={weeklyZip}
                onChange={(e) => setWeeklyZip(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.formField}>
              <div style={styles.label}>Day</div>
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
            </div>

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
              <div style={styles.label}>Special description</div>
              <input
                value={weeklyDescription}
                onChange={(e) => setWeeklyDescription(e.target.value)}
                placeholder='Example: "Taco Tuesday — $2 tacos 4–9pm"'
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.formActions}>
            <button
              onClick={addWeeklySpecial}
              disabled={weeklyPosting}
              style={{
                ...styles.btnPrimary,
                opacity: weeklyPosting ? 0.65 : 1,
              }}
            >
              {weeklyPosting ? "Posting..." : "Submit Weekly"}
            </button>
            <button
              onClick={() => setShowWeeklyForm(false)}
              style={styles.btnSecondary}
            >
              Cancel
            </button>
          </div>

          <div style={styles.microcopy}>
            Weekly Specials show on the chosen weekday.
          </div>
        </div>
      )}

      {/* TOP 5 */}
      <div style={styles.section}>
        <div style={styles.sectionHeaderRow}>
          <div style={styles.sectionTitle}>Top 5 Near You</div>
          <div style={styles.sectionMeta}>
            {radius === 999 ? "Anywhere" : `${radius} mi`} •{" "}
            {category === "all"
              ? "All categories"
              : CATEGORIES.find((c) => c.key === category)?.label}{" "}
            •{" "}
            {feedMode === "now"
              ? `${ICON_NOW} Happening Now`
              : `${ICON_UPCOMING} Upcoming`}
          </div>
        </div>

        {groupedTopFeed.length === 0 ? (
          <div style={styles.card}>
            <div style={styles.cardTitle}>No nearby specials</div>
            <div style={styles.cardText}>
              {searchTerm.trim()
                ? "Try a different search word, or clear search."
                : 'Try increasing your distance or tap "Use My Location".'}
            </div>
          </div>
        ) : (
          groupedTopFeed.map((g) => (
            <GroupedCard
              key={`top-${g.key}`}
              group={g}
              expanded={!!expandedKeys[`top-${g.key}`]}
              onToggleExpand={() => toggleExpand(`top-${g.key}`)}
              variant="top"
            />
          ))
        )}
      </div>

      {/* ALL NEARBY (NO REPEATS) */}
      <div style={styles.section}>
        <div style={styles.sectionHeaderRow}>
          <div style={styles.sectionTitle}>All Nearby</div>
        </div>

        {visibleFullFeed.map((g) => (
          <GroupedCard
            key={`all-${g.key}`}
            group={g}
            expanded={!!expandedKeys[`all-${g.key}`]}
            onToggleExpand={() => toggleExpand(`all-${g.key}`)}
            variant="all"
          />
        ))}

        {visibleFullFeed.length < groupedAllExceptTop.length && (
          <button
            onClick={() =>
              setPageSize((n) => Math.min(groupedAllExceptTop.length, n + 10))
            }
            style={styles.loadMoreBtn}
          >
            Load more (next 10)
          </button>
        )}
      </div>
      <div style={styles.footer}>
        Sorted by distance (closest first). Support:{" "}
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
    padding: 10,
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    marginBottom: 10,
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

  pod: {
    padding: 10,
    borderRadius: 18,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
    marginBottom: 10,
  },
  podTitle: {
    fontWeight: 900,
    letterSpacing: 0.3,
    fontSize: 12,
    opacity: 0.92,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  podRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },

  controlsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    marginBottom: 10,
  },

  categoryRow: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    overflowY: "hidden",
    flexWrap: "nowrap",
    padding: "2px 2px 2px",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
  },
  chip: {
    flex: "0 0 auto",
    padding: "9px 12px",
    borderRadius: 999,
    cursor: "pointer",
    userSelect: "none",
    fontWeight: 850,
    fontSize: 13,
    letterSpacing: 0.1,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#f2f2f2",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    transition: "transform 120ms ease, box-shadow 120ms ease",
  },
  chipActive: {
    border: "1px solid rgba(0, 255, 140, 0.55)",
    background: "rgba(0, 255, 140, 0.10)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.24)",
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
    fontWeight: 800,
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
    fontWeight: 700,
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
    fontWeight: 600,
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
    fontWeight: 700,
    letterSpacing: 0.1,
    width: "100%",
    minWidth: 0,
    fontSize: 13,
  },

  btnPrimary: {
    padding: "10px 13px",
    borderRadius: 14,
    border: "1px solid rgba(0, 140, 255, 0.34)",
    background: "rgba(0, 140, 255, 0.16)",
    color: "#f2f2f2",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: 0.15,
    boxShadow: "0 10px 22px rgba(0,0,0,0.25)",
    transition: "transform 120ms ease, filter 120ms ease",
  },
  btnSecondary: {
    padding: "10px 13px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#f2f2f2",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: 0.15,
    boxShadow: "0 10px 22px rgba(0,0,0,0.22)",
    transition: "transform 120ms ease, filter 120ms ease",
  },
  btnSmall: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#f2f2f2",
    cursor: "pointer",
    fontWeight: 800,
    letterSpacing: 0.1,
    boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
    transition: "transform 120ms ease, filter 120ms ease",
    fontSize: 13,
    lineHeight: 1.1,
  },
  btnPrimarySmall: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(0, 140, 255, 0.34)",
    background: "rgba(0, 140, 255, 0.16)",
    color: "#f2f2f2",
    cursor: "pointer",
    fontWeight: 800,
    letterSpacing: 0.1,
    boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
    transition: "transform 120ms ease, filter 120ms ease",
    fontSize: 13,
    lineHeight: 1.1,
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
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "#f2f2f2",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: 0.15,
    fontSize: 13,
  },
  segmentBtnActive: {
    border: "1px solid rgba(0, 255, 140, 0.55)",
    background: "rgba(0, 255, 140, 0.10)",
  },

  map: {
    height: 280,
    borderRadius: 18,
    marginBottom: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 14px 34px rgba(0,0,0,0.45)",
    overflow: "hidden",
  },

  section: { marginTop: 10 },
  sectionHeaderRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 16, fontWeight: 900, opacity: 0.98, letterSpacing: 0.2 },
  sectionMeta: { fontSize: 12, opacity: 0.85 },

  card: {
    padding: 14,
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.10)",
    marginBottom: 8,
    boxShadow: "0 10px 26px rgba(0,0,0,0.30)",
  },

  cardTop5: {
    padding: 14,
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.045))",
    border: "1px solid rgba(0, 255, 140, 0.22)",
    marginBottom: 8,
    boxShadow:
      "0 10px 26px rgba(0,0,0,0.30), 0 0 0 2px rgba(0, 255, 140, 0.10), 0 0 18px rgba(0, 255, 140, 0.12)",
  },

  cardTopRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: 900 },
  cardSubtle: { fontSize: 12, opacity: 0.75 },
  cardText: { marginTop: 6, fontSize: 14.5, lineHeight: 1.45, opacity: 0.98 },
  cardSubline: { fontSize: 12, opacity: 0.8, marginTop: 2 },

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

  inlineLinkBtn: {
    background: "transparent",
    border: "none",
    color: "#f2f2f2",
    textDecoration: "underline",
    cursor: "pointer",
    fontWeight: 800,
    padding: 0,
    textAlign: "left",
    marginTop: 10,
  },

  cardActions: { marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" },
  mapLink: {
    display: "inline-block",
    padding: "9px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#f2f2f2",
    textDecoration: "none",
    fontWeight: 900,
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
    fontWeight: 900,
    letterSpacing: 0.2,
    fontSize: 13,
    opacity: 0.95,
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
    marginTop: 10,
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
  },
  formTitle: { fontSize: 14, fontWeight: 900, letterSpacing: 0.3, marginBottom: 10 },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  formField: { display: "grid", gap: 6 },
  formActions: { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" },
  microcopy: { marginTop: 10, fontSize: 12, opacity: 0.78, lineHeight: 1.4 },
};