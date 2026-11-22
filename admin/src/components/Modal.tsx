import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal__x)')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal__box"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={box}
        style={wide ? { width: 'min(760px, 100%)' } : undefined}
      >
        <button className="icon-btn modal__x" type="button" aria-label="إغلاق" onClick={onClose}>
          <Icon name="close" />
        </button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
