// واجهات القدرات (Capabilities) — تعتمد عليها خدمات الأعمال، لا على مزوّد بعينه (docs/05 §4).

export type NearbyCat = string; // مفاتيح packages/schema nearby

export interface NearbyItem {
  id: string;
  cat: NearbyCat;
  name: string;
  lat: number;
  lng: number;
  distance: number; // بالأمتار
}

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface MapsPublicConfig {
  provider: 'osm' | 'google';
  tilesUrl?: string;
  attribution?: string;
  browserKey?: string;
}

export interface MapsCapability {
  publicConfig(): MapsPublicConfig;
}

export interface PlacesCapability {
  nearby(lat: number, lng: number, radius: number, cats: NearbyCat[]): Promise<NearbyItem[]>;
  geocode?(q: string): Promise<GeoPoint[]>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: Record<string, string>;
  idempotencyKey: string;
}

export interface EmailCapability {
  send(msg: EmailMessage): Promise<{ id: string }>;
}

export type StorageBucket = 'uploads' | 'media';

export interface StorageCapability {
  presignPut(
    bucket: StorageBucket,
    key: string,
    contentType: string,
    maxBytes: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;
  signedGet(bucket: StorageBucket, key: string, ttlSec: number): Promise<string>;
  delete(bucket: StorageBucket, key: string): Promise<void>;
  publicUrl(key: string): string;
}

export interface SmsCapability {
  send(to: string, textAr: string): Promise<{ id: string }>;
}
