"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/shared/Modal";
import { IconButton } from "@/components/shared/IconButton";
import { Field, Input } from "@/components/shared/Field";
import { Button } from "@/components/shared/Button";
import { MemberPicker } from "@/components/shared/MemberPicker";
import { Alert } from "@/components/shared/Alert";
import type { ItemParaCalendario } from "@/actions/calendario";
import { TIPOS_DE_EVENTO, type TipoDeEvento } from "@/lib/calendario";
import { casaComBusca, normalizarBusca } from "@/lib/busca";
import { criarData } from "./gravar";
import { ITEM_CONFIG, TIPO_CONFIG, rotuloCurto } from "./tipos";

/** Quantos itens a lista mostra antes de pedir para refinar a busca. */
const MAX_ITENS = 8;

/**
 * Nova data num dia do calendário: comunicação ou marco viram um checkpoint
 * novo do item escolhido; lançamento e análise gravam a data do item (se ele
 * já tinha, a tela avisa que a data muda). Grava pelas actions de sempre —
 * ver `gravar.ts`.
 */
export function NovaDataModal({
  data,
  itens,
  carregandoItens,
  responsaveis,
  euId,
  onClose,
  onCriado,
}: {
  data: string;
  /** `null` enquanto a lista de itens carrega. */
  itens: ItemParaCalendario[] | null;
  carregandoItens: boolean;
  responsaveis: { id: string; name: string }[];
  euId: string;
  onClose: () => void;
  onCriado: (mensagem: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoDeEvento>("COMUNICACAO");
  const [busca, setBusca] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>(() =>
    responsaveis.some((m) => m.id === euId) ? [euId] : []
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ehCheckpoint = tipo === "COMUNICACAO" || tipo === "MARCO";
  const item = itens?.find((i) => i.id === itemId) ?? null;

  const encontrados = useMemo(() => {
    const termo = normalizarBusca(busca);
    return (itens ?? []).filter((i) => !termo || casaComBusca(termo, i.nome, i.frente));
  }, [itens, busca]);

  // Lançamento/análise já marcados no item: a data vai mudar, não somar.
  const dataAtualDoItem = item ? (tipo === "LANCAMENTO" ? item.launchDate : tipo === "ANALISE" ? item.analysisDate : null) : null;

  const podeSalvar = !!item && (!ehCheckpoint || nome.trim().length > 0) && !salvando;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !podeSalvar) return;
    setSalvando(true);
    setErro(null);
    const res = await criarData({ tipo, item: { id: item.id, tipo: item.tipo }, data, nome, memberIds });
    setSalvando(false);
    if (!res.success) {
      setErro(res.error);
      return;
    }
    const dia = rotuloCurto(data);
    const mensagens: Record<TipoDeEvento, string> = {
      COMUNICACAO: `Comunicação criada em ${dia}`,
      MARCO: `Marco criado em ${dia}`,
      LANCAMENTO: `Lançamento de "${item.nome}" marcado para ${dia}`,
      ANALISE: `Análise de "${item.nome}" marcada para ${dia}`,
    };
    onCriado(mensagens[tipo]);
  }

  return (
    <Modal open onClose={onClose} maxWidth={520} labelledBy="nova-data-titulo">
      <div className="flex items-center justify-between mb-5">
        <h2 id="nova-data-titulo" className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Nova data em {rotuloCurto(data)}
        </h2>
        <IconButton boxSize={32} onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </IconButton>
      </div>

      <form onSubmit={salvar} className="space-y-5">
        <Field label="Tipo">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de data">
            {TIPOS_DE_EVENTO.map((t) => {
              const cfg = TIPO_CONFIG[t];
              const Icon = cfg.icon;
              const ativo = tipo === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => setTipo(t)}
                  className="px-2.5 py-1 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  style={{
                    borderRadius: "var(--radius-full)",
                    border: `1px solid ${ativo ? cfg.accent : "var(--border-default)"}`,
                    background: ativo ? cfg.soft : "var(--bg-app)",
                    color: ativo ? cfg.text : "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  <Icon size={11} strokeWidth={2} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={ehCheckpoint ? "De qual iniciativa ou experimento" : "Iniciativa ou experimento"}>
          {item ? (
            <div
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--bg-app)" }}
            >
              <ItemLinha item={item} />
              <button
                type="button"
                onClick={() => setItemId(null)}
                className="text-xs font-medium shrink-0"
                style={{ color: "var(--brand-primary)", background: "none", border: "none", cursor: "pointer" }}
              >
                Trocar
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input
                type="search"
                placeholder="Buscar pelo nome…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoFocus
                aria-label="Buscar iniciativa ou experimento"
              />
              <div
                className="max-h-56 overflow-y-auto"
                style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}
              >
                {carregandoItens || itens === null ? (
                  <p className="text-xs px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    Carregando…
                  </p>
                ) : encontrados.length === 0 ? (
                  <p className="text-xs px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    Nenhum item em aberto com esse nome.
                  </p>
                ) : (
                  <ul>
                    {encontrados.slice(0, MAX_ITENS).map((i, idx) => (
                      <li key={`${i.tipo}:${i.id}`} style={{ borderTop: idx === 0 ? undefined : "1px solid var(--border-subtle)" }}>
                        <button
                          type="button"
                          onClick={() => setItemId(i.id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent-subtle)]"
                          style={{ background: "none", border: "none", cursor: "pointer" }}
                        >
                          <ItemLinha item={i} />
                        </button>
                      </li>
                    ))}
                    {encontrados.length > MAX_ITENS && (
                      <li className="text-xs px-3 py-2" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}>
                        +{encontrados.length - MAX_ITENS} itens — refine a busca
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Field>

        {ehCheckpoint ? (
          <>
            <Field label="Nome">
              <Input
                type="text"
                placeholder={tipo === "COMUNICACAO" ? "E-mail de aviso aos lojistas" : "Go/no-go do lançamento"}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={200}
                required
              />
            </Field>
            <Field label="Responsáveis">
              <MemberPicker members={responsaveis} value={memberIds} onChange={setMemberIds} />
            </Field>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Vira um checkpoint de {TIPO_CONFIG[tipo].label.toLowerCase()} do item, com prazo em {rotuloCurto(data)}.
            </p>
          </>
        ) : (
          item && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {dataAtualDoItem
                ? dataAtualDoItem === data
                  ? `${TIPO_CONFIG[tipo].label} já está marcado para este dia.`
                  : `${TIPO_CONFIG[tipo].label} hoje está em ${rotuloCurto(dataAtualDoItem)} e passa para ${rotuloCurto(data)}.`
                : `O item ainda não tem data de ${TIPO_CONFIG[tipo].label.toLowerCase()}; ela fica em ${rotuloCurto(data)}.`}
            </p>
          )
        )}

        {erro && <Alert variant="danger">{erro}</Alert>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!podeSalvar}>
            {salvando ? "Salvando…" : ehCheckpoint ? "Criar" : "Salvar data"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ItemLinha({ item }: { item: ItemParaCalendario }) {
  const cfg = ITEM_CONFIG[item.tipo];
  const Icon = cfg.icon;
  return (
    <span className="flex items-center gap-2 min-w-0">
      <Icon size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} aria-label={cfg.label} />
      <span className="truncate" style={{ color: "var(--text-primary)" }}>
        {item.nome}
      </span>
      <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
        {item.frente}
      </span>
    </span>
  );
}
