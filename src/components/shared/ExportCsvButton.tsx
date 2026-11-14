"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { toast } from "@/components/shared/Toast";
import { montarCsv, nomeDoArquivoCsv } from "@/lib/csv";

/**
 * Exporta o que está na tela (já filtrado e ordenado) como CSV. Montado no
 * navegador a partir dos dados que a tabela já tem: o arquivo é exatamente o
 * que a pessoa está vendo, sem uma segunda consulta que pudesse divergir.
 */
export function ExportCsvButton({
  nomeBase,
  colunas,
  linhas,
  disabled,
}: {
  /** Prefixo do arquivo: "Iniciativas" → iniciativas-2026-11-09.csv */
  nomeBase: string;
  colunas: string[];
  /** Chamada só no clique — não monta o CSV a cada render. */
  linhas: () => unknown[][];
  disabled?: boolean;
}) {
  function exportar() {
    const dados = linhas();
    const blob = new Blob([montarCsv(colunas, dados)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeDoArquivoCsv(nomeBase);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`${dados.length} ${dados.length === 1 ? "linha exportada" : "linhas exportadas"}.`);
  }

  return (
    <Button variant="secondary" size="md" onClick={exportar} disabled={disabled}>
      <Download size={16} />
      Exportar CSV
    </Button>
  );
}
