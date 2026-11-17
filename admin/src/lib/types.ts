export interface Me {
  typ: 'staff';
  staff: {
    id: string;
    name: string;
    email: string;
    title: string | null;
    totpEnabled: boolean;
    recoveryCodesLeft: number;
    role: { key: string; nameAr: string };
  };
  permissions: string[];
  scope: 'all' | 'own';
}

export type LoginStep = 'totp' | 'password_change' | 'totp_setup';
export type LoginResponse =
  | { accessToken: string; expiresIn: number }
  | { twoFactorRequired: boolean; next: LoginStep; challengeId: string };

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  title: string | null;
  falLicense: string | null;
  showOnWebsite: boolean;
  isActive: boolean;
  totpEnabled: boolean;
  invitePending: boolean;
  lastLoginAt: string | null;
  role: { id: string; key: string; nameAr: string };
}

export interface RoleRow {
  id: string;
  key: string;
  nameAr: string;
  isSystem: boolean;
  permissions: string[];
  members: number;
}

export type Health = 'unknown' | 'ok' | 'degraded' | 'down';

export interface IntegrationSummary {
  key: string;
  category: string;
  nameAr: string;
  descriptionAr: string;
  prepared: boolean;
  enabled: boolean;
  environment: 'sandbox' | 'live';
  health: Health;
  healthCheckedAt: string | null;
}

export interface FormField {
  key: string;
  labelAr: string;
  helpAr?: string;
  placeholder?: string;
  type: 'url' | 'text' | 'select' | 'number' | 'boolean' | 'textarea' | 'multiselect';
  required: boolean;
  options?: Array<{ value: string; labelAr: string }>;
}

export interface IntegrationDetail extends IntegrationSummary {
  docsUrl: string | null;
  supportsSandbox: boolean;
  lastError: string | null;
  config: Record<string, unknown>;
  secrets: Record<string, { set: boolean; hint: string | null }>;
  form: { config: FormField[]; secrets: FormField[] };
  webhookUrl: string | null;
}

export interface CallLog {
  id: string;
  operation: string;
  success: boolean;
  httpStatus: number | null;
  latencyMs: number;
  error: string | null;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  kind: 'photo' | 'floor_plan' | 'document' | 'video_url';
  status: 'processing' | 'ready' | 'failed';
  variants: Record<string, string> | null;
  externalUrl: string | null;
  altAr: string | null;
  sort: number;
  isCover: boolean;
}

export interface AdminProperty {
  id: number;
  code: string;
  slug: string;
  type: string;
  offer: 'sale' | 'rent' | 'investment';
  status: 'available' | 'negotiation' | 'reserved' | 'sold' | 'rented';
  visibility: 'draft' | 'published' | 'archived';
  featured: boolean;
  title: string;
  description: string;
  cityId: string;
  districtId: string;
  city: { id: string; nameAr: string };
  district: { id: string; nameAr: string };
  lat: number;
  lng: number;
  showExactLocation: boolean;
  price: number;
  rentPeriod: 'yearly' | 'monthly' | 'daily' | null;
  negotiable: boolean;
  annualisedPrice: number;
  pricePerMeter: number | null;
  specs: Record<string, unknown>;
  adLicenseNo: string;
  falLicenseNo: string;
  licenseExpiry: string | null;
  bookingEnabled: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  focusKeyword: string | null;
  keywords: string[];
  noindex: boolean;
  agentId: string;
  agent: { id: string; name: string; title: string | null };
  media: MediaItem[];
  updatedAt: string;
  publishedAt: string | null;
  viewCount: number;
  canEdit: boolean;
  publishProblems: Array<{ code: string; message: string }>;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface CityRow {
  id: string;
  nameAr: string;
  lat: number;
  lng: number;
  sort: number;
  isActive: boolean;
  districts: Array<{ id: string; nameAr: string; isActive: boolean; lat: number | null; lng: number | null }>;
}

export type LeadStageKey = 'new' | 'contacted' | 'viewing' | 'negotiation' | 'won' | 'lost';

export interface LeadRow {
  id: string;
  number: string;
  type: string;
  stage: LeadStageKey;
  source: string;
  name: string;
  phone: string;
  email: string | null;
  preferredDate: string | null;
  preferredSlot: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
  property: { id: number; code: string; title: string } | null;
  assignedTo: { id: string; name: string } | null;
}

export interface LeadActivityRow {
  id: string;
  type: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface LeadDetail extends Omit<LeadRow, 'property'> {
  message: string | null;
  budget: string | null;
  closedAt: string | null;
  property: {
    id: number;
    code: string;
    title: string;
    price: number;
    offer: string;
    rentPeriod: string | null;
    status: string;
    cover: string | null;
  } | null;
  customer: { id: string; name: string; email: string | null; phone: string | null } | null;
  activities: LeadActivityRow[];
  viewings: Array<{ id: string; scheduledAt: string; status: string; agent: { id: string; name: string } }>;
}

export interface ViewingRow {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: 'requested' | 'confirmed' | 'completed' | 'no_show' | 'cancelled';
  notes: string | null;
  property: { id: number; code: string; title: string };
  agent: { id: string; name: string };
  lead: { id: string; number: string; name: string; phone: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'blocked' | 'deleted';
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  nafathVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  leadsCount: number;
  bookingsCount: number;
}

export interface NotificationRow {
  id: string;
  eventKey: string;
  title: string;
  body: string;
  link: string | null;
  priority: 'low' | 'normal' | 'high';
  readAt: string | null;
  createdAt: string;
}
