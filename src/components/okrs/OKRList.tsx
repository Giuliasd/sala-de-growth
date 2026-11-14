"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DetailModalLink } from "@/components/shared/DetailModal";
import { Target, ChevronDown, Plus, Pencil, Trash2, ClipboardList, FlaskConical, Unlink } from "lucide-react";
import { OKRCard } from "./OKRCard";
import { OKRForm } from "./OKRForm";
import { ObjetivoForm } from "./ObjetivoForm";
import { deleteObjetivo } from "@/actions/objetivos";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { CardHeader } from "@/components/shared/CardHeader";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { isStale, paceStatus, quarterElapsedPercent } from "@/lib/okr";
import { MetaDivider } from "@/components/shared/DetailMeta";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MemberChips } from "@/components/shared/MemberChips";
import { MultiSelect } from "@/components/shared/MultiSelect";
import type { getObjetivosComRelogio } from "@/actions/objetivos";
import type { getUnlinkedItems } from "@/actions/okrs";

type QuarterItem = {
  id: string;
  year: number;
  quarter: number;
  isActive: boolean;
};

type FrenteItem = { id: string; name: string; isActive: boolean };
type MemberItem = { id: string; name: string };

type ObjetivoItem = {
  id: string;
  quarterId: string;
  title: string;
  description: string | null;
  order: number;
  // KRs (modelo OKR) com tudo que o card precisa — o formato vem da action, para
  // o tipo acompanhar o que ela devolve (um `any[]` escondeu o `item.member`
  // que não existe mais, no bloco de itens sem KR).
  krs: KRItem[];
};

type KRItem = Awaited<ReturnType<typeof getObjetivosComRelogio>>["objetivos"][number]["krs"][number];
type UnlinkedItems = Awaited<ReturnType<typeof getUnlinkedItems>>;

interface OKRListProps {
  quarters: QuarterItem[];
  frentes: FrenteItem[];
  objetivos: ObjetivoItem[];
  members: MemberItem[];
  selectedQuarterId: string | null;
  // Instante do render, vindo do servidor: mantém o cálculo de ritmo igual nos
  // dois lados da hidratação.
  nowMs: number;
  // Visitante vê, mas não cria/edita/exclui: a tela esconde esses botões.
  podeEditar: boolean;
  unlinkedItems: UnlinkedItems;
}

