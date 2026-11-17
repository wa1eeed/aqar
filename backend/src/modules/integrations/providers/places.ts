import type { NearbyKey } from '@nx/schema';

export interface NearbyItem {
  id: string;
  cat: NearbyKey;
  name: string;
  lat: number;
  lng: number;
  /** metres */
  distance: number;
}

/** Great-circle distance in metres (rounded). */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
