import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/** =========================
 *  SUPABASE (browser-safe publishable key)
 *  ========================= */
const SUPABASE_URL = "https://jpphthbbawkxbhzonvyz.supabase.co";
const SUPABASE_ANON_KEY =
  "sb_publishable_b6cy5vUSAFkVxWkRyYJSUw_FagY1_5D";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SUPPORT_EMAIL = "chalkboards.app@gmail.com";

type AnyRow = Record<string, any>;

type SpecialKind = "WEEKLY" | "FLASH";

type NormalizedSpecial = {
  id: string;
  kind: SpecialKind;

  // restaurant
  businessName: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;

  // location
  lat?: number;
  lng?: number;

  // special
  title: string; // display text
  dayLabel?: string; // e.g. Monday
  startTime?: string; // "16:00" or ISO
  endTime?: string;
  price?: number | null;

  // raw for debugging if needed
  _raw?: AnyRow;
};

type RestaurantGroup = {
  key: string;
  businessName: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  specials: NormalizedSpecial[];
};

type RadiusOption =
  | { label: "10 mi"; miles: 10 }
  | { label: "25 mi"; miles: 25 }
  | { label: "50 mi"; miles: 50 }
  | { label: "Anywhere"; miles: null };

const RADIUS_OPTIONS: RadiusOption[] = [
  { label: "10 mi", miles: 10 },
  { label: "25 mi", miles: 25 },
  { label: "50 mi", miles: 50 },
  { label: "Anywhere", miles: null },
];

function safeStr(v: any): string {
  return (v ?? "").toString().trim();
}

function pickFirst(row: AnyRow, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = safeStr(row[k]);
    if (v) return v;
  }
  return fallback;
}

