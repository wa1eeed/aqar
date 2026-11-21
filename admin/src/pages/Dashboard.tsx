const stats = [
  { n: '—', l: 'العقارات المنشورة' },
  { n: '—', l: 'الطلبات الجديدة' },
  { n: '—', l: 'الحجوزات هذا الشهر' },
];

export function Dashboard() {
  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="grid cols-3">
        {stats.map((s) => (
          <div key={s.l} className="card stat">
            <div className="n">{s.n}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>أهلاً بك في لوحة منزلة</h2>
        <p className="muted">
          هذه لوحة مكتب العقار. تُربط البطاقات أعلاه بالبيانات الحقيقية في المراحل القادمة (العقارات،
          الطلبات، الحجوزات).
        </p>
      </div>
    </div>
  );
}
