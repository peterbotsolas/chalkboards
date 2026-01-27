// Sample Data: Jersey City / Hoboken area wing spots
const wingSpots = [
    {
        name: "Cluck-U Chicken",
        lat: 40.7433,
        lng: -74.0324,
        special: "50¢ Wings all day",
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

// Initialize Map - Default to Hoboken/Jersey City
const map = L.map('map').setView([40.745, -74.035], 14);

// Add OpenStreetMap tiles
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// User's current location (default to map center if unknown)
let userLocation = { lat: 40.745, lng: -74.035 };
let userMarker = null;
let spotMarkers = [];

// Icons
const wingIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/1147/1147850.png', // Simple chicken leg icon
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

const userIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/149/149059.png', // Simple user pin
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

// Helper: Calculate distance in miles (Haversine formula)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Radius of the earth in miles
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
      ; 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; // Distance in miles
    return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

// Render the list and map markers
function render() {
    const listEl = document.getElementById('specials-list');
    const radius = parseFloat(document.getElementById('radius').value);
    
    // Clear list
    listEl.innerHTML = '';
    
    // Clear markers
    spotMarkers.forEach(m => map.removeLayer(m));
    spotMarkers = [];

    // Filter and sort spots
    const nearbySpots = wingSpots.map(spot => {
        const dist = getDistance(userLocation.lat, userLocation.lng, spot.lat, spot.lng);
        return { ...spot, dist };
    }).filter(spot => spot.dist <= radius).sort((a, b) => a.dist - b.dist);

    if (nearbySpots.length === 0) {
        listEl.innerHTML = '<div class="special-card"><h3>No spots found in range!</h3><p>Try increasing the radius.</p></div>';
    }

    nearbySpots.forEach(spot => {
        // Add to list
        const item = document.createElement('div');
        item.className = 'special-card';
        item.innerHTML = `
            <span class="distance">${spot.dist.toFixed(2)} mi</span>
            <h3>${spot.name}</h3>
            <div class="deal">${spot.special}</div>
            <div style="font-size: 0.9em; margin-top: 5px; color: #ccc;">${spot.day}</div>
        `;
        listEl.appendChild(item);

        // Add to map
        const marker = L.marker([spot.lat, spot.lng], {icon: wingIcon})
            .addTo(map)
            .bindPopup(`<b>${spot.name}</b><br>${spot.special}`);
        spotMarkers.push(marker);
    });
}

// Handle "Locate Me"
document.getElementById('locate-me').addEventListener('click', () => {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            
            // Update map view
            map.setView([userLocation.lat, userLocation.lng], 14);
            
            // Update user marker
            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.marker([userLocation.lat, userLocation.lng], {icon: userIcon})
                .addTo(map)
                .bindPopup("You are here")
                .openPopup();
            
            // Re-render list
            render();
        }, (error) => {
            alert("Error getting location: " + error.message);
        });
    } else {
        alert("Geolocation is not supported by your browser");
    }
});

// Handle Radius Change
document.getElementById('radius').addEventListener('change', render);

// Initial Render
render();