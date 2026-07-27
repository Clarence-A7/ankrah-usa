import React from "react";
import styles from "./styles/Table.module.css";

interface Column<T> {
  header: React.ReactNode;
  render: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
}

export function Table<T>({ columns, data }: TableProps<T>) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table} role="table">
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((col, idx) => (
              <th key={idx} role="columnheader" scope="col">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {data.map((item, rowIdx) => (
            <tr key={rowIdx} role="row">
              {columns.map((col, colIdx) => (
                // data-label drives the mobile card layout — CSS reads it via
                // content: attr(data-label) to show which column each value
                // belongs to once the row stops being a horizontal table row.
                <td key={colIdx} role="cell" data-label={col.header}>
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
