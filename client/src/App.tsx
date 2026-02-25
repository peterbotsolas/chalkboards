import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jpphthbbawkxbhzonvyz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_b6cy5vUSAFkVxWkRyYJSUw_FagY1_5D";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SUPPORT_EMAIL = "chalkboards.app@gmail.com";

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

type RestaurantGroup = {
  key: string;
  businessName: string;
  address: string;
  items: Array<{
    kind: "flash" | "weekly";
    deal: string;
    windowText: string;
    badge: string;
  }>;
};

function normLower(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

function normalizeAddress(input: string) {
  return String(input || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isApprovedStatus(status: any): boolean {
  // treat null as approved so old rows don't disappear
  if (status == null) return true;
  const s = normLower(status);
  return s === "approved" || s === "live" || s === "published";
}

function isFlashType(t: any) {
  const s = normLower(t);
  return s === "flash" || s === "flash_special";
}

function isWeeklyType(t: any) {
  const s = normLower(t);
  return s === "weekly" || s === "weekly_special";
}

function isFlashActiveNow(createdAtIso: string, expiresAtIso: string | null) {
  if (!expiresAtIso) return false;
  const now = Date.now();
  const createdAt = new Date(createdAtIso).getTime();
  const expiresAt = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return false;
  return now >= createdAt && now <= expiresAt;
}

function prettyWindowFromExtra(extra: any): string {
  // expect extra like { day, start, end } but don't crash if missing
  try {
    const obj = typeof extra === "string" ? JSON.parse(extra) : extra;
    const day = String(obj?.day ?? "").trim();
    const start = String(obj?.start ?? "").trim();
    const end = String(obj?.end ?? "").trim();
    if (!day || !start || !end) return "";
    return `${day} • ${start}–${end}`;
  } catch {
    return "";
  }
}

function makeReportMailto(businessName: string, address: string, deal: string) {
  const subject = `Chalkboards Report Issue — ${businessName}`;
  const body = [
    "Report issue:",
    "",
    `Business: ${businessName}`,
    `Address: ${address}`,
    `Special: ${deal}`,
    "",
    "What’s wrong? (tell us):",
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

export default function App() {
  const [rows, setRows] = useState<DbSpecialRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );
  const [errorText, setErrorText] = useState("");
  const [search, setSearch] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      setErrorText("");

      const { data, error } = await supabase
        .from("specials")
        .select(
          "id, created_at, type, business_name, deal, address, expires_at, status, extra, lat, lng"
        )
        .order("created_at", { ascending: false })
        .limit(600);

      if (cancelled) return;

      if (error) {
        setStatus("error");
        setErrorText(error.message || "Supabase error");
        setRows([]);
        return;
      }

      setRows((data ?? []) as DbSpecialRow[]);
      setStatus("ok");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const groups = useMemo((): RestaurantGroup[] => {
    const q = search.trim().toLowerCase();

    const filtered = rows.filter((r) => {
      if (!r.address || !r.business_name || !r.deal) return false;
      if (!isApprovedStatus(r.status)) return false;

      // Only show active flash specials; weekly always show
      if (isFlashType(r.type) && !isFlashActiveNow(r.created_at, r.expires_at))
        return false;

      if (!q) return true;
      const blob = `${r.business_name} ${r.address} ${r.deal}`.toLowerCase();
      return blob.includes(q);
    });

    const map = new Map<string, RestaurantGroup>();

    for (const r of filtered) {
      const address = r.address ?? "";
      const key = normalizeAddress(address);
      const businessName = r.business_name ?? "Business";

      if (!map.has(key)) {
        map.set(key, {
          key,
          businessName,
          address,
          items: [],
        });
      }

      const g = map.get(key)!;

      const isFlash = isFlashType(r.type);
      const isWeekly = isWeeklyType(r.type);

      let kind: "flash" | "weekly" = isFlash ? "flash" : "weekly";
      if (!isFlash && !isWeekly) kind = "weekly";

      const windowText = kind === "weekly" ? prettyWindowFromExtra(r.extra) : "";
      const badge = kind === "flash" ? "⚡ FLASH" : "🗓️ WEEKLY";

      g.items.push({
        kind,
        deal: r.deal ?? "",
        windowText,
        badge,
      });
    }

    // sort groups: flash-first, then by name
    const list = Array.from(map.values());
    list.sort((a, b) => {
      const aHasFlash = a.items.some((x) => x.kind === "flash");
      const bHasFlash = b.items.some((x) => x.kind === "flash");
      if (aHasFlash !== bHasFlash) return aHasFlash ? -1 : 1;
      return a.businessName.localeCompare(b.businessName);
    });

    // within group: flash first
    for (const g of list) {
      g.items.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "flash" ? -1 : 1;
        return a.deal.localeCompare(b.deal);
      });
    }

    return list;
  }, [rows, search]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#141414",
        color: "#f2f2f2",
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        padding: 16,
      }}
    >
      <div
        style={{
          padding: 14,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>Chalkboards</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {status === "ok" ? (
              <span style={{ color: "#00ff6a", fontWeight: 900 }}>LIVE</span>
            ) : status === "loading" ? (
              <span>Loading…</span>
            ) : status === "error" ? (
              <span style={{ color: "#ff6b6b", fontWeight: 900 }}>
                Offline ({errorText})
              </span>
            ) : (
              <span />
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search specials..."
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.25)",
              color: "#f2f2f2",
              outline: "none",
              minWidth: 240,
            }}
          />
          <button
            onClick={() => setRefreshTick((x) => x + 1)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#f2f2f2",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          fontSize: 13,
          opacity: 0.85,
        }}
      >
        Map will come back after we confirm Vercel builds again. This page is the
        “safe build” version.
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {groups.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            No specials found.
          </div>
        ) : (
          groups.map((g) => (
            <div
              key={g.key}
              style={{
                padding: 14,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 16, fontWeight: 900 }}>
                  {g.businessName}
                </div>
                <a
                  href={makeReportMailto(
                    g.businessName,
                    g.address,
                    g.items[0]?.deal || ""
                  )}
                  style={{ color: "#f2f2f2", opacity: 0.9 }}
                >
                  Report issue
                </a>
              </div>

              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                {g.address}
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {g.items.map((it, idx) => (
                  <div key={idx} style={{ lineHeight: 1.35 }}>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      {it.badge}{" "}
                      {it.windowText ? (
                        <span style={{ opacity: 0.85 }}>• {it.windowText}</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {it.deal}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.75 }}>
        Support:{" "}
        <a
          href={"mailto:" + SUPPORT_EMAIL}
          style={{ color: "#f2f2f2", textDecoration: "underline" }}
        >
          {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}