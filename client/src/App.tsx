import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/** =========================
 *  SUPABASE
 *  ========================= */
const SUPABASE_URL = "https://jpphthbbawkxbhzonvyz.supabase.co";
const SUPABASE_ANON_KEY =
  "sb_publishable_b6cy5vUSAFkVxWkRyYJSUw_FagY1_5D";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** =========================
 *  SUPPORT
 *  ========================= */
const SUPPORT_EMAIL = "chalkboards.app@gmail.com";

/** =========================
 *  TYPES
 *  ========================= */
type SpecialRow = {
  id: string;
  businessName?: string | null;
  business_name?: string | null;

  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;

  title?: string | null;
  description?: string | null;

  // weekly fields
  weekday?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  start_time?: string | null;
  end_time?: string | null;

  // type fields
  specialType?: string | null; // "WEEKLY" / "FLASH"
  special_type?: string | null;

  // optional geo/distance
  lat?: number | null;
  lng?: number | null;
};

type NormalizedSpecial = {
  id: string;
  businessName: string;
  street: string;
  city: string;
  state: string;
  zip: string;

  type: "WEEKLY" | "FLASH";
  weekday?: string; // for weekly
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  title: string;

  // optional distance (computed later)
  distanceMiles?: number | null;
};

type RestaurantGroup = {
  key: string;
  businessName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  distanceMiles?: number | null;
  specials: NormalizedSpecial[];
};

/** =========================
 *  HELPERS
 *  ========================= */
function pick<T>(...vals: Array<T | null | undefined>): T | undefined {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return undefined;
}

function asHHMM(v?: string | null): string {
  if (!v) return "";
  // Accept "HH:MM", "HH:MM:SS", or "7:00 PM" (best effort)
  const t = v.trim();
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t.slice(0, 5);

  // try Date parse (for AM/PM strings)
  const d = new Date(`1970-01-01 ${t}`);
  if (!Number.isNaN(d.getTime())) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  return t;
}

function hhmmToDisplay(hhmm: string): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return hhmm || "";
  const [hhS, mmS] = hhmm.split(":");
  const hh = Number(hhS);
  const mm = Number(mmS);
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

function formatWindow(start: string, end: string): string {
  const a = hhmmToDisplay(start);
  const b = hhmmToDisplay(end);
  if (!a && !b) return "";
  if (a && !b) return a;
  if (!a && b) return b;
  return `${a}–${b}`;
}

