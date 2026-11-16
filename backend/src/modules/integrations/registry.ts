/**
 * Integration registry rows (docs/05 §3). Providers, schemas and the gateway arrive in Phase 2;
 * the seed already creates every row so the admin grid is complete. Only non-secret config here.
 */
export interface RegistryRow {
  key: string;
  category: 'maps' | 'places' | 'payments' | 'email' | 'storage' | 'government' | 'identity' | 'sms';
  enabled: boolean;
  config: Record<string, unknown>;
}

export const INTEGRATION_REGISTRY: RegistryRow[] = [
  {
    key: 'maps.osm',
    category: 'maps',
    enabled: true,
    config: {
      tilesUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; مساهمو OpenStreetMap',
    },
  },
  {
    key: 'places.overpass',
    category: 'places',
    enabled: true,
    config: { endpoint: 'https://overpass-api.de/api/interpreter', radius: 2000 },
  },
  { key: 'maps.google', category: 'maps', enabled: false, config: { mapId: '', language: 'ar', region: 'SA' } },
  { key: 'places.google', category: 'places', enabled: false, config: {} },
  {
    key: 'payments.moyasar',
    category: 'payments',
    enabled: false,
    config: { mode: 'invoice', sources: ['creditcard', 'applepay', 'stcpay'], callbackBaseUrl: '' },
  },
  { key: 'payments.rize', category: 'payments', enabled: false, config: { baseUrl: '', partnerId: '' } },
  {
    key: 'email.resend',
    category: 'email',
    enabled: false,
    config: { fromName: '', fromEmail: '', replyTo: '', domain: '' },
  },
  {
    key: 'storage.r2',
    category: 'storage',
    enabled: false,
    config: { accountId: '', uploadsBucket: 'uploads', mediaBucket: 'media', publicBaseUrl: '' },
  },
  {
    key: 'gov.rega',
    category: 'government',
    enabled: false,
    config: { baseUrl: '', clientId: '', environment: 'sandbox' },
  },
  {
    key: 'gov.ejar',
    category: 'government',
    enabled: false,
    config: { baseUrl: '', brokerageMembershipNo: '', clientId: '' },
  },
  { key: 'identity.nafath', category: 'identity', enabled: false, config: { baseUrl: '', appId: '', serviceType: '' } },
  { key: 'gov.nafith', category: 'government', enabled: false, config: { baseUrl: '', entityId: '' } },
  { key: 'sms.unifonic', category: 'sms', enabled: false, config: { senderName: '' } },
  { key: 'sms.taqnyat', category: 'sms', enabled: false, config: { senderName: '' } },
  { key: 'sms.msegat', category: 'sms', enabled: false, config: { senderName: '' } },
];
