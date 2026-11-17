import type { ProviderDefinition } from '../types';
import { googleMaps, googlePlaces } from './google';
import { moyasarPayments } from './moyasar';
import { osmMaps } from './osm';
import { overpassPlaces } from './overpass';
import { PREPARED_PROVIDERS } from './prepared';
import { r2Storage } from './r2';
import { resendEmail } from './resend';

/** Registry (docs/05 §3), in the admin display order. */
export const PROVIDERS: ProviderDefinition[] = [
  osmMaps as unknown as ProviderDefinition,
  googleMaps as unknown as ProviderDefinition,
  overpassPlaces as unknown as ProviderDefinition,
  googlePlaces as unknown as ProviderDefinition,
  moyasarPayments as unknown as ProviderDefinition,
  ...PREPARED_PROVIDERS.filter((p) => p.category === 'payments'),
  resendEmail as unknown as ProviderDefinition,
  r2Storage as unknown as ProviderDefinition,
  ...PREPARED_PROVIDERS.filter((p) => p.category !== 'payments'),
];

const BY_KEY = new Map(PROVIDERS.map((p) => [p.key, p]));

export function provider(key: string): ProviderDefinition | undefined {
  return BY_KEY.get(key);
}
