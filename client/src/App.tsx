import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Weekday =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";

type TimeWindow = {
  start: string;
  end: string;
  description: string;
};

type Special = {
  day: Weekday;
  windows: TimeWindow[];
};

type Business = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  specials: Special[];
};

const BUSINESSES: Business[] = [
  {
    name: "Sharky's",
    address: "545 Highland Ave, Clifton, NJ 07011",
    lat: 40.8584,
    lng: -74.1438,
    specials: [
      {
        day: "Monday",
        windows: [
          { start: "11:30", end: "14:00", description: "Lunch: 8 wings + fries for $10.99" },
          { start: "20:00", end: "22:00", description: "Night: $0.90 wings" },
        ],
      },
      {
        day: "Tuesday",
        windows: [
          { start: "11:30", end: "14:00", description: "Lunch: 8 wings + fries for $10.99" },
          { start: "20:00", end: "22:00", description: "Night: $0.90 wings" },
        ],
      },
      {
        day: "Wednesday",
        windows: [{ start: "11:30", end: "14:00", description: "Lunch: 8 wings + fries for $10.99" }],
      },
      {
        day: "Thursday",
        windows: [{ start: "11:30", end: "14:00", description: "Lunch: 8 wings + fries for $10.99" }],
      },
      {
        day: "Friday",
        windows: [{ start: "11:30", end: "14:00", description: "Lunch: 8 wings + fries for $10.99" }],
      },
    ],
  },
  {
    name: "Miller's Ale House",
    address: "270 Rte 4, Paramus, NJ 07652",
    lat: 40.9137,
    lng: -74.0701,
    specials: [
      {
        day: "Wednesday",
        windows: [{ start: "00:00", end: "23:59", description: "All day: 12 wings for $12" }],
      },
    ],
  },
  {
    name: "Grant Street Cafe",
    address: "25 Grant Ave, Dumont, NJ 07628",
    lat: 40.9406,
    lng: -73.9965,
    specials: [
      {
        day: "Thursday",
        windows: [{ start: "00:00", end: "23:59", description: "Order of wings for $8" }],
      },
    ],
  },
];

function weekdayFromDate(d: Date): Weekday {
  const days: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[d.getDay()];
}

function toMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(":").map((n) => parseInt(n, 10));
  return hh * 60 + mm;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function format12Hour(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function prettyWindow(start: string, end: string): string {
  return `${start}–${end}`;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

export default function App() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [showLaterToday, setShowLaterToday] = useState(true);
  const [radius, setRadius] = useState(10);
  const [userLocation, setUserLocation] = useState({ lat: 40.88, lng: -74.07 });

  const today = weekdayFromDate(new Date());
  const nowMins = nowMinutes();

  const wingIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/1147/1147850.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });

  const userIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/149/149059.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });

  const todayRows = useMemo((): TodayRow[] => {
    const rows: TodayRow[] = [];

    for (const biz of BUSINESSES) {
      const todays = biz.specials.filter((s) => s.day === today);
      const dist = getDistance(userLocation.lat, userLocation.lng, biz.lat, biz.lng);

      if (dist > radius) continue;

      for (const s of todays) {
        for (const w of s.windows) {
          const startM = toMinutes(w.start);
          const endM = toMinutes(w.end);

          const isActive = nowMins >= startM && nowMins <= endM;
          const isLater = nowMins < startM;

          if (isActive) {
            rows.push({
              businessName: biz.name,
              address: biz.address,
              lat: biz.lat,
              lng: biz.lng,
              start: w.start,
              end: w.end,
              description: w.description,
              status: "active",
              distance: dist,
            });
          } else if (isLater) {
            rows.push({
              businessName: biz.name,
              address: biz.address,
              lat: biz.lat,
              lng: biz.lng,
              start: w.start,
              end: w.end,
              description: w.description,
              status: "later",
              startsInMinutes: startM - nowMins,
              distance: dist,
            });
          }
        }
      }
    }

    rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      const aStart = toMinutes(a.start);
      const bStart = toMinutes(b.start);
      return aStart - bStart;
    });

    return rows;
  }, [today, nowMins, userLocation, radius]);

  const active = todayRows.filter((r) => r.status === "active");
  const later = todayRows.filter((r) => r.status === "later");

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([userLocation.lat, userLocation.lng], 11);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach(m => mapRef.current?.removeLayer(m));
    markersRef.current = [];

    const uniqueBusinesses = new Map<string, TodayRow>();
    todayRows.forEach(row => {
      if (!uniqueBusinesses.has(row.businessName)) {
        uniqueBusinesses.set(row.businessName, row);
      }
    });

    uniqueBusinesses.forEach((row) => {
      const marker = L.marker([row.lat, row.lng], { icon: wingIcon })
        .addTo(mapRef.current!)
        .bindPopup(`<b>${row.businessName}</b><br>${row.description}`);
      markersRef.current.push(marker);
    });
  }, [todayRows, wingIcon]);

  const handleLocateMe = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(newLocation);

          if (mapRef.current) {
            mapRef.current.setView([newLocation.lat, newLocation.lng], 12);

            if (userMarkerRef.current) {
              mapRef.current.removeLayer(userMarkerRef.current);
            }
            userMarkerRef.current = L.marker([newLocation.lat, newLocation.lng], { icon: userIcon })
              .addTo(mapRef.current)
              .bindPopup("You are here")
              .openPopup();
          }
        },
        (error) => {
          alert("Error getting location: " + error.message);
        }
      );
    } else {
      alert("Geolocation is not supported by your browser");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Chalkboard – Jersey Wing Joints</div>
        <div style={styles.subtitle}>
          What's worth knowing today, near you • <b>{today}</b> • {format12Hour(new Date())}
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.filterGroup}>
          <label htmlFor="radius" style={{ marginRight: 8 }}>Radius:</label>
          <select
            id="radius"
            data-testid="select-radius"
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

        <button onClick={handleLocateMe} data-testid="button-locate-me" style={styles.button}>
          Use My Location
        </button>

        <label style={styles.toggle} data-testid="toggle-later-today">
          <input
            type="checkbox"
            checked={showLaterToday}
            onChange={(e) => setShowLaterToday(e.target.checked)}
            data-testid="checkbox-later-today"
          />
          <span style={{ marginLeft: 8 }}>Show later today</span>
        </label>
      </div>

      <div
        id="map"
        ref={mapContainerRef}
        style={styles.map}
        data-testid="map-container"
      ></div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Active right now</div>

        {active.length === 0 ? (
          <div style={styles.card} data-testid="card-no-active">
            <div style={styles.cardTitle}>No active specials right now</div>
            <div style={styles.cardText}>Check "later today" or come back another time.</div>
          </div>
        ) : (
          active.map((r, idx) => <SpecialCard key={`a-${idx}`} row={r} />)
        )}
      </div>

      {showLaterToday && (
        <div style={styles.section} data-testid="section-later-today">
          <div style={styles.sectionTitle}>Later today</div>

          {later.length === 0 ? (
            <div style={styles.card} data-testid="card-no-later">
              <div style={styles.cardTitle}>Nothing scheduled later today</div>
              <div style={styles.cardText}>Try another day on the board.</div>
            </div>
          ) : (
            later.map((r, idx) => <SpecialCard key={`l-${idx}`} row={r} />)
          )}
        </div>
      )}

      <div style={styles.footer}>
        Day-based visibility is on: you only see specials for <b>{today}</b>.
      </div>
    </div>
  );
}

