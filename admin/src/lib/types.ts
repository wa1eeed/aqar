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
