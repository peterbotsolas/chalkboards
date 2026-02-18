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

/** =========================
 *  CATEGORY FILTERS
 *  ========================= */
type CategoryKey =
  | "all"
  | "wings"
  | "tacos"
  | "sushi"
  | "pizza"
  | "beer"
  | "drinks"
  | "burgers"
  | "bbq"
  | "happyhour";

const CATEGORIES: Array<{ key: CategoryKey; label: string; emoji: string }> = [
  { key: "all", label: "All", emoji: "🗺️" },
  { key: "wings", label: "Wings", emoji: "🍗" },
  { key: "tacos", label: "Tacos", emoji: "🌮" },
  { key: "sushi", label: "Sushi", emoji: "🍣" },
  { key: "pizza", label: "Pizza", emoji: "🍕" },
  { key: "beer", label: "Beer", emoji: "🍺" },
  { key: "drinks", label: "Drinks", emoji: "🍸" },
  { key: "burgers", label: "Burgers", emoji: "🍔" },
  { key: "bbq", label: "BBQ", emoji: "🔥" },
  { key: "happyhour", label: "Happy Hour", emoji: "⏰" },
];

const CATEGORY_KEYWORDS: Record<CategoryKey, string[]> = {
  all: [],
  wings: ["wing", "wings", "boneless", "tenders", "drum", "flat"],
  tacos: ["taco", "tacos", "taco tuesday", "birria", "quesadilla", "nacho"],
  sushi: ["sushi", "maki", "sashimi", "roll", "nigiri", "poke"],
  pizza: ["pizza", "slice", "pie", "pizzeria"],
  beer: ["beer", "draft", "pint", "ipa", "lager", "brew", "brewery"],
  drinks: [
    "drink",
    "cocktail",
    "margarita",
    "martini",
    "tequila",
    "vodka",
    "whiskey",
  ],
  burgers: ["burger", "cheeseburger", "patty"],
  bbq: ["bbq", "barbecue", "brisket", "ribs", "smoke", "smoked"],
  happyhour: ["happy hour", "hh", "2-for-1", "two for one", "bogo"],
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

function normalizeWeekday(input: any): Weekday | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const found = WEEKDAYS.find((d) => d.toLowerCase() === lower);
  return found ?? null;
}

function tryParseWeeklyMeta(
  extra: any | null
): { day: Weekday; start: string; end: string } | null {
  if (!extra) return null;

  if (typeof extra === "object") {
    const day = normalizeWeekday(extra.day);
    const start = String(extra.start ?? "").trim();
    const end = String(extra.end ?? "").trim();
    if (!day || !start || !end) return null;
    return { day, start, end };
  }

  if (typeof extra === "string") {
    try {
      const obj = JSON.parse(extra);
      const day = normalizeWeekday(obj?.day);
      const start = String(obj?.start ?? "").trim();
      const end = String(obj?.end ?? "").trim();
      if (!day || !start || !end) return null;
      return { day, start, end };
    } catch {
      return null;
    }
  }

  return null;
}

function rowsToFlash(rows: DbSpecialRow[]): FlashSpecial[] {
  const list: FlashSpecial[] = [];
  for (const r of rows) {
    if (r.type !== "flash") continue;
    if (r.status !== "approved") continue;
    if (!r.address || !r.business_name || !r.deal) continue;
    if (r.lat == null || r.lng == null) continue;
    if (!r.expires_at) continue;

    const createdAt = new Date(r.created_at).getTime();
    const expiresAt = new Date(r.expires_at).getTime();
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) continue;

    const fullAddress = r.address;
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
    if (r.type !== "weekly") continue;
    if (r.status !== "approved") continue;
    if (!r.address || !r.business_name || !r.deal) continue;
    if (r.lat == null || r.lng == null) continue;

    const meta = tryParseWeeklyMeta(r.extra);
    if (!meta) continue;

    const createdAt = new Date(r.created_at).getTime();
    if (!Number.isFinite(createdAt)) continue;

    const fullAddress = r.address;
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
};

type FlashFeedItem = {
  kind: "flash";
  businessName: string;
  address: string;
  description: string;
  expiresInMinutes: number;
  distance: number;
};

type GroupedFeed = {
  key: string;
  businessName: string;
  address: string;
  distance: number;
  hasActiveRegular: boolean;
  regularItems: RegularFeedItem[];
  flashItems: FlashFeedItem[];
};

