import { EmptyState } from '../components/States';
import type { NavItem } from '../app/nav';

export function PlaceholderPage({ item }: { item: NavItem }) {
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{item.label}</h1>
        </div>
      </div>
      <section className="panel2">
        <div className="pb">
          <EmptyState icon={item.icon} title="هذه الشاشة قيد البناء">
            تُبنى ضمن المرحلة {item.phase} من خطة التنفيذ.
          </EmptyState>
        </div>
      </section>
    </>
  );
}
