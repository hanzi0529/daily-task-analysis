import type { TableColumnConfig } from "@/types/domain";

interface DataTableProps<T extends object> {
  columns: TableColumnConfig[];
  rows: T[];
  emptyText?: string;
}

export function DataTable<T extends object>({
  columns,
  rows,
  emptyText = "暂无数据"
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">{emptyText}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-full overflow-hidden rounded-2xl">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.width ? { width: column.width } : undefined}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((row, rowIndex) => (
            <tr
              key={String((row as { id?: string | number }).id ?? rowIndex)}
              className="text-sm text-slate-700"
            >
              {columns.map((column) => (
                <td key={column.key}>
                  {renderCell((row as Record<string, unknown>)[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(value: unknown) {
  if (Array.isArray(value)) {
    return value.join("，");
  }

  if (value == null || value === "") {
    return "-";
  }

  return String(value);
}
