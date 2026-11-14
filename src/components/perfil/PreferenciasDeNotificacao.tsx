"use client";

import { useState } from "react";
import { salvarPreferenciasDeNotificacao } from "@/actions/notificacoes";
import { TIPOS_DE_AVISO, type TipoDaNotificacao } from "@/lib/notificacoes";
import { acaoSegura } from "@/lib/acao-segura";

/**
 * Quais avisos a pessoa quer receber. Cada interruptor grava na hora; o que fica
 * desligado deixa de ser criado (não aparece nem no sino nem na lista).
 */
export function PreferenciasDeNotificacao({ silenciadas }: { silenciadas: TipoDaNotificacao[] }) {
  const [desligados, setDesligados] = useState<TipoDaNotificacao[]>(silenciadas);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function alternar(tipo: TipoDaNotificacao, receber: boolean) {
    if (salvando) return;
    const anterior = desligados;
    const proximo = receber ? desligados.filter((t) => t !== tipo) : [...desligados, tipo];
    setDesligados(proximo);
    setErro(null);
    setSalvando(true);
    const res = await acaoSegura(salvarPreferenciasDeNotificacao(proximo));
    setSalvando(false);
    if (!res.success) {
      setDesligados(anterior);
      setErro(res.error);
    }
  }

  return (
    <div>
      <ul className="space-y-1">
        {TIPOS_DE_AVISO.map(({ tipo, titulo, descricao }) => {
          const recebe = !desligados.includes(tipo);
          return (
            <li key={tipo}>
              <label
                className="flex items-start gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-[var(--accent-subtle)]"
              >
                <input
                  type="checkbox"
                  checked={recebe}
                  disabled={salvando}
                  onChange={(e) => void alternar(tipo, e.target.checked)}
                  className="mt-1 shrink-0"
                  style={{ accentColor: "var(--brand-primary)", width: 16, height: 16 }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {titulo}
                  </span>
                  <span className="block text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {descricao}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {erro && (
        <p role="alert" className="text-xs mt-2" style={{ color: "var(--status-error-text)" }}>
          {erro}
        </p>
      )}
    </div>
  );
}
