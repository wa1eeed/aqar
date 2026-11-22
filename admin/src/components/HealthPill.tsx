import type { Health } from '../lib/types';

const MAP: Record<Health, [string, string]> = {
  ok: ['p-green', 'سليم'],
  degraded: ['p-amber', 'متذبذب'],
  down: ['p-red', 'متوقف'],
  unknown: ['p-gray', 'غير معروف'],
};

export function HealthPill({ health, enabled, prepared }: { health: Health; enabled: boolean; prepared: boolean }) {
  const [cls, label] = prepared
    ? ['p-amber', 'بانتظار بيانات الربط']
    : !enabled
      ? ['p-gray', 'غير مفعّل']
      : MAP[health];
  return (
    <span className={`pill ${cls}`}>
      <i />
      {label}
    </span>
  );
}
