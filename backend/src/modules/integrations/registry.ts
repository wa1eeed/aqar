import type { ProviderDefinition } from './provider-definition.js';
import { osmProvider } from './providers/osm.provider.js';
import { overpassProvider } from './providers/overpass.provider.js';
import { resendProvider } from './providers/resend.provider.js';
import { r2Provider } from './providers/r2.provider.js';
import { googleMapsProvider, googlePlacesProvider, PREPARED_PROVIDERS } from './providers/prepared.js';

export const PROVIDERS: ProviderDefinition[] = [
  osmProvider as ProviderDefinition,
  overpassProvider as ProviderDefinition,
  resendProvider as ProviderDefinition,
  r2Provider as ProviderDefinition,
  googleMapsProvider,
  googlePlacesProvider,
  ...PREPARED_PROVIDERS,
];

const BY_KEY = new Map(PROVIDERS.map((p) => [p.key, p]));

export function getProvider(key: string): ProviderDefinition | undefined {
  return BY_KEY.get(key);
}

export function providersByScope(scope: 'platform' | 'tenant'): ProviderDefinition[] {
  return PROVIDERS.filter((p) => p.scope === scope);
}