function GroupedCard({ group }: { group: GroupedFeed }) {
  const hasFlash = group.flashItems.length > 0;
  const hasActive = hasFlash || group.hasActiveRegular;

  const distanceText =
    group.distance >= 999999 ? "" : `${group.distance.toFixed(1)} mi`;
  const flashSoonest = hasFlash ? group.flashItems[0] : null;

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <div style={{ display: "grid", gap: 2 }}>
          <div style={styles.cardTitle}>{group.businessName}</div>
          <div style={styles.cardSubtle}>{distanceText ? distanceText : ""}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hasFlash && <div style={styles.badgeFlash}>FLASH</div>}
          <div style={hasActive ? styles.badgeActive : styles.badgeLater}>
            {hasActive ? "ACTIVE" : "LATER"}
          </div>
        </div>
      </div>

      {group.flashItems.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {group.flashItems.slice(0, 2).map((f, idx) => (
            <div key={`f-${idx}`} style={styles.cardText}>
              ⚡ {f.description}
            </div>
          ))}
          {group.flashItems.length > 2 && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              + {group.flashItems.length - 2} more flash
            </div>
          )}
        </div>
      )}

      {group.regularItems.length > 0 && (
        <div style={{ marginTop: group.flashItems.length > 0 ? 12 : 8 }}>
          {group.regularItems.slice(0, 2).map((r, idx) => (
            <div key={`r-${idx}`} style={styles.cardText}>
              {r.status === "active" ? "🔥" : "🕒"} {r.description}
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                {prettyWindow(r.start, r.end)}
              </div>
            </div>
          ))}
          {group.regularItems.length > 2 && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              + {group.regularItems.length - 2} more specials
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <a
          href={mapsUrlFromAddress(group.address)}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.mapLink}
        >
          Open in Maps
        </a>
      </div>

      <div style={styles.cardMeta}>
        <div style={{ maxWidth: "70%" }}>{group.address}</div>
        <div>
          {flashSoonest ? (
            <span>expires in {flashSoonest.expiresInMinutes} min</span>
          ) : group.regularItems.length > 0 ? (
            <span>
              {prettyWindow(
                group.regularItems[0].start,
                group.regularItems[0].end
              )}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [showLaterToday, setShowLaterToday] = useState(true);
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
   *  LOAD FROM SUPABASE (and refresh)
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
        .limit(600);

      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.log("SUPABASE LOAD ERROR:", error);
        setDbStatus("error");
        setDbErrorText(error.message || "Unknown Supabase error");
        setFlashSpecials([]);
        setWeeklySpecials([]);
        return;
      }

      const rows = (data ?? []) as DbSpecialRow[];
      setFlashSpecials(rowsToFlash(rows));
      setWeeklySpecials(rowsToWeekly(rows));
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
      if (dist > radius) continue;

      const startM = toMinutes(w.start);
      const endRaw = toMinutes(w.end);
      const crossesMidnight = endRaw <= startM;

      // Case A: scheduled for today
      if (w.day === today) {
        let endM = endRaw;
        if (crossesMidnight) endM += 24 * 60;

        const nowM = nowMins;
        const isLater = nowM < startM;
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
            startsInMinutes: startM - nowM,
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

    filtered.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
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

  const activeFlashInRadiusSorted = useMemo(() => {
    return flashSpecials
      .filter(isFlashActiveNow)
      .map((f) => ({
        f,
        distance: getDistance(userLocation.lat, userLocation.lng, f.lat, f.lng),
      }))
      .filter((x) => x.distance <= radius)
      .filter(({ f }) =>
        includesSearch(searchTerm, f.businessName, f.fullAddress, f.description)
      )
      .filter(({ f }) =>
        matchesCategory(category, f.description, f.businessName, f.fullAddress)
      )
      .sort((a, b) => a.distance - b.distance);
  }, [flashSpecials, timeTick, userLocation, radius, searchTerm, category]);

  const groupedTopFeed = useMemo((): GroupedFeed[] => {
    const map = new Map<string, GroupedFeed>();

    const addGroupIfNeeded = (
      key: string,
      businessName: string,
      address: string,
      distance: number
    ) => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          businessName,
          address,
          distance,
          hasActiveRegular: false,
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
    todayRows
      .filter((r) => (showLaterToday ? true : r.status === "active"))
      .forEach((r) => {
        const key = normalizeAddress(r.address);
        addGroupIfNeeded(key, r.businessName, r.address, r.distance ?? 999999);

        const g = map.get(key)!;
        g.businessName = r.businessName;

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
        });

        if (r.status === "active") g.hasActiveRegular = true;
      });

    // Flash
    activeFlashInRadiusSorted.forEach(({ f, distance }) => {
      const key = normalizeAddress(f.fullAddress);
      addGroupIfNeeded(key, f.businessName, f.fullAddress, distance);

      const g = map.get(key)!;
      g.flashItems.push({
        kind: "flash",
        businessName: f.businessName,
        address: f.fullAddress,
        description: f.description,
        expiresInMinutes: minutesFromNow(f.expiresAt - Date.now()),
        distance,
      });
    });

    map.forEach((g) => {
      g.flashItems.sort((a, b) => a.expiresInMinutes - b.expiresInMinutes);
      g.regularItems.sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return toMinutes(a.start) - toMinutes(b.start);
      });

      if (g.regularItems.length > 0) {
        g.address = g.regularItems[0].address;
        g.businessName = g.regularItems[0].businessName;
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => {
      const aActive = a.flashItems.length > 0 || a.hasActiveRegular;
      const bActive = b.flashItems.length > 0 || b.hasActiveRegular;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.distance - b.distance;
    });

    return list.slice(0, 5);
  }, [todayRows, activeFlashInRadiusSorted, showLaterToday, timeTick]);

  /** =========================
   *  MAP INIT (once)
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

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep map centered when userLocation changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView([userLocation.lat, userLocation.lng], 12);
  }, [userLocation.lat, userLocation.lng]);

  /** =========================
   *  MAP MARKERS UPDATE
   *  ========================= */
  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    type PopupBucket = {
      key: string;
      businessName: string;
      address: string;
      lat: number;
      lng: number;
      flashLines: string[];
      regularLines: string[];
    };

    const buckets = new Map<string, PopupBucket>();

    const upsert = (key: string, patch: Partial<PopupBucket>) => {
      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          key,
          businessName: patch.businessName ?? "",
          address: patch.address ?? "",
          lat: typeof patch.lat === "number" ? patch.lat : 0,
          lng: typeof patch.lng === "number" ? patch.lng : 0,
          flashLines: patch.flashLines ?? [],
          regularLines: patch.regularLines ?? [],
        });
        return;
      }

      if (patch.businessName) existing.businessName = patch.businessName;
      if (patch.address) existing.address = patch.address;

      if (
        typeof patch.lat === "number" &&
        typeof patch.lng === "number" &&
        Number.isFinite(patch.lat) &&
        Number.isFinite(patch.lng)
      ) {
        existing.lat = patch.lat;
        existing.lng = patch.lng;
      }

      if (patch.flashLines?.length)
        existing.flashLines.push(...patch.flashLines);
      if (patch.regularLines?.length)
        existing.regularLines.push(...patch.regularLines);
    };

    const esc = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // Regular
    todayRows.forEach((row) => {
      const key = normalizeAddress(row.address);
      upsert(key, {
        businessName: row.businessName,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        regularLines: [
          `${row.status === "active" ? "🔥" : "🕒"} ${row.description} (${prettyWindow(
            row.start,
            row.end
          )})`,
        ],
      });
    });

    // Flash
    activeFlashInRadiusSorted.forEach(({ f }) => {
      const key = normalizeAddress(f.fullAddress);
      upsert(key, {
        businessName: f.businessName,
        address: f.fullAddress,
        lat: f.lat,
        lng: f.lng,
        flashLines: [`⚡ ${f.description}`],
      });
    });

    buckets.forEach((b) => {
      if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return;

      const flashLines = Array.from(new Set(b.flashLines));
      const regularLines = Array.from(new Set(b.regularLines));

      const flashHtml =
        flashLines.length > 0
          ? `<div style="margin-top:8px;">
              <div><b>Flash</b></div>
              ${flashLines
                .slice(0, 3)
                .map((x) => `<div>${esc(x)}</div>`)
                .join("")}
            </div>`
          : "";

      const regularHtml =
        regularLines.length > 0
          ? `<div style="margin-top:8px;">
              <div><b>Today</b></div>
              ${regularLines
                .slice(0, 3)
                .map((x) => `<div>${esc(x)}</div>`)
                .join("")}
            </div>`
          : "";

      const mapsLink = `<div style="margin-top:10px;">
          <a href="${mapsUrlFromAddress(
            b.address
          )}" target="_blank" rel="noopener noreferrer">Open in Maps</a>
        </div>`;

      const popupHtml = `<b>${esc(b.businessName || "Business")}</b><br>${esc(
        b.address
      )}${flashHtml}${regularHtml}${mapsLink}`;

      const marker = L.marker([b.lat, b.lng], { icon: wingIcon })
        .addTo(mapRef.current!)
        .bindPopup(popupHtml);

      markersRef.current.push(marker);
    });
  }, [todayRows, wingIcon, activeFlashInRadiusSorted]);

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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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

  const formField = (label: string, child: React.ReactNode) => (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={styles.label}>{label}</div>
      {child}
    </div>
  );

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerTopRow}>
          <img
            className="cb-logo"
            src="/favicon.png"
            alt="Chalkboards"
            style={{
              width: 72,
              height: 72,
              padding: 6,
              boxSizing: "border-box",
              borderRadius: 16,
              objectFit: "contain",
              display: "block",
              filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.35))",
              flex: "0 0 auto",
            }}
          />

          {/* IMPORTANT: minWidth:0 + overflow rules prevent flex overflow on iOS */}
          <div style={styles.titleWrap}>
            <div className="cb-title" style={styles.title}>
              Chalkboards
            </div>
          </div>
        </div>

        <div className="cb-subtitle" style={styles.subtitle}>
          <span style={{ opacity: 0.9 }}>{"Live Local Specials"}</span>
          <span style={{ opacity: 0.55, margin: "0 8px" }}>•</span>
          <b style={{ fontWeight: 800 }}>{today}</b>
          <span style={{ opacity: 0.55, margin: "0 8px" }}>•</span>
          <span style={{ opacity: 0.9 }}>{format12Hour(new Date())}</span>
          <span style={{ opacity: 0.55, margin: "0 8px" }}>•</span>

          <span style={{ opacity: 0.9 }}>
            Database:{" "}
            {dbStatus === "ok" ? (
              <span style={{ color: "#00FF00", fontFamily: "monospace" }}>
                <b>LIVE</b>
              </span>
            ) : dbStatus === "loading" ? (
              <b>Loading…</b>
            ) : dbStatus === "error" ? (
              <span style={{ color: "#ff6b6b" }}>
                <b>Blocked</b>
                {dbErrorText ? (
                  <span style={{ marginLeft: 8, opacity: 0.9 }}>
                    ({dbErrorText})
                  </span>
                ) : null}
              </span>
            ) : (
              <b>—</b>
            )}
          </span>

          <span style={{ marginLeft: 10 }}>
            <button
              onClick={() => setReloadTick((x) => x + 1)}
              style={buttonStyle("refreshdb", "secondary")}
              onMouseEnter={() => setHovered("refreshdb")}
              onMouseLeave={() => setHovered(null)}
            >
              Refresh
            </button>
          </span>
        </div>
      </div>

      {/* CONTROLS SHELL */}
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

        <div className="cb-controlsFooterRow" style={styles.controlsFooterRow}>
          <label style={styles.togglePill}>
            <input
              type="checkbox"
              checked={showLaterToday}
              onChange={(e) => setShowLaterToday(e.target.checked)}
            />
            <span style={{ marginLeft: 8 }}>Include upcoming specials</span>
          </label>
        </div>

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

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
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
              Flash Specials expire automatically. We use the address to drop a pin on the map.
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
                    placeholder='Example: "Taco Tuesday — 2 tacos + soda for $9"'
                    style={styles.input}
                  />
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
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
              Weekly Specials show on the chosen weekday (and overnight tails show after midnight).
            </div>
          </div>
        )}
      </div>

      {/* MAP */}
      <div ref={mapContainerRef} className="cb-map" style={styles.map} />

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
          groupedTopFeed.map((g) => <GroupedCard key={g.key} group={g} />)
        )}
      </div>

      <div style={styles.footer}>
        Closest deals show first (within your chosen distance).
      </div>
    </div>
  );
}

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
    padding: 14,
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.045))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    marginBottom: 12,
  },
  headerTopRow: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleWrap: {
    minWidth: 0,
    flex: "1 1 auto",
    overflow: "hidden",
  },
  title: {
    fontSize: 42,
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
  subtitle: { marginTop: 6, opacity: 0.92, fontSize: 14 },

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

  togglePill: {
    display: "flex",
    alignItems: "center",
    padding: "9px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.10)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 13,
    fontWeight: 650,
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
  cardMeta: {
    marginTop: 12,
    fontSize: 12,
    opacity: 0.85,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
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
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
};
