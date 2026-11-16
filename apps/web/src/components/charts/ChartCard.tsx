import type { ReactNode } from 'react';
import { DataTable } from '@/components/DataTable.tsx';
import { t } from '@/lib/texts.ts';

interface ChartCardProps {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  readonly tableHead: readonly string[];
  readonly tableRows: readonly (readonly string[])[];
}

export function ChartCard({ title, subtitle, children, tableHead, tableRows }: ChartCardProps) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">{subtitle}</p>
      {children}
      <details>
        <summary>{t.shell.tableToggle}</summary>
        <DataTable head={tableHead} rows={tableRows} empty={t.noValue} />
      </details>
    </section>
  );
}
