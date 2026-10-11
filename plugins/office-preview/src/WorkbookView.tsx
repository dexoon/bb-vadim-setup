// A parsed workbook: formula bar on top, the active sheet's grid, sheet tabs at
// the bottom — the layout Excel users expect.
import { useState } from "react";
import { columnName, SheetGrid } from "./SheetGrid";
import type { CellPos } from "./SheetGrid";
import type { WorkbookData } from "./model";
import { SMALL_BUTTON as BUTTON } from "./opener-ui";

const FIRST_CELL: CellPos = { r: 1, c: 1 };

export function WorkbookView({
  workbook,
  onReload,
  onOpenExternally,
}: {
  workbook: WorkbookData;
  onReload: () => void;
  onOpenExternally: (() => boolean) | null;
}) {
  const [active, setActive] = useState(() => Math.max(0, workbook.sheets.findIndex((s) => !s.hidden)));
  const [selected, setSelected] = useState<CellPos>(FIRST_CELL);
  const sheet = workbook.sheets[active];

  if (!sheet) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-6 text-sm text-muted-foreground">
        В файле нет листов.
      </div>
    );
  }

  const cell = sheet.rows[selected.r]?.[selected.c];
  const content = cell?.formula ? `=${cell.formula}` : (cell?.text ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 flex-none items-center gap-2 border-b border-border px-2">
        <div className="w-20 flex-none truncate rounded-md border border-border px-2 py-1 font-mono text-xs text-foreground">
          {columnName(selected.c)}
          {selected.r}
        </div>
        <span className="flex-none text-xs italic text-muted-foreground">fx</span>
        <input
          readOnly
          value={content}
          title={content.length > 80 ? content : undefined}
          aria-label="Содержимое ячейки"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button type="button" className={BUTTON} onClick={onReload} title="Перечитать файл с диска">
          Обновить
        </button>
        {onOpenExternally && (
          <button type="button" className={BUTTON} onClick={onOpenExternally} title="Открыть приложением по умолчанию">
            Во внешнем приложении
          </button>
        )}
      </div>
      {sheet.clipped && (
        <div className="flex-none border-b border-border px-3 py-1 text-xs text-muted-foreground">
          Лист больше, чем показывает просмотр: {sheet.rowCount} из {sheet.clipped.rows} строк,{" "}
          {sheet.colCount} из {sheet.clipped.cols} столбцов.
        </div>
      )}
      <SheetGrid key={active} sheet={sheet} selected={selected} onSelect={setSelected} />
      <div role="tablist" aria-label="Листы" className="flex h-8 flex-none items-stretch overflow-x-auto border-t border-border">
        {workbook.sheets.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            title={s.hidden ? "Скрытый лист" : undefined}
            onClick={() => {
              setActive(i);
              setSelected(FIRST_CELL);
            }}
            style={s.tabColor ? { boxShadow: `inset 0 -3px 0 ${s.tabColor}` } : undefined}
            className={`flex-none whitespace-nowrap border-r border-border px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring ${
              i === active ? "bg-background font-semibold text-foreground" : "bg-muted text-muted-foreground hover:bg-state-hover"
            } ${s.hidden ? "italic opacity-60" : ""}`}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
