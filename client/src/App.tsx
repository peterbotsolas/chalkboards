import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface WingSpot {
  name: string;
  lat: number;
  lng: number;
  special: string;
  day: string;
}

const wingSpots: WingSpot[] = [
  {
    name: "Cluck-U Chicken",
    lat: 40.7433,
    lng: -74.0324,
    special: "50c Wings all day",
    day: "Tuesday"
  },
  {
    name: "Tenth Street Pizza",
    lat: 40.7495,
    lng: -74.0305,
    special: "Buy one dozen, get half dozen free",
    day: "Everyday"
  },
  {
    name: "Left Bank Burger Bar",
    lat: 40.7198,
    lng: -74.0435,
    special: "$1 Wings during Happy Hour",
    day: "Weekdays"
  },
  {
    name: "White Star Bar",
    lat: 40.7169,
    lng: -74.0450,
    special: "Half-price wings",
    day: "Wednesday"
  },
  {
    name: "Carpe Diem",
    lat: 40.7518,
    lng: -74.0298,
    special: "Award winning wings $10/dozen",
    day: "Thursday"
  },
  {
    name: "Black Bear Bar",
    lat: 40.7388,
    lng: -74.0302,
    special: "$0.75 Wings for NFL Games",
    day: "Sunday"
  }
];

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

function App() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [radius, setRadius] = useState(5);
  const [userLocation, setUserLocation] = useState({ lat: 40.745, lng: -74.035 });

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

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([40.745, -74.035], 14);
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

    const nearbySpots = wingSpots
      .map(spot => ({
        ...spot,
        dist: getDistance(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
      }))
      .filter(spot => spot.dist <= radius)
      .sort((a, b) => a.dist - b.dist);

    nearbySpots.forEach(spot => {
      const marker = L.marker([spot.lat, spot.lng], { icon: wingIcon })
        .addTo(mapRef.current!)
        .bindPopup(`<b>${spot.name}</b><br>${spot.special}`);
      markersRef.current.push(marker);
    });
  }, [radius, userLocation, wingIcon]);

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
            mapRef.current.setView([newLocation.lat, newLocation.lng], 14);

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

  const nearbySpots = wingSpots
    .map(spot => ({
      ...spot,
      dist: getDistance(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
    }))
    .filter(spot => spot.dist <= radius)
    .sort((a, b) => a.dist - b.dist);

  return (
    <div className="container">
      <header>
        <h1>Jersey Wing Joints</h1>
        <p>Today's Specials</p>
      </header>

      <div className="controls">
        <div className="filter-group">
          <label htmlFor="radius">Radius (miles):</label>
          <select
            id="radius"
            data-testid="select-radius"
            value={radius}
            onChange={(e) => setRadius(parseFloat(e.target.value))}
          >
            <option value="0.5">0.5</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="999">Anywhere</option>
          </select>
        </div>
        <button onClick={handleLocateMe} data-testid="button-locate-me">
          Use My Location
        </button>
      </div>

      <div id="map" ref={mapContainerRef}></div>

      <div className="specials-list" data-testid="list-specials">
        {nearbySpots.length === 0 ? (
          <div className="special-card">
            <h3>No spots found in range!</h3>
            <p>Try increasing the radius.</p>
          </div>
        ) : (
          nearbySpots.map((spot) => (
            <div
              key={spot.name}
              className="special-card"
              data-testid={`card-special-${spot.name.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <span className="distance">{spot.dist.toFixed(2)} mi</span>
              <h3>{spot.name}</h3>
              <div className="deal">{spot.special}</div>
              <div className="day-info">{spot.day}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;