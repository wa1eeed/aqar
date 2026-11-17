import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

/** Drag the pin or click the map to set the location (docs/07 §3 «الموقع»). Leaflet is bundled (no CDN). */
export function MapPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© مساهمو OpenStreetMap',
    }).addTo(m);
    const icon = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 26] });
    const mk = L.marker([lat, lng], { draggable: true, icon, keyboard: true, title: 'موقع العقار' }).addTo(m);
    const round = (v: number) => Math.round(v * 1e6) / 1e6;
    mk.on('dragend', () => {
      const p = mk.getLatLng();
      cb.current(round(p.lat), round(p.lng));
    });
    m.on('click', (e: L.LeafletMouseEvent) => {
      mk.setLatLng(e.latlng);
      cb.current(round(e.latlng.lat), round(e.latlng.lng));
    });
    map.current = m;
    marker.current = mk;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const p = marker.current?.getLatLng();
    if (p && (Math.abs(p.lat - lat) > 1e-7 || Math.abs(p.lng - lng) > 1e-7)) {
      marker.current!.setLatLng([lat, lng]);
      map.current?.panTo([lat, lng]);
    }
  }, [lat, lng]);

  return <div ref={el} className="map-picker" role="application" aria-label="خريطة تحديد الموقع" />;
}
