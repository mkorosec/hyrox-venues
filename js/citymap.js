// "Where in the city / how do I get there" map (Leaflet, OpenStreetMap tiles). Uses the global L.
const ICON = { gate: '🚪', bus: '🚌', tram: '🚋', metro: 'Ⓜ', parking: 'P', entrance: '➜' };

export function frameToLatLng(venue) {
  const { anchor, bearingDeg } = venue.geo;
  const k = venue.frame.metersPerUnit;
  const rad = (bearingDeg || 0) * Math.PI / 180;
  return p => {
    const e0 = (p[0] - anchor.frame[0]) * k, n0 = (anchor.frame[1] - p[1]) * k;
    const e = e0 * Math.cos(rad) + n0 * Math.sin(rad), n = -e0 * Math.sin(rad) + n0 * Math.cos(rad);
    return [anchor.lat + n / 111320, anchor.lng + e / (111320 * Math.cos(anchor.lat * Math.PI / 180))];
  };
}

export function createCityMap(el, venue) {
  const city = venue.city;
  const map = L.map(el, { scrollWheelZoom: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const hall = L.polygon(city.hallOutline, { color: '#111', weight: 2, fillColor: '#ffd400', fillOpacity: 0.55 })
    .addTo(map).bindTooltip(`${venue.venue.hall} – race hall`, { permanent: true, direction: 'center', className: 'map-tip' });

  const toLatLng = frameToLatLng(venue);
  if (venue.hall.door) {
    marker(map, toLatLng(venue.hall.door.at), 'entrance', `${venue.hall.door.name} (position from the organizer map, approx.)`);
  }
  for (const p of city.places) marker(map, [p.lat, p.lng], p.kind, `${p.name}${p.note ? `<br>${p.note}` : ''}`);

  const bounds = L.latLngBounds(city.hallOutline);
  city.places.forEach(p => bounds.extend([p.lat, p.lng]));
  map.fitBounds(bounds.pad(0.25));
  return { map, focusHall: () => map.fitBounds(hall.getBounds().pad(1.2)) };
}

function marker(map, at, kind, html) {
  const icon = L.divIcon({ className: `map-pin pin-${kind}`, html: ICON[kind] || '•', iconSize: [30, 30] });
  return L.marker(at, { icon }).addTo(map).bindPopup(html);
}