function SpecialCard({ row }: { row: TodayRow }) {
  return (
    <div style={styles.card} data-testid={`card-special-${row.businessName.replace(/\s+/g, '-').toLowerCase()}`}>
      <div style={styles.cardTop}>
        <div style={styles.cardTitle}>{row.businessName}</div>
        <div style={row.status === "active" ? styles.badgeActive : styles.badgeLater}>
          {row.status === "active" ? "ACTIVE" : "LATER"}
        </div>
      </div>

      <div style={styles.cardText}>{row.description}</div>
      <div style={styles.cardMeta}>
        <div>{row.address}</div>
        <div>
          {row.distance !== undefined && <span style={{ marginRight: 8 }}>{row.distance.toFixed(1)} mi</span>}
          {prettyWindow(row.start, row.end)}
          {row.status === "later" && typeof row.startsInMinutes === "number" ? (
            <span style={{ marginLeft: 8, opacity: 0.85 }}>
              (starts in {row.startsInMinutes} min)
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 16,
    background: "#141414",
    color: "#f2f2f2",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  header: {
    padding: 12,
    borderRadius: 16,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: 800, letterSpacing: 0.2 },
  subtitle: { marginTop: 4, opacity: 0.9, fontSize: 14 },
  controls: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  filterGroup: {
    display: "flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  select: {
    background: "#222",
    color: "#f2f2f2",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 8,
    padding: "4px 8px",
  },
  button: {
    padding: "10px 16px",
    borderRadius: 14,
    background: "rgba(0, 140, 255, 0.2)",
    border: "1px solid rgba(0, 140, 255, 0.4)",
    color: "#f2f2f2",
    cursor: "pointer",
    fontWeight: 600,
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    cursor: "pointer",
  },
  map: {
    height: 300,
    borderRadius: 16,
    marginBottom: 12,
    border: "1px solid rgba(255,255,255,0.10)",
  },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 700, marginBottom: 8, opacity: 0.95 },
  card: {
    padding: 12,
    borderRadius: 16,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    marginBottom: 10,
  },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: 800 },
  cardText: { marginTop: 6, fontSize: 15 },
  cardMeta: { marginTop: 8, fontSize: 12, opacity: 0.9, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  badgeActive: {
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: "rgba(0, 255, 140, 0.16)",
    border: "1px solid rgba(0, 255, 140, 0.30)",
  },
  badgeLater: {
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: "rgba(255, 210, 0, 0.16)",
    border: "1px solid rgba(255, 210, 0, 0.30)",
  },
  footer: { marginTop: 16, opacity: 0.8, fontSize: 12 },
};
