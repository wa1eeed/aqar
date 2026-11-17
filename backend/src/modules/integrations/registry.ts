import { PROVIDERS } from './providers';

/** Seed rows derived from the provider definitions (docs/05 §3). Non-secret defaults only. */
export interface RegistryRow {
  key: string;
  category: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export const INTEGRATION_REGISTRY: RegistryRow[] = PROVIDERS.map((p) => ({
  key: p.key,
  category: p.category,
  enabled: p.defaultEnabled ?? false,
  config: p.configSchema.parse({}) as Record<string, unknown>,
}));
