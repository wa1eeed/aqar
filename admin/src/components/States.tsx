import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** Empty / loading / error states in the panel style (design/SCREENS.md rules). */
export function EmptyState({ icon = 'info', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="adm-empty" role="status">
      <span className="adm-empty__ic">
        <Icon name={icon} />
      </span>
      <b>{title}</b>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
