import { EmptyState } from '../components/States';
import { useSession } from '../app/session';

const KPIS = [
  'عقارات منشورة',
  'طلبات جديدة اليوم',
  'معاينات هذا الأسبوع',
  'حجوزات مؤكدة (الشهر)',
  'مدفوعات الشهر',
  'تحويلات بانتظار المراجعة',
];

export function DashboardPage() {
  const { me } = useSession();
  const today = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'full' }).format(new Date());
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>مرحباً، {me?.staff.name}</h1>
          <p>{today} · إليك ملخص أداء منشأتك</p>
        </div>
      </div>
      <div className="kpis2">
        {KPIS.map((k) => (
          <div className="kpi2" key={k}>
            <span>{k}</span>
            <b>—</b>
          </div>
        ))}
      </div>
      <section className="panel2">
        <div className="pb">
          <EmptyState icon="chart" title="لا توجد بيانات بعد">
            تظهر المؤشرات والرسوم البيانية هنا بعد ربط العقارات والطلبات بالنظام.
          </EmptyState>
        </div>
      </section>
    </>
  );
}
