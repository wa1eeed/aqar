import { offers, statuses } from '@nx/schema';
import type { AdminProperty } from '../lib/types';

const STATUS_CLS: Record<string, string> = {
  available: 'p-green',
  negotiation: 'p-purple',
  reserved: 'p-amber',
  sold: 'p-red',
  rented: 'p-blue',
};
const OFFER_CLS: Record<string, string> = { sale: 'badge--sale', rent: 'badge--rent', investment: 'badge--investment' };

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`pill ${STATUS_CLS[status] ?? 'p-gray'}`}>
      <i />
      {statuses[status as keyof typeof statuses]?.label ?? status}
    </span>
  );
}

export function OfferBadge({ offer }: { offer: string }) {
  return (
    <span className={`badge ${OFFER_CLS[offer] ?? ''}`} style={{ height: 24, fontSize: 12 }}>
      {offers[offer as keyof typeof offers]?.label ?? offer}
    </span>
  );
}

export function VisibilityPill({ v }: { v: AdminProperty['visibility'] }) {
  return v === 'published' ? (
    <span className="pill p-green">منشور</span>
  ) : v === 'draft' ? (
    <span className="pill p-gray">مسودة</span>
  ) : (
    <span className="pill p-red">مؤرشف</span>
  );
}

/** ساري / ينتهي قريباً / منتهي / ناقص */
export function LicensePill({ p }: { p: Pick<AdminProperty, 'adLicenseNo' | 'falLicenseNo' | 'licenseExpiry'> }) {
  if (!p.adLicenseNo || !p.falLicenseNo) return <span className="pill p-red">ناقص</span>;
  if (p.licenseExpiry) {
    const days = (new Date(p.licenseExpiry).getTime() - Date.now()) / 86_400_000;
    if (days < 0) return <span className="pill p-red">منتهي</span>;
    if (days <= 30) return <span className="pill p-amber">ينتهي قريباً</span>;
  }
  return <span className="pill p-green">ساري</span>;
}
