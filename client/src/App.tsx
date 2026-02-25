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
const LIVE_GREEN = "#22c55e";

type DbRow = {
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

type SpecialKind = "flash" | "weekly";

type Special = {
  id: string;
  kind: SpecialKind;
  businessName: string;
  address: string;
  deal: string;
  lat: number;
  lng: number;
  // weekly meta
  day?: string;
  start?: string;
  end?: string;
  // flash meta
  expiresAt?: number;
};

type RestaurantCard = {
  key: string;
  businessName: string;
  address: string;
  lat: number;
  lng: number;
  distance: number;
  specials: Array<{
    kind: SpecialKind;
    label: string;
    deal: string;
    sub: string;
  }>;
};

function normLower(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

function isApprovedStatus(status: any): boolean {
  if (status == null) return true;
  const s = normLower(status);
  return s === "approved" || s === "live" || s === "published";
}

function isFlashType(t: any) {
  const s = normLower(t);
  return s === "flash" || s === "flash_special" || s === "f";
}

function isWeeklyType(t: any) {
  const s = normLower(t);
  return s === "weekly" || s === "weekly_special" || s === "w";
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
    .replace(/\s+/g, " ")
    .trim();
}

function toMinutes(hhmm: string): number {
  const parts = String(hhmm || "").split(":");
  if (parts.length !== 2) return 0;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
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

function prettyWindow(start?: string, end?: string) {
  const s = String(start || "").trim();
  const e = String(end || "").trim();
  if (!s || !e) return "";
  const allDay =
    (s === "00:00" && (e === "23:59" || e === "24:00" || e === "00:00")) ||
    (s === "00:00" && e === "00:00");
  if (allDay) return "All day";
  return formatHHMMTo12(s) + "–" + formatHHMMTo12(e);
}

function minutesFromNow(ms: number): number {
  return Math.max(0, Math.ceil(ms / 60000));
}

function getDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
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

function mapsUrl(address: string) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
}

function makeReportMailto(businessName: string, address: string) {
  const subject = "Chalkboards Report Issue — " + businessName;
  const body = [
    "Report issue:",
    "",
    "Business: " + businessName,
    "Address: " + address,
    "",
    "What’s wrong?",
    "",
  ].join("\n");

  return (
    "mailto:" +
    SUPPORT_EMAIL +
    "?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(body)
  );
}

function safeParseWeekly(extra: any): { day: string; start: string; end: string } | null {
  if (!extra) return null;
  if (typeof extra === "object") {
    const day = String(extra.day ?? "").trim();
    const start = String(extra.start ?? "").trim();
    const end = String(extra.end ?? "").trim();
    if (!day || !start || !end) return null;
    return { day, start, end };
  }
  if (typeof extra === "string") {
    try {
      const obj = JSON.parse(extra);
      return safeParseWeekly(obj);
    } catch {
      return null;
    }
  }
  return null;
}

function rowsToSpecials(rows: DbRow[]): Special[] {
  const out: Special[] = [];

  for (const r of rows) {
    if (!isApprovedStatus(r.status)) continue;
    if (!r.business_name || !r.deal || !r.address) continue;
    if (r.lat == null || r.lng == null) continue;

    if (isFlashType(r.type)) {
      if (!r.expires_at) continue;
      const expiresAt = new Date(r.expires_at).getTime();
      if (!Number.isFinite(expiresAt)) continue;
      if (Date.now() > expiresAt) continue;

      out.push({
        id: r.id,
        kind: "flash",
        businessName: r.business_name,
        address: r.address,
        deal: r.deal,
        lat: r.lat,
        lng: r.lng,
        expiresAt,
      });
      continue;
    }

    if (isWeeklyType(r.type)) {
      const meta = safeParseWeekly(r.extra);
      if (!meta) continue;

      out.push({
        id: r.id,
        kind: "weekly",
        businessName: r.business_name,
        address: r.address,
        deal: r.deal,
        lat: r.lat,
        lng: r.lng,
        day: meta.day,
        start: meta.start,
        end: meta.end,
      });
      continue;
    }
  }

  return out;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** =========================
 *  APP
 *  ========================= */
export default function App() {
  const PAGE_SIZE = 10;

  const mapRef = useRef<L.Map | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const [showMap, setShowMap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [search, setSearch] = useState("");
  const [radius, setRadius] = useState(10);

  // pagination is for "beyond top 5"
  const [page, setPage] = useState(1);

  const [user, setUser] = useState({ lat: 40.88, lng: -74.07 });
  const [specials, setSpecials] = useState<Special[]>([]);

  // user location
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUser({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);

  // load supabase
  useEffect(() => {
    let cancel = false;

    async function load() {
      setLoading(true);
      setErrorText("");

      const { data, error } = await supabase
        .from("specials")
        .select("id, created_at, type, business_name, deal, address, expires_at, status, extra, lat, lng")
        .order("created_at", { ascending: false })
        .limit(1200);

      if (cancel) return;

      if (error) {
        setErrorText(error.message || "Supabase error");
        setSpecials([]);
        setLoading(false);
        return;
      }

      setSpecials(rowsToSpecials((data ?? []) as DbRow[]));
      setLoading(false);
    }

    load();
    const t = setInterval(load, 30000);
    return () => {
      cancel = true;
      clearInterval(t);
    };
  }, []);

  // reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [search, radius, user.lat, user.lng]);

  // Build restaurant cards (ALL specials per address)
  const cards = useMemo((): RestaurantCard[] => {
    const q = search.trim().toLowerCase();
    const nowM = nowMinutes();
    const map = new Map<string, RestaurantCard>();

    for (const s of specials) {
      const dist = getDistanceMiles(user.lat, user.lng, s.lat, s.lng);
      if (dist > radius) continue;

      const blob = (s.businessName + " " + s.address + " " + s.deal).toLowerCase();
      if (q && !blob.includes(q)) continue;

      const key = normalizeAddress(s.address);

      if (!map.has(key)) {
        map.set(key, {
          key,
          businessName: s.businessName,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          distance: dist,
          specials: [],
        });
      } else {
        const g = map.get(key)!;
        if (dist < g.distance) g.distance = dist;
      }

      const g = map.get(key)!;

      if (s.kind === "flash") {
        const mins = minutesFromNow((s.expiresAt || Date.now()) - Date.now());
        g.specials.push({
          kind: "flash",
          label: "⚡ FLASH",
          deal: s.deal,
          sub: "expires in " + mins + " min",
        });
      } else {
        // weekly
        const startM = toMinutes(s.start || "00:00");
        const endMraw = toMinutes(s.end || "00:00");
        const crosses = endMraw <= startM;
        const endM = crosses ? endMraw + 24 * 60 : endMraw;

        // note: we DO NOT hide weekly specials — we show them all.
        // We only add an ACTIVE tag for readability.
        const active = (() => {
          const cur = nowM;
          if (!s.start || !s.end) return false;
          if (!crosses) return cur >= startM && cur <= endM;
          // overnight: treat as active if after start OR before end
          return cur >= startM || cur <= endMraw;
        })();

        g.specials.push({
          kind: "weekly",
          label: "🗓️ WEEKLY • " + String(s.day || "").trim(),
          deal: s.deal,
          sub: (s.start && s.end ? prettyWindow(s.start, s.end) : "") + (active ? " • ACTIVE" : ""),
        });
      }
    }

    const list = Array.from(map.values());

    // Sort restaurants by distance = true discovery
    list.sort((a, b) => a.distance - b.distance);

    // Sort specials within a restaurant (flash first, then weekly by day/time)
    const dayRank: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };

    list.forEach((c) => {
      c.specials.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "flash" ? -1 : 1;

        const aIsWeekly = a.kind === "weekly";
        const bIsWeekly = b.kind === "weekly";

        if (aIsWeekly && bIsWeekly) {
          const aDay = a.label.replace("🗓️ WEEKLY • ", "");
          const bDay = b.label.replace("🗓️ WEEKLY • ", "");
          const ra = dayRank[aDay] ?? 99;
          const rb = dayRank[bDay] ?? 99;
          if (ra !== rb) return ra - rb;
        }

        return a.deal.localeCompare(b.deal);
      });
    });

    return list;
  }, [specials, user.lat, user.lng, radius, search]);

  // Top 5 gets featured outline and always shown
  const top5 = useMemo(() => cards.slice(0, 5), [cards]);
  const rest = useMemo(() => cards.slice(5), [cards]);

  // Pagination applies ONLY to the rest list
  const visibleRest = useMemo(() => rest.slice(0, page * PAGE_SIZE), [rest, page]);

  const hasMore = visibleRest.length < rest.length;

  // Map init (only when ON)
  useEffect(() => {
    if (!showMap) return;
    if (!mapElRef.current) return;
    if (mapRef.current) return;

    mapRef.current = L.map(mapElRef.current).setView([user.lat, user.lng], 12);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [showMap, user.lat, user.lng]);

  // Important: when map turns ON, Leaflet needs a resize kick
  useEffect(() => {
    if (!showMap) return;
    const t = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        mapRef.current.setView([user.lat, user.lng], 12);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [showMap, user.lat, user.lng]);

  // Map markers reflect top 5 + visible rest (the cards the user can see)
  useEffect(() => {
    if (!showMap) return;
    if (!mapRef.current) return;

    const visible = [...top5, ...visibleRest];

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    mapRef.current.setView([user.lat, user.lng], 12);

    const userMarker = L.marker([user.lat, user.lng]).addTo(mapRef.current);
    markersRef.current.push(userMarker);

    visible.forEach((c) => {
      const html =
        "<b>" +
        c.businessName +
        "</b><br/>" +
        c.address +
        "<br/><br/>" +
        c.specials
          .slice(0, 10)
          .map((s) => s.label + "<br/>" + s.deal + "<br/><i>" + s.sub + "</i>")
          .join("<br/><br/>") +
        '<br/><br/><a href="' +
        mapsUrl(c.address) +
        '" target="_blank" rel="noopener noreferrer">Open in Maps</a>';

      const m = L.marker([c.lat, c.lng]).addTo(mapRef.current!).bindPopup(html);
      markersRef.current.push(m);
    });
  }, [showMap, top5, visibleRest, user.lat, user.lng]);

  const totalShown = top5.length + visibleRest.length;
  const totalCards = cards.length;

  const Card = ({ c, featured }: { c: RestaurantCard; featured: boolean }) => {
    const distText = c.distance >= 999999 ? "" : c.distance.toFixed(1) + " mi";

    return (
      <div style={featured ? styles.cardFeatured : styles.card}>
        <div style={styles.cardTop}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.cardTitleRow}>
              <div style={styles.cardTitle}>{c.businessName}</div>
              {featured ? <div style={styles.top5Pill}>TOP 5 NEAR YOU</div> : null}
            </div>
            <div style={styles.addr}>{c.address}</div>
          </div>
          <div style={styles.dist}>{distText}</div>
        </div>

        <div style={styles.specials}>
          {c.specials.map((s, idx) => (
            <div key={c.key + "-" + idx} style={styles.specialRow}>
              <div style={styles.specialLabel}>{s.label}</div>
              <div style={styles.specialDeal}>{s.deal}</div>
              <div style={styles.specialSub}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={styles.links}>
          <a href={mapsUrl(c.address)} target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>
            Open in Maps
          </a>
          <a href={makeReportMailto(c.businessName, c.address)} style={styles.linkGhost}>
            Report issue
          </a>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.brandRow}>
          <div style={styles.brand}>Chalkboards</div>
          <div style={styles.livePill}>LIVE</div>
        </div>

        <div style={styles.controls}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search specials..."
            style={styles.search}
          />

          <div style={styles.row}>
            <button onClick={() => setPage(1)} style={styles.btn}>
              Refresh
            </button>

            <button
              onClick={() => setShowMap((v) => !v)}
              style={showMap ? styles.btnGreen : styles.btn}
              title="Toggle map"
            >
              {showMap ? "Map: ON" : "Map: OFF"}
            </button>

            <select value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10))} style={styles.select}>
              <option value={5}>5 mi</option>
              <option value={10}>10 mi</option>
              <option value={20}>20 mi</option>
              <option value={50}>50 mi</option>
              <option value={999}>Anywhere</option>
            </select>

            <div style={styles.countPill}>
              Showing <b>{totalShown}</b> / {totalCards}
            </div>
          </div>

          {errorText ? <div style={styles.error}>{errorText}</div> : null}
          {loading ? <div style={styles.subtle}>Loading…</div> : null}
        </div>
      </div>

      {showMap ? (
        <div style={styles.mapWrap}>
          <div ref={mapElRef} style={styles.map} />
        </div>
      ) : (
        <div style={styles.safeNote}>
          Map is OFF (safe build mode). Turn it on whenever you want.
        </div>
      )}

      <div style={styles.list}>
        {/* TOP 5 */}
        <div style={styles.sectionHeader}>
          <div style={styles.sectionTitle}>Top 5 Near You</div>
          <div style={styles.sectionSub}>Featured purely by distance (for now).</div>
        </div>

        {top5.length === 0 && !loading ? <div style={styles.empty}>No specials found in this radius.</div> : null}
        {top5.map((c) => (
          <Card key={c.key} c={c} featured={true} />
        ))}

        {/* REST (PAGINATED 10 AT A TIME) */}
        {rest.length > 0 ? (
          <>
            <div style={{ height: 6 }} />
            <div style={styles.sectionHeader}>
              <div style={styles.sectionTitle}>More Nearby</div>
              <div style={styles.sectionSub}>
                Still sorted by distance • Load 10 more at a time
              </div>
            </div>

            {visibleRest.map((c) => (
              <Card key={c.key} c={c} featured={false} />
            ))}

            {hasMore ? (
              <button onClick={() => setPage((p) => p + 1)} style={styles.moreBtn}>
                Load more (next {PAGE_SIZE})
              </button>
            ) : (
              <div style={styles.endCap}>That’s everything in range.</div>
            )}
          </>
        ) : null}

        <div style={styles.footer}>Support: {SUPPORT_EMAIL}</div>
      </div>
    </div>
  );
}

/** =========================
 *  STYLES
 *  ========================= */
const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily:
      'Inter, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif',
    background: "#0b0f14",
    color: "#e8eef6",
    minHeight: "100vh",
  },
  header: {
    padding: 16,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    position: "sticky",
    top: 0,
    background: "rgba(11,15,20,0.92)",
    backdropFilter: "blur(8px)",
    zIndex: 10,
  },
  brandRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  brand: { fontWeight: 900, fontSize: 22, letterSpacing: 0.2 },
  livePill: {
    fontSize: 12,
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: 999,
    background: LIVE_GREEN,
    color: "#0b0f14",
  },
  controls: { display: "grid", gap: 10 },
  row: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  search: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#e8eef6",
    outline: "none",
  },
  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#e8eef6",
    cursor: "pointer",
    fontWeight: 800,
  },
  btnGreen: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(34,197,94,0.55)",
    background: "rgba(34,197,94,0.18)",
    color: "#e8eef6",
    cursor: "pointer",
    fontWeight: 900,
  },
  select: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#e8eef6",
    cursor: "pointer",
    fontWeight: 800,
  },
  countPill: {
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    fontSize: 12,
    opacity: 0.95,
  },
  error: {
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.12)",
    color: "#fecaca",
    fontWeight: 800,
  },
  subtle: { fontSize: 12, opacity: 0.8 },
  mapWrap: { padding: 16, paddingTop: 12 },
  map: {
    height: 320,
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  safeNote: {
    margin: 16,
    padding: 12,
    borderRadius: 14,
    border: "1px dashed rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.04)",
    opacity: 0.9,
  },
  list: { padding: 16, display: "grid", gap: 12 },
  sectionHeader: {
    display: "grid",
    gap: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: 900, letterSpacing: 0.2 },
  sectionSub: { fontSize: 12, opacity: 0.78 },

  card: {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
  },
  cardFeatured: {
    padding: 14,
    borderRadius: 16,
    border: "2px solid rgba(34,197,94,0.65)",
    background: "rgba(255,255,255,0.04)",
    boxShadow: "0 0 0 2px rgba(34,197,94,0.10) inset",
  },
  cardTop: { display: "flex", justifyContent: "space-between", gap: 12 },
  cardTitleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  cardTitle: { fontSize: 16, fontWeight: 900 },
  top5Pill: {
    fontSize: 11,
    fontWeight: 950,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(34,197,94,0.55)",
    background: "rgba(34,197,94,0.14)",
  },
  addr: { fontSize: 13, opacity: 0.9, marginTop: 4 },
  dist: { fontSize: 12, opacity: 0.9, whiteSpace: "nowrap", marginTop: 2 },

  specials: { marginTop: 12, display: "grid", gap: 10 },
  specialRow: {
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
  },
  specialLabel: { fontSize: 12, fontWeight: 900, opacity: 0.95 },
  specialDeal: { fontSize: 14, fontWeight: 800, marginTop: 4 },
  specialSub: { fontSize: 12, opacity: 0.85, marginTop: 4 },

  links: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 },
  linkBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#e8eef6",
    textDecoration: "none",
    fontWeight: 900,
  },
  linkGhost: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "transparent",
    color: "#e8eef6",
    textDecoration: "none",
    fontWeight: 900,
    opacity: 0.9,
  },

  moreBtn: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#e8eef6",
    cursor: "pointer",
    fontWeight: 950,
  },
  endCap: { fontSize: 12, opacity: 0.75, paddingTop: 2 },
  empty: { padding: 14, borderRadius: 12, opacity: 0.85 },
  footer: { marginTop: 10, fontSize: 12, opacity: 0.75 },
};