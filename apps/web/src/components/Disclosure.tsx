import type { ReactNode } from 'react';

interface DisclosureProps {
  readonly title: string;
  readonly hint: string;
  readonly children: ReactNode;
}

export function Disclosure({ title, hint, children }: DisclosureProps) {
  return (
    <details className="disclosure">
      <summary>
        <span className="disclosure-text">
          <span className="disclosure-title">{title}</span>
          <span className="disclosure-hint">{hint}</span>
        </span>
        <span className="disclosure-chevron" aria-hidden="true" />
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
