export function Placeholder({ name }: { name: string }) {
  return (
    <div className="card">
      <h2>{name}</h2>
      <p className="muted">تُبنى هذه الشاشة في المرحلة القادمة حسب التصميم المعتمد.</p>
    </div>
  );
}
