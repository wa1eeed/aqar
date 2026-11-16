import { Link } from 'react-router-dom';
import { EmptyState } from '../components/States';

export function NotFoundPage() {
  return (
    <section className="panel2">
      <div className="pb">
        <EmptyState title="الصفحة غير موجودة">
          <Link className="link" to="/">
            العودة إلى الرئيسية
          </Link>
        </EmptyState>
      </div>
    </section>
  );
}