function normText(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function restaurantKey(businessName: string, street: string, zip: string) {
  return `${normText(businessName).toLowerCase()}|${normText(street).toLowerCase()}|${(zip || "").trim()}`;
}

function specialDedupeKey(x: NormalizedSpecial) {
  return [
    x.businessName.toLowerCase(),
    x.street.toLowerCase(),
    x.zip,
    x.type,
    (x.weekday || "").toLowerCase(),
    x.start,
    x.end,
    x.title.toLowerCase(),
  ].join("|");
}

/** =========================
 *  DEFAULT EXPORT (IMPORTANT)
 *  ========================= */
export default function App() {
  const [query, setQuery] = useState("");
  const [radiusLabel, setRadiusLabel] = useState<"10 mi" | "Anywhere">("10 mi");
  const [mapOn, setMapOn] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<NormalizedSpecial[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      /**
       * We try multiple table/view names so this stays "safe build"
       * even if you renamed your table.
       */
      const attempts = ["approved_specials", "public_specials", "specials"];
      let data: SpecialRow[] | null = null;
      let lastErr: any = null;

      for (const table of attempts) {
        // eslint-disable-next-line no-await-in-loop
        const res = await supabase
          .from(table)
          .select("*")
          .limit(2000);

        if (res.error) {
          lastErr = res.error;
          continue;
        }
        data = (res.data || []) as SpecialRow[];
        lastErr = null;
        break;
      }

      if (!data) {
        throw lastErr || new Error("No data returned from Supabase.");
      }

      const normalized: NormalizedSpecial[] = data.map((r) => {
        const businessName =
          pick(r.businessName, r.business_name, "Unknown") || "Unknown";
        const street = pick(r.street, "") || "";
        const city = pick(r.city, "") || "";
        const state = pick(r.state, "") || "";
        const zip = pick(r.zip, "") || "";

        const typeRaw = (pick(r.specialType, r.special_type, "WEEKLY") || "WEEKLY")
          .toString()
          .toUpperCase();

        const type: "WEEKLY" | "FLASH" = typeRaw === "FLASH" ? "FLASH" : "WEEKLY";

        const weekday = pick(r.weekday, "") || "";
        const start = asHHMM(pick(r.startTime, r.start_time, "00:00"));
        const end = asHHMM(pick(r.endTime, r.end_time, "23:59"));

        const title =
          pick(r.title, r.description, "")?.toString().trim() || "Special";

        return {
          id: r.id,
          businessName,
          street,
          city,
          state,
          zip,
          type,
          weekday: type === "WEEKLY" ? weekday : undefined,
          start,
          end,
          title,
          distanceMiles: null,
        };
      });

      // Dedupe hard (this will remove accidental doubles)
      const seen = new Set<string>();
      const deduped: NormalizedSpecial[] = [];
      for (const s of normalized) {
        const k = specialDedupeKey(s);
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(s);
      }

      setRaw(deduped);
      setVisibleCount(10);
    } catch (e: any) {
      setError(e?.message || "Failed to load specials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups: RestaurantGroup[] = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = raw.filter((s) => {
      if (!q) return true;
      return (
        s.businessName.toLowerCase().includes(q) ||
        s.street.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q)
      );
    });

    // Group by restaurant (name + street + zip)
    const map = new Map<string, RestaurantGroup>();
    for (const s of filtered) {
      const key = restaurantKey(s.businessName, s.street, s.zip);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          businessName: s.businessName,
          street: s.street,
          city: s.city,
          state: s.state,
          zip: s.zip,
          distanceMiles: s.distanceMiles ?? null,
          specials: [s],
        });
      } else {
        existing.specials.push(s);
      }
    }

    const out = Array.from(map.values());

    // Sort specials inside each restaurant: weekly first, then weekday, then start time
    const weekdayOrder: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    for (const g of out) {
      g.specials.sort((a, b) => {
        if (a.type !== b.type) return a.type === "FLASH" ? 1 : -1;
        const wa = (a.weekday || "").toLowerCase();
        const wb = (b.weekday || "").toLowerCase();
        const oa = weekdayOrder[wa] ?? 99;
        const ob = weekdayOrder[wb] ?? 99;
        if (oa !== ob) return oa - ob;
        if (a.start !== b.start) return a.start.localeCompare(b.start);
        return a.title.localeCompare(b.title);
      });
    }

    // Sort restaurants: if you later compute distance, this will work
    out.sort((a, b) => {
      const da = a.distanceMiles ?? null;
      const db = b.distanceMiles ?? null;
      if (da !== null && db !== null && da !== db) return da - db;
      return a.businessName.localeCompare(b.businessName);
    });

    return out;
  }, [raw, query]);

  const total = groups.length;
  const visibleGroups = groups.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-[#0b0f14] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold tracking-tight">Chalkboards</div>
          <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-300">
            LIVE
          </span>
        </div>

        {/* Search */}
        <div className="mt-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search specials..."
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-white/20"
          />
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={load}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          <button
            onClick={() => setMapOn((v) => !v)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            title="Safe build: map is disabled in code for now"
          >
            Map: {mapOn ? "ON" : "OFF"}
          </button>

          <select
            value={radiusLabel}
            onChange={(e) => setRadiusLabel(e.target.value as any)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none hover:bg-white/10"
          >
            <option value="10 mi">10 mi</option>
            <option value="Anywhere">Anywhere</option>
          </select>

          <div className="text-sm text-white/70">
            Featured {Math.min(visibleGroups.length, 5)} • Showing{" "}
            {Math.min(visibleGroups.length, total)} / {total || 0}
          </div>
        </div>

        {/* Safe build banner */}
        <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-white/70">
          Map is OFF (safe build mode). Turn it on whenever you want.
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
            <div className="mt-2 text-red-200/80">
              If you renamed your table/view, update the attempts list in App.tsx
              (approved_specials / public_specials / specials).
            </div>
          </div>
        )}

        {/* List */}
        <div className="mt-6 space-y-6">
          {visibleGroups.map((g, idx) => (
            <div
              key={g.key}
              className="rounded-2xl border border-green-500/35 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(34,197,94,0.25)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-semibold">{g.businessName}</div>
                    {idx < 5 && (
                      <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-200">
                        TOP 5 NEAR YOU
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    {g.street}
                    {g.city || g.state || g.zip ? ", " : ""}
                    {[g.city, g.state, g.zip].filter(Boolean).join(" ")}
                  </div>
                </div>

                <div className="text-sm text-white/60">
                  {g.distanceMiles != null ? `${g.distanceMiles.toFixed(1)} mi` : ""}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {g.specials.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                  >
                    <div className="text-xs font-semibold tracking-wide text-white/70">
                      🗓️ {s.type}
                      {s.type === "WEEKLY" && s.weekday ? ` • ${s.weekday}` : ""}
                    </div>
                    <div className="mt-1 text-base font-semibold">
                      {s.title}
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      {formatWindow(s.start, s.end)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">
                  Open in Maps
                </button>
                <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">
                  Report issue
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Load more */}
        {visibleCount < total && (
          <div className="mt-6">
            <button
              onClick={() => setVisibleCount((n) => n + 10)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
            >
              Load more (next 10)
            </button>
          </div>
        )}

        <div className="mt-8 text-sm text-white/60">
          Support: {SUPPORT_EMAIL}
        </div>
      </div>
    </div>
  );
}