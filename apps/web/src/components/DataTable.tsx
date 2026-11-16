import { rowKeys } from '@/lib/row-keys.ts';

interface DataTableProps {
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly empty: string;
}

export function DataTable({ head, rows, empty }: DataTableProps) {
  const keys = rowKeys(rows);

  if (rows.length === 0) {
    return <p className="muted">{empty}</p>;
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, position) => (
            <tr key={keys[position]}>
              {row.map((cell, index) => (
                <td key={`${head[index]}:${cell}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