function pickFirstNum(row: AnyRow, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function parsePriceFromText(text: string): number | null {
  // looks for $9, $9.99, $.69
  const m = text.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function normalizeTime(v: any): string | undefined {
  if (!v) return undefined;

  // "16:00:00" or "16:00"
  if (typeof v === "string") {
    const s = v.trim();
    // ISO -> try extract time
    const iso = s.match(/T(\d{2}:\d{2})/);
    if (iso?.[1]) return iso[1];

    const hm = s.match(/^(\d{2}):(\d{2})/);
    if (hm) return `${hm[1]}:${hm[2]}`;
  }

  return undefined;
}

function formatTime(hhmm?: string): string {
  if (!hhmm) return "";
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeRow(kind: SpecialKind, row: AnyRow): NormalizedSpecial {
  const businessName = pickFirst(row, [
    "businessName",
    "business_name",
    "restaurant_name",
    "name",
  ]);

  const street = pickFirst(row, ["street", "address", "street_address"]);
  const city = pickFirst(row, ["city", "town"]);
  const state = pickFirst(row, ["state", "st"]);
  const zip = pickFirst(row, ["zip", "postal_code"]);

  const title =
    pickFirst(row, [
      "title",
      "deal_title",
      "special_title",
      "item",
      "deal",
      "description",
      "special",
      "text",
    ]) || "Special";

  const dayLabel = pickFirst(row, ["day", "weekday", "day_of_week", "dow"]);

  const startTime = normalizeTime(
    pickFirst(row, ["start_time", "time_start", "start", "starts_at"])
  );
  const endTime = normalizeTime(
    pickFirst(row, ["end_time", "time_end", "end", "ends_at"])
  );

  const lat = pickFirstNum(row, ["lat", "latitude"]);
  const lng = pickFirstNum(row, ["lng", "lon", "longitude"]);

  // price priority: explicit column -> parse from title
  const explicitPrice = (() => {
    const p = pickFirstNum(row, ["price", "deal_price", "amount"]);
    return typeof p === "number" ? p : undefined;
  })();

  const price =
    typeof explicitPrice === "number"
      ? explicitPrice
      : parsePriceFromText(title);

  const id =
    safeStr(row.id) ||
    safeStr(row.special_id) ||
    safeStr(row.uuid) ||
    `${kind}:${businessName}:${title}:${dayLabel}:${startTime}:${endTime}`;

  return {
    id,
    kind,
    businessName: businessName || "Unknown",
    street,
    city,
    state,
    zip,
    lat,
    lng,
    title,
    dayLabel: dayLabel || undefined,
    startTime,
    endTime,
    price,
    _raw: row,
  };
}

async function tryFetch(tableNames: string[], select = "*"): Promise<AnyRow[]> {
  let lastErr: any = null;
  for (const t of tableNames) {
    const { data, error } = await supabase.from(t).select(select);
    if (!error && Array.isArray(data)) return data as AnyRow[];
    lastErr = error;
  }
  if (lastErr) throw lastErr;
  return [];
}

function makeRestaurantKey(s: NormalizedSpecial): string {
  // key by business + address (handles chains at different locations)
  const b = s.businessName.toLowerCase();
  const a = `${safeStr(s.street).toLowerCase()}|${safeStr(s.city).toLowerCase()}|${safeStr(s.state).toLowerCase()}|${safeStr(s.zip).toLowerCase()}`;
  return `${b}::${a}`;
}

function openInMaps(group: RestaurantGroup) {
  const addr = [group.street, group.city, group.state, group.zip]
    .filter(Boolean)
    .join(", ");
  const q = encodeURIComponent(addr || group.businessName);
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [weekly, setWeekly] = useState<NormalizedSpecial[]>([]);
  const [flash, setFlash] = useState<NormalizedSpecial[]>([]);

  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState<RadiusOption>(RADIUS_OPTIONS[0]);
  const [mapOn, setMapOn] = useState(false); // safe mode default OFF
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(
    null
  );

  const [visibleCount, setVisibleCount] = useState(10);

  async function loadAll() {
    setLoading(true);
    setErrorMsg(null);

    try {
      // Try common table/view names. Keep as many as you want here.
      const weeklyRows = await tryFetch(
        ["approved_weekly_specials", "weekly_specials_approved", "approved_specials"],
        "*"
      );

      const flashRows = await tryFetch(
        ["approved_flash_specials", "flash_specials_approved", "approved_flash"],
        "*"
      ).catch(() => []); // flash might not exist yet; that's ok

      const weeklyNorm = weeklyRows.map((r) => normalizeRow("WEEKLY", r));
      const flashNorm = flashRows.map((r) => normalizeRow("FLASH", r));

      setWeekly(weeklyNorm);
      setFlash(flashNorm);
      setVisibleCount(10);
    } catch (e: any) {
      setErrorMsg(
        `Couldn’t load specials from Supabase. ${safeStr(e?.message) || ""}`.trim()
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // location only needed for radius filtering
    if (radius.miles === null) return;

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setUserLoc(null);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [radius.miles]);

  const allSpecials = useMemo(() => {
    // merge weekly + flash (you can later de-dupe by id)
    return [...flash, ...weekly];
  }, [flash, weekly]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();

    // 1) filter by query text (restaurant name OR special title OR city)
    let filtered = allSpecials.filter((s) => {
      if (!q) return true;
      const hay = [
        s.businessName,
        s.title,
        s.street,
        s.city,
        s.state,
        s.zip,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    // 2) radius filter (skip if Anywhere OR missing lat/lng OR missing userLoc)
    if (radius.miles !== null && userLoc) {
      filtered = filtered.filter((s) => {
        if (typeof s.lat !== "number" || typeof s.lng !== "number") return true;
        const d = haversineMiles(userLoc.lat, userLoc.lng, s.lat, s.lng);
        return d <= radius.miles!;
      });
    }

    // 3) group by restaurant+address
    const map = new Map<string, RestaurantGroup>();
    for (const s of filtered) {
      const key = makeRestaurantKey(s);
      if (!map.has(key)) {
        map.set(key, {
          key,
          businessName: s.businessName,
          street: s.street,
          city: s.city,
          state: s.state,
          zip: s.zip,
          lat: s.lat,
          lng: s.lng,
          specials: [],
        });
      }
      map.get(key)!.specials.push(s);
    }

    // 4) sort specials inside each restaurant by cheapest first, then title
    for (const g of map.values()) {
      g.specials.sort((a, b) => {
        const ap = typeof a.price === "number" ? a.price : Number.POSITIVE_INFINITY;
        const bp = typeof b.price === "number" ? b.price : Number.POSITIVE_INFINITY;
        if (ap !== bp) return ap - bp;
        return a.title.localeCompare(b.title);
      });
    }

    let groups = Array.from(map.values());

    // 5) sort restaurants: if radius filtering is active and we have location, nearest first.
    if (radius.miles !== null && userLoc) {
      groups.sort((a, b) => {
        const ad =
          typeof a.lat === "number" && typeof a.lng === "number"
            ? haversineMiles(userLoc.lat, userLoc.lng, a.lat, a.lng)
            : Number.POSITIVE_INFINITY;
        const bd =
          typeof b.lat === "number" && typeof b.lng === "number"
            ? haversineMiles(userLoc.lat, userLoc.lng, b.lat, b.lng)
            : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return a.businessName.localeCompare(b.businessName);
      });
    } else {
      groups.sort((a, b) => a.businessName.localeCompare(b.businessName));
    }

    return groups;
  }, [allSpecials, query, radius.miles, userLoc]);

  const visibleGroups = useMemo(() => grouped.slice(0, visibleCount), [grouped, visibleCount]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Chalkboards</h1>
          <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300">
            LIVE
          </span>
        </div>

        {/* Search */}
        <div className="mt-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search specials..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm outline-none focus:border-emerald-500/50"
          />
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={loadAll}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm hover:border-zinc-700"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          <button
            onClick={() => setMapOn((v) => !v)}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm hover:border-zinc-700"
            title="Map stays OFF by default to keep builds safe"
          >
            Map: {mapOn ? "ON" : "OFF"}
          </button>

          <select
            value={radius.label}
            onChange={(e) => {
              const next = RADIUS_OPTIONS.find((r) => r.label === e.target.value);
              setRadius(next || RADIUS_OPTIONS[0]);
            }}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm outline-none hover:border-zinc-700"
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label}
              </option>
            ))}
          </select>

          <div className="text-sm text-zinc-400">
            Featured {visibleGroups.length} • Showing {visibleGroups.length} / {grouped.length}
          </div>
        </div>

        {/* Map Safe Mode Notice */}
        {!mapOn && (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-300">
            Map is OFF (safe build mode). Turn it on whenever you want.
          </div>
        )}

        {/* Errors */}
        {errorMsg && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMsg}
          </div>
        )}

        {/* Cards */}
        <div className="mt-5 space-y-4">
          {visibleGroups.map((g) => {
            const addr = [g.street, g.city, g.state, g.zip].filter(Boolean).join(", ");

            return (
              <div
                key={g.key}
                className="rounded-2xl border border-emerald-500/30 bg-zinc-900/40 p-4 shadow-lg shadow-black/20"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">{g.businessName}</h2>
                        <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200">
                          TOP 5 NEAR YOU
                        </span>
                      </div>
                      {addr ? (
                        <div className="text-sm text-zinc-400">{addr}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {g.specials.map((s) => {
                      const day = s.dayLabel ? `• ${s.dayLabel}` : "";
                      const start = s.startTime ? formatTime(s.startTime) : "";
                      const end = s.endTime ? formatTime(s.endTime) : "";
                      const time =
                        start && end ? `${start}–${end}` : start ? start : end ? end : "All day";

                      return (
                        <div
                          key={s.id}
                          className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3"
                        >
                          <div className="text-xs font-semibold text-zinc-400">
                            🗓️ {s.kind}
                            {day ? ` ${day}` : ""}
                          </div>
                          <div className="mt-1 text-base font-semibold">
                            {s.title || "Special"}
                          </div>
                          <div className="mt-1 text-sm text-zinc-400">{time}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => openInMaps(g)}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm hover:border-zinc-700"
                    >
                      Open in Maps
                    </button>

                    <button
                      onClick={() =>
                        alert(
                          "Report flow placeholder. Next step: save report to Supabase and email support."
                        )
                      }
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm hover:border-zinc-700"
                    >
                      Report issue
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {grouped.length === 0 && !loading && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-6 text-sm text-zinc-300">
              No specials found.
            </div>
          )}

          {/* Load more */}
          {visibleCount < grouped.length && (
            <button
              onClick={() => setVisibleCount((n) => n + 10)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm hover:border-zinc-700"
            >
              Load more (next 10)
            </button>
          )}
        </div>

        <div className="mt-6 text-xs text-zinc-500">
          Support: {SUPPORT_EMAIL}
        </div>
      </div>
    </div>
  );
}