export function OKRList({
  quarters,
  frentes,
  objetivos,
  members,
  selectedQuarterId,
  unlinkedItems,
  nowMs,
  podeEditar,
}: OKRListProps) {
  const router = useRouter();
  const [currentQuarterId, setCurrentQuarterId] = useState(selectedQuarterId ?? "");
  const [isAddingObjetivo, setIsAddingObjetivo] = useState(false);
  const [editingObjetivo, setEditingObjetivo] = useState<ObjetivoItem | null>(null);
  const [deletingObjetivo, setDeletingObjetivo] = useState<ObjetivoItem | null>(null);
  const [krForObjetivo, setKrForObjetivo] = useState<{ id: string; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleQuarterChange(quarterId: string) {
    setCurrentQuarterId(quarterId);
    setIsAddingObjetivo(false);
    router.push(`/okrs?quarter=${quarterId}`);
  }

  async function handleDeleteObjetivo() {
    if (!deletingObjetivo) return;
    setDeleteError(null);
    const res = await deleteObjetivo(deletingObjetivo.id);
    if (res.success) {
      setDeletingObjetivo(null);
    } else {
      setDeleteError(res.error);
    }
  }

  const activeFrentes = frentes.filter((f) => f.isActive);
  const hasUnlinked = unlinkedItems.iniciativas.length > 0 || unlinkedItems.experimentos.length > 0;

  // ── Acompanhamento do quarter ─────────────────────────────────────────────
  // A régua é o tempo decorrido: sem ela, ler KR por KR é a única forma de
  // saber se o quarter está indo bem.
  const [ordem, setOrdem] = useState<"objetivo" | "risco">("objetivo");
  const agora = new Date(nowMs);

  const todosKRs = objetivos.flatMap((o) => o.krs);
  const estadoDoKR = new Map<string, { pace: ReturnType<typeof paceStatus>; parado: boolean }>();
  for (const kr of todosKRs) {
    const decorrido = quarterElapsedPercent(kr.quarter.startDate, kr.quarter.endDate, agora);
    estadoDoKR.set(kr.id, {
      pace: paceStatus(kr.progressPercent, decorrido),
      parado: isStale(kr.lastUpdatedAt, 14, agora),
    });
  }
  const resumo = {
    total: todosKRs.length,
    noRitmo: todosKRs.filter((k) => estadoDoKR.get(k.id)?.pace !== "atrasado").length,
    atrasados: todosKRs.filter((k) => estadoDoKR.get(k.id)?.pace === "atrasado").length,
    parados: todosKRs.filter((k) => estadoDoKR.get(k.id)?.parado).length,
  };

  /** Atrasados primeiro, depois parados, depois o resto — para a reunião. */
  function porRisco(a: { id: string }, b: { id: string }) {
    const peso = (id: string) => {
      const e = estadoDoKR.get(id);
      if (!e) return 0;
      return (e.pace === "atrasado" ? 2 : 0) + (e.parado ? 1 : 0);
    };
    return peso(b.id) - peso(a.id);
  }

  return (
    // Ritmo de /iniciativas: 32px entre o cabeçalho e o conteúdo (o pb-2
    // abaixo) e 24px entre os blocos.
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            OKRs
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Objetivos do quarter e seus resultados-chave (KRs)
          </p>
        </div>

        {/* Só a ação de criar no topo: o quarter é filtro e mora na barra
            abaixo, como no /roadmap. */}
        <div className="flex items-center gap-3">
          {currentQuarterId && podeEditar && (
            <Button variant="primary" size="md" onClick={() => setIsAddingObjetivo(true)}>
              <Target size={16} />
              Novo objetivo
            </Button>
          )}
        </div>
      </div>

      {/* ── Create objetivo modal ────────────────────── */}
      {isAddingObjetivo && currentQuarterId && (
        <ObjetivoForm
          quarterId={currentQuarterId}
          onSuccess={() => {
            setIsAddingObjetivo(false);
          }}
          onCancel={() => setIsAddingObjetivo(false)}
        />
      )}

      {/* ── Edit objetivo modal ──────────────────────── */}
      {editingObjetivo && (
        <ObjetivoForm
          quarterId={editingObjetivo.quarterId}
          objetivo={{
            id: editingObjetivo.id,
            title: editingObjetivo.title,
            description: editingObjetivo.description,
          }}
          onSuccess={() => {
            setEditingObjetivo(null);
          }}
          onCancel={() => setEditingObjetivo(null)}
        />
      )}

      {/* ── Create KR modal ──────────────────────────── */}
      {krForObjetivo && (
        <OKRForm
          frentes={activeFrentes}
          members={members}
          selectedQuarterId={currentQuarterId}
          objetivoId={krForObjetivo.id}
          objetivoTitle={krForObjetivo.title}
          onSuccess={() => {
            setKrForObjetivo(null);
          }}
          onCancel={() => setKrForObjetivo(null)}
        />
      )}

      {/* ── Content ──────────────────────────────────── */}
      {/* Barra do quarter: o filtro de quarter (o mesmo componente dos filtros
          do /roadmap) e, quando há KRs, o resumo — evita ler card por card
          para achar o que dói. Sempre visível: antes o card só existia com
          KRs, e com o quarter dentro dele um quarter vazio deixaria a pessoa
          sem como trocar. */}
      <Card className="flex items-center gap-4 flex-wrap" padding="12px 16px">
        {/* Obrigatório: clicar no quarter já escolhido só fecha o menu — o
            `single` do MultiSelect limparia a seleção. */}
        <MultiSelect
          single
          label="Quarter"
          selected={currentQuarterId ? [currentQuarterId] : []}
          onChange={(next) => {
            if (next[0]) handleQuarterChange(next[0]);
          }}
          options={quarters.map((q) => ({
            value: q.id,
            label: `Q${q.quarter} ${q.year}${q.isActive ? " (ativo)" : ""}`,
          }))}
        />
        {resumo.total > 0 && (
        <>
          <MetaDivider />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{resumo.noRitmo}</strong> no ritmo
          </span>
          <MetaDivider />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: resumo.atrasados > 0 ? "var(--status-late-text)" : "var(--text-primary)" }}>
              {resumo.atrasados}
            </strong>{" "}
            atrasado{resumo.atrasados === 1 ? "" : "s"}
          </span>
          <MetaDivider />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: resumo.parados > 0 ? "var(--butter-strong)" : "var(--text-primary)" }}>
              {resumo.parados}
            </strong>{" "}
            sem atualização
          </span>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Ordenar KRs por
            </span>
            <SegmentedToggle
              ariaLabel="Ordenação dos KRs"
              value={ordem}
              onChange={(v) => setOrdem(v as "objetivo" | "risco")}
              items={[
                { value: "objetivo", label: "Objetivo" },
                { value: "risco", label: "Risco" },
              ]}
            />
          </div>
        </>
        )}
      </Card>

      {!currentQuarterId ? (
        <Card padding={0}>
          <EmptyState
            icon={Target}
            title="Selecione um quarter"
            description="Escolha um quarter para visualizar os objetivos"
          />
        </Card>
      ) : objetivos.length === 0 ? (
        <Card padding={0}>
          <EmptyState
            icon={Target}
            title="Nenhum objetivo cadastrado"
            description="Comece criando o primeiro objetivo do quarter"
            action={podeEditar ? { label: "Criar objetivo", onClick: () => setIsAddingObjetivo(true) } : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {objetivos.map((objetivo) => {
            const krs = ordem === "risco" ? [...objetivo.krs].sort(porRisco) : objetivo.krs;
            const noRitmoDoObjetivo = krs.filter(
              (k) => estadoDoKR.get(k.id)?.pace !== "atrasado"
            ).length;
            const avgProgress =
              krs.length > 0
                ? krs.reduce((sum, k) => sum + k.progressPercent, 0) / krs.length
                : 0;
            const avgClamped = Math.min(100, Math.max(0, avgProgress));

            // Mesma escala das barras dos KRs (ProgressBar variant="dynamic").
            let avgColorClass = "bg-progress-good";
            if (avgClamped <= 33) avgColorClass = "bg-peach";
            else if (avgClamped <= 66) avgColorClass = "bg-butter";

            return (
              <Card key={objetivo.id} padding="20px 24px">
                {/* Objetivo header — mesmo padrão do card "Precisa de você" do
                    dashboard: IconTile + título + subtítulo. */}
                <CardHeader
                  className="mb-4"
                  icon={Target}
                  title={objetivo.title}
                  badge={`${krs.length} KR${krs.length !== 1 ? "s" : ""}`}
                  subtitle={objetivo.description}
                  actions={
                    <>
                    {/* Mini progress + % */}
                    <div className="flex items-center gap-2">
                      <div className="w-[60px] h-1.5 rounded-full bg-line overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ease-in-out ${avgColorClass}`}
                          style={{ width: `${avgClamped}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-bold font-mono tabular-nums ${
                          avgClamped <= 33 ? "text-[var(--status-late-text)]" : avgClamped <= 66 ? "text-[var(--progress-mid-text)]" : "text-forest"
                        }`}
                        style={{ minWidth: 36, textAlign: "right" }}
                      >
                        {avgProgress.toFixed(0)}%
                      </span>
                      {/* A média engana: dois KRs em 90% e dois em 10% dão os
                          mesmos 50% de um objetivo inteiro no meio. */}
                      <span
                        className="text-xs whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}
                        data-tooltip="KRs que não estão atrasados em relação ao tempo decorrido"
                      >
                        {noRitmoDoObjetivo} de {krs.length} no ritmo
                      </span>
                    </div>

                    {podeEditar && (
                      <>
                        <IconButton
                          boxSize={32}
                          onClick={() => setEditingObjetivo(objetivo)}
                          title="Editar objetivo"
                          aria-label="Editar objetivo"
                        >
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton
                          boxSize={32}
                          onClick={() => { setDeleteError(null); setDeletingObjetivo(objetivo); }}
                          title="Excluir objetivo"
                          aria-label="Excluir objetivo"
                          className="icon-btn--danger"
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </>
                    )}
                    </>
                  }
                />

                {/* KR cards */}
                {krs.length > 0 ? (
                  <div className="space-y-3">
                    {krs.map((kr) => (
                      <OKRCard key={kr.id} okr={kr} members={members} nowMs={nowMs} />
                    ))}
                  </div>
                ) : (
                  <div
                    className="p-4 text-center border rounded-xl"
                    style={{ borderColor: "var(--border-subtle)", borderStyle: "dashed" }}
                  >
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Nenhum KR neste objetivo ainda.
                    </p>
                  </div>
                )}

                {/* Novo KR */}
                {podeEditar && (
                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setKrForObjetivo({ id: objetivo.id, title: objetivo.title })}
                    >
                      <Plus size={14} />
                      Novo KR
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}

          {/* ── Unlinked items section ───────────────────── */}
          {hasUnlinked && (
            <div className="pt-8 border-t border-dashed" style={{ borderColor: "var(--border-subtle)" }}>
              <CardHeader
                className="mb-4"
                icon={Unlink}
                title="Itens sem KR vinculado"
                badge={`${unlinkedItems.iniciativas.length + unlinkedItems.experimentos.length} itens`}
              />

              <div className="space-y-2">
                {[...unlinkedItems.iniciativas.map((i) => ({ ...i, type: "iniciativa" as const })),
                  ...unlinkedItems.experimentos.map((e) => ({ ...e, type: "experimento" as const }))
                ].map((item) => (
                  <DetailModalLink
                    key={item.id}
                    id={item.id}
                    type={item.type}
                    className="list-row group flex items-center justify-between w-full"
                    style={{
                      background: "var(--bg-surface)",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "var(--shadow-sm)",
                      border: "1px solid var(--border-subtle)",
                      // Inline (não p-3): o reset interno do DetailModalLink usa
                      // padding:0 inline, que venceria a classe.
                      padding: 12,
                    }}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="shrink-0">
                        {item.type === "iniciativa" ? (
                          <ClipboardList size={18} style={{ color: "var(--sky-strong)" }} />
                        ) : (
                          <FlaskConical size={18} style={{ color: "var(--peach-strong)" }} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {item.name}
                          </span>
                          <span
                            className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                            style={{ background: "var(--bg-app)", color: "var(--text-muted)" }}
                          >
                            {item.type === "iniciativa" ? "Iniciativa" : "Experimento"}
                          </span>
                          {item.frente && (
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              • {item.frente.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <StatusBadge status={item.status} type={item.type} />
                      <MemberChips members={item.members} />
                    </div>
                  </DetailModalLink>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Delete objetivo confirm ──────────────────── */}
      {deletingObjetivo && (
        <ConfirmDialog
          title="Excluir objetivo"
          message={
            deleteError
              ? deleteError
              : `Excluir o objetivo "${deletingObjetivo.title}"? Esta ação não pode ser desfeita.`
          }
          confirmLabel="Excluir"
          onConfirm={handleDeleteObjetivo}
          onCancel={() => { setDeletingObjetivo(null); setDeleteError(null); }}
        />
      )}
    </div>
  );
}
