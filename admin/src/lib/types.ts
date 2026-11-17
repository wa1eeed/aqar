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
