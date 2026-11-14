"use client";

import { useCallback, useMemo } from "react";
import { gravarArmazenado, lerArmazenado, useArmazenado } from "@/hooks/useArmazenado";
import { useHidratado } from "@/hooks/useHidratado";

type TablePrefs = {
  order: string[];
  widths: Record<string, number>;
};

/**
 * Ordem e larguras salvas, sobre os padrões da tabela. Coluna que deixou de
 * existir é descartada; coluna nova (ainda não salva) entra no fim.
 */
function lerPrefs(
  raw: string | null,
  defaultOrder: string[],
  defaultWidths: Record<string, number>
): TablePrefs {
  let order = defaultOrder;
  let widths = defaultWidths;
  if (!raw) return { order, widths };
  try {
    const saved = JSON.parse(raw) as Partial<TablePrefs>;

    if (Array.isArray(saved.order) && saved.order.length > 0) {
      const salvas = saved.order;
      const valid = salvas.filter((k) => defaultOrder.includes(k));
      const added = defaultOrder.filter((k) => !salvas.includes(k));
      if (valid.length > 0) order = [...valid, ...added];
    }

    if (saved.widths && typeof saved.widths === "object") {
      widths = { ...defaultWidths, ...saved.widths };
    }
  } catch {
    // ignore corrupted storage
  }
  return { order, widths };
}

/**
 * Preferências de colunas (ordem e largura) de uma tabela, por pessoa, no
 * localStorage. Lidas via store externa (`useArmazenado`): o servidor e a
 * hidratação usam os padrões, e as salvas entram logo depois — sem setState em
 * efeito. `ready` diz quando as salvas já valem (antes disso a tabela mostra
 * esqueleto, para não piscar a ordem padrão).
 */
export function useTablePreferences(
  tableKey: string,
  userEmail: string,
  defaultOrder: string[],
  defaultWidths: Record<string, number>
) {
  const storageKey = `tbl:${tableKey}:${userEmail}`;

  const raw = useArmazenado(storageKey);
  const ready = useHidratado();
  const { order, widths } = useMemo(
    () => lerPrefs(raw, defaultOrder, defaultWidths),
    [raw, defaultOrder, defaultWidths]
  );

  // Os callbacks partem do valor guardado na hora da chamada, não do render em
  // que foram criados: o redimensionamento chama resizeCol a cada movimento e
  // pode estar segurando uma closure antiga.
  const reorderCols = useCallback(
    (activeId: string, overId: string) => {
      const atual = lerPrefs(lerArmazenado(storageKey), defaultOrder, defaultWidths);
      const oldIdx = atual.order.indexOf(activeId);
      const newIdx = atual.order.indexOf(overId);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

      const next = [...atual.order];
      next.splice(oldIdx, 1);
      next.splice(newIdx, 0, activeId);

      gravarArmazenado(storageKey, JSON.stringify({ order: next, widths: atual.widths }));
    },
    [storageKey, defaultOrder, defaultWidths]
  );

  const resizeCol = useCallback(
    (colKey: string, width: number) => {
      const atual = lerPrefs(lerArmazenado(storageKey), defaultOrder, defaultWidths);
      const next = { ...atual.widths, [colKey]: width };
      gravarArmazenado(storageKey, JSON.stringify({ order: atual.order, widths: next }));
    },
    [storageKey, defaultOrder, defaultWidths]
  );

  return { order, widths, reorderCols, resizeCol, ready };
}
