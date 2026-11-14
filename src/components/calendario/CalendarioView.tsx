"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  LayoutGrid,
  List,
  Lock,
  Plus,
  User,
  UserX,
} from "lucide-react";
import { getEventosDoCalendario, getItensParaCalendario, type CalendarioDoMes, type ItemParaCalendario } from "@/actions/calendario";
import { Alert } from "@/components/shared/Alert";
import { PageHeader } from "@/components/shared/PageHeader";
import { IconButton } from "@/components/shared/IconButton";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { FilterPill } from "@/components/shared/FilterPill";
import { Dropdown } from "@/components/shared/Dropdown";
import { EmptyState } from "@/components/shared/EmptyState";
import { MemberChips } from "@/components/shared/MemberChips";
import { DetailModal } from "@/components/shared/DetailModal";
import { toast } from "@/components/shared/Toast";
import {
  CursorTooltip,
  TooltipHint,
  TooltipLine,
  TooltipTitle,
  useCursorTooltip,
} from "@/components/shared/CursorTooltip";
import {
  agruparPorDia,
  alternarTipo,
  deslocarMes,
  filtrarEventos,
  filtrosParaUrl,
  formatMes,
  moverEvento,
  parseMes,
  semanasDaGrade,
  TIPOS_DE_EVENTO,
  toISODate,
  travasDoDia,
  type EventoDoCalendario,
  type FiltrosDoCalendario,
  type TipoDeEvento,
  type TipoDeItem,
  type TravaDoCalendario,
} from "@/lib/calendario";
import { formatMemberNames } from "@/lib/members";
import { moverData } from "./gravar";
import { NovaDataModal } from "./NovaDataModal";
import { ITEM_CONFIG, TIPO_CONFIG, rotuloAcessivel, rotuloCurto, rotuloDosConflitos } from "./tipos";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Eventos por célula antes do "+N mais" — mantém as semanas com altura parecida. */
const MAX_POR_DIA = 4;

/** Atraso tem uma cor só no produto (ver AGENTS.md, "Atraso e risco"). */
const COR_ATRASO = "var(--status-late-text)";

type Visao = "mes" | "lista";
type Opcao = { id: string; name: string };

function rotuloDoMes(ano: number, mes: number): string {
  const s = new Date(Date.UTC(ano, mes, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rotuloDoDia(iso: string): string {
  const s = new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function CalendarioView({
  mesInicial,
  inicial,
  hoje,
  visaoInicial,
  filtrosIniciais,
  frentes,
  members,
  responsaveis,
  eu,
}: {
  mesInicial: string;
  inicial: CalendarioDoMes;
  /** `YYYY-MM-DD` de hoje em São Paulo, vindo do servidor. */
  hoje: string;
  visaoInicial: Visao;
  /** Filtros lidos da URL (`tipos` como lista: Set não é o formato da prop). */
  filtrosIniciais: Omit<FiltrosDoCalendario, "tipos"> & { tipos: TipoDeEvento[] };
  frentes: Opcao[];
  members: Opcao[];
  /** Quem pode ser responsável por um checkpoint novo. */
  responsaveis: Opcao[];
  eu: { id: string; podeEditar: boolean };
}) {
  const [mes, setMes] = useState(mesInicial);
  const [visao, setVisao] = useState<Visao>(visaoInicial);
  // Cache por mês: voltar a um mês já visto não refaz a consulta. Mês ausente
  // da chave = carregando.
  const [porMes, setPorMes] = useState<Record<string, CalendarioDoMes>>({ [mesInicial]: inicial });
  const [erroNoMes, setErroNoMes] = useState<string | null>(null);
  const pedidos = useRef(new Set<string>());

  const [filtros, setFiltros] = useState<FiltrosDoCalendario>(() => ({
    ...filtrosIniciais,
    tipos: new Set(filtrosIniciais.tipos),
  }));
  const [diasAbertos, setDiasAbertos] = useState<Set<string>>(() => new Set());
  const [detalhe, setDetalhe] = useState<{ id: string; type: TipoDeItem; checkpointId: string | null } | null>(null);

  // Arrastar para outro dia.
  const [arrastando, setArrastando] = useState<EventoDoCalendario | null>(null);
  const [diaAlvo, setDiaAlvo] = useState<string | null>(null);

  // Nova data num dia. Os itens são lidos na primeira abertura e ficam em cache.
  const [novaEm, setNovaEm] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemParaCalendario[] | null>(null);
  const [carregandoItens, setCarregandoItens] = useState(false);

  const tip = useCursorTooltip<EventoDoCalendario>();

  const { ano, mes: mesIdx } = parseMes(mes) ?? parseMes(mesInicial)!;
  const dadosDoMes = porMes[mes];
  const eventosDoMes = dadosDoMes?.eventos;
  const travas: TravaDoCalendario[] = dadosDoMes?.travas ?? [];
  const carregando = dadosDoMes === undefined && erroNoMes !== mes;

  // Mês, visão e filtros vão para a URL (o link compartilhado abre igual), sem
  // navegação: o Next integra o history nativo ao roteador, e uma navegação de
  // verdade mostraria o esqueleto do loading.tsx a cada clique.
  useEffect(() => {
    const params = new URLSearchParams({ mes });
    if (visao === "lista") params.set("visao", "lista");
    filtrosParaUrl(filtros, params);
    const proxima = `?${params.toString()}`;
    if (window.location.search !== proxima) window.history.replaceState(null, "", proxima);
  }, [mes, visao, filtros]);

  function buscar(alvo: string, { forcar = false } = {}) {
    if (pedidos.current.has(alvo)) return;
    if (!forcar && alvo in porMes) return;
    pedidos.current.add(alvo);
    setErroNoMes((atual) => (atual === alvo ? null : atual));
    getEventosDoCalendario(alvo)
      .then((dados) => setPorMes((p) => ({ ...p, [alvo]: dados })))
      .catch(() => setErroNoMes(alvo))
      .finally(() => pedidos.current.delete(alvo));
  }

  /**
   * Depois de uma gravação (aqui ou no popup do item): relê o mês aberto por
   * trás — os dados de agora ficam na tela até a resposta — e esquece os
   * outros meses do cache, que podem ter mudado junto.
   */
  function recarregarMes() {
    setPorMes((p) => (mes in p ? { [mes]: p[mes] } : {}));
    buscar(mes, { forcar: true });
  }

  function irPara(alvo: string) {
    setMes(alvo);
    setDiasAbertos(new Set());
    buscar(alvo);
  }

  function abrirDetalhe(e: EventoDoCalendario) {
    tip.clear();
    setDetalhe({ id: e.item.id, type: e.item.tipo, checkpointId: e.checkpointId });
  }

  function fecharDetalhe() {
    setDetalhe(null);
    recarregarMes();
  }

  function abrirNova(dia: string) {
    tip.clear();
    setNovaEm(dia);
    if (itens === null && !carregandoItens) {
      setCarregandoItens(true);
      getItensParaCalendario()
        .then(setItens)
        .catch(() => toast("Não foi possível carregar os itens.", "error"))
        .finally(() => setCarregandoItens(false));
    }
  }

  async function mover(e: EventoDoCalendario, dia: string) {
    if (dia === e.data) return;
    const mesDoGesto = mes;
    const antes = porMes[mesDoGesto];
    if (!antes) return;
    // Otimista: o chip já aparece no dia novo enquanto o servidor grava.
    setPorMes((p) => ({
      ...p,
      [mesDoGesto]: { ...antes, eventos: antes.eventos.map((x) => (x.id === e.id ? moverEvento(x, dia, hoje) : x)) },
    }));
    const res = await moverData(e, dia);
    if (!res.success) {
      setPorMes((p) => ({ ...p, [mesDoGesto]: antes }));
      toast(res.error, "error");
      return;
    }
    const cfg = TIPO_CONFIG[e.tipo];
    toast(`${cfg.label} ${cfg.feminino ? "movida" : "movido"} para ${rotuloCurto(dia)}`);
    setItens(null); // datas do item mudaram: a lista do "nova data" relê
    recarregarMes();
  }

  function clicarNoTipo(t: TipoDeEvento) {
    setFiltros((f) => ({ ...f, tipos: alternarTipo(f.tipos, t) }));
  }

  const filtrados = useMemo(() => filtrarEventos(eventosDoMes ?? [], filtros), [eventosDoMes, filtros]);
  const porDia = useMemo(() => agruparPorDia(filtrados), [filtrados]);
  const semanas = useMemo(() => semanasDaGrade(ano, mesIdx), [ano, mesIdx]);

  // Contagens do mês (sem os dias de borda da grade): por tipo com os demais
  // filtros aplicados, para o número da pill bater com o que se vê; e de
  // atrasados com todos os filtros menos o próprio.
  const prefixoDoMes = `${formatMes(ano, mesIdx)}-`;
  const contagem = useMemo(() => {
    const doMes = (f: FiltrosDoCalendario) =>
      filtrarEventos(eventosDoMes ?? [], f).filter((e) => e.data.startsWith(prefixoDoMes));
    const porTipo = Object.fromEntries(TIPOS_DE_EVENTO.map((t) => [t, 0])) as Record<TipoDeEvento, number>;
    for (const e of doMes({ ...filtros, tipos: new Set(TIPOS_DE_EVENTO) })) porTipo[e.tipo]++;
    const atrasados = doMes({ ...filtros, soAtrasados: true }).length;
    return { porTipo, atrasados };
  }, [eventosDoMes, filtros, prefixoDoMes]);

  const diasDaLista = useMemo(
    () => [...porDia.entries()].filter(([dia]) => dia.startsWith(prefixoDoMes)),
    [porDia, prefixoDoMes]
  );
  const totalNoMes = diasDaLista.reduce((n, [, evs]) => n + evs.length, 0);

  const anterior = deslocarMes(ano, mesIdx, -1);
  const seguinte = deslocarMes(ano, mesIdx, 1);
  const mesDeHoje = hoje.slice(0, 7);
  const filtroLigado =
    filtros.tipos.size < TIPOS_DE_EVENTO.length ||
    filtros.tipoDeItem !== "todos" ||
    !!filtros.frenteId ||
    !!filtros.memberId ||
    filtros.soAtrasados;
  const soOsMeus = filtros.memberId === eu.id;
  const todosOsTipos = filtros.tipos.size === TIPOS_DE_EVENTO.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendário"
        description="Lançamentos, análises de resultados, comunicações e marcos de iniciativas e experimentos."
      >
        <SegmentedToggle
          ariaLabel="Visualização"
          value={visao}
          onChange={(v) => setVisao(v as Visao)}
          items={[
            { value: "mes", label: "Mês", icon: LayoutGrid },
            { value: "lista", label: "Lista", icon: List },
          ]}
        />
      </PageHeader>

      {/* Navegação do mês */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <IconButton aria-label="Mês anterior" onClick={() => irPara(formatMes(anterior.ano, anterior.mes))}>
            <ChevronLeft size={16} />
          </IconButton>
          <h2
            className="text-base font-semibold min-w-[160px] text-center"
            style={{ color: "var(--text-primary)" }}
            aria-live="polite"
          >
            {rotuloDoMes(ano, mesIdx)}
          </h2>
          <IconButton aria-label="Mês seguinte" onClick={() => irPara(formatMes(seguinte.ano, seguinte.mes))}>
            <ChevronRight size={16} />
          </IconButton>
          {mes !== mesDeHoje && (
            <button
              type="button"
              onClick={() => irPara(mesDeHoje)}
              className="text-xs font-medium px-2 py-1 transition-colors ml-1"
              style={{
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-full)",
                background: "var(--bg-surface)",
                cursor: "pointer",
              }}
            >
              Hoje
            </button>
          )}
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {carregando
            ? "Carregando…"
            : totalNoMes === 0
              ? "Nenhuma data neste mês"
              : `${totalNoMes} ${totalNoMes === 1 ? "data" : "datas"} neste mês`}
          {eu.podeEditar && visao === "mes" && " · arraste para mudar a data, + no dia para criar"}
        </span>
      </div>

      {/* Filtros — as pills de tipo também são a legenda das cores. */}
      <div className="flex items-center gap-2 flex-wrap">
        {TIPOS_DE_EVENTO.map((t) => {
          const cfg = TIPO_CONFIG[t];
          const Icon = cfg.icon;
          const ativo = filtros.tipos.has(t);
          return (
            <FilterPill
              key={t}
              active={ativo}
              onClick={() => clicarNoTipo(t)}
              icon={<Icon size={12} strokeWidth={2} style={{ color: ativo ? cfg.text : undefined }} />}
              colors={{ bg: cfg.soft, text: cfg.text, border: cfg.accent }}
              // Com todos à vista o clique isola o tipo (ver `alternarTipo`).
              ariaLabel={
                todosOsTipos
                  ? `Mostrar só ${cfg.plural.toLowerCase()}`
                  : `${ativo ? "Ocultar" : "Mostrar"} ${cfg.plural.toLowerCase()}`
              }
            >
              {cfg.plural}
              <span className="tabular-nums" style={{ opacity: 0.7 }}>
                {carregando ? "" : contagem.porTipo[t]}
              </span>
            </FilterPill>
          );
        })}
        <FilterPill
          active={filtros.soAtrasados}
          onClick={() => setFiltros((f) => ({ ...f, soAtrasados: !f.soAtrasados }))}
          icon={<AlertCircle size={12} strokeWidth={2} style={{ color: COR_ATRASO }} />}
          colors={{ bg: "var(--peach-soft)", text: "var(--peach-strong)", border: "var(--peach)" }}
          ariaLabel={filtros.soAtrasados ? "Mostrar todas as datas" : "Mostrar só as atrasadas"}
        >
          Só atrasados
          <span className="tabular-nums" style={{ opacity: 0.7 }}>
            {carregando ? "" : contagem.atrasados}
          </span>
        </FilterPill>
        <FilterPill
          active={soOsMeus}
          onClick={() => setFiltros((f) => ({ ...f, memberId: f.memberId === eu.id ? "" : eu.id }))}
          icon={<User size={12} strokeWidth={2} />}
          ariaLabel={soOsMeus ? "Mostrar de todo mundo" : "Mostrar só as datas em que sou responsável"}
        >
          Só os meus
        </FilterPill>

        <span className="mx-1 h-5 w-px" style={{ background: "var(--border-default)" }} aria-hidden="true" />

        <SegmentedToggle
          ariaLabel="Tipo de item"
          value={filtros.tipoDeItem}
          onChange={(v) => setFiltros((f) => ({ ...f, tipoDeItem: v as "todos" | TipoDeItem }))}
          items={[
            { value: "todos", label: "Todos" },
            { value: "iniciativa", label: "Iniciativas", icon: ClipboardList },
            { value: "experimento", label: "Experimentos", icon: FlaskConical },
          ]}
        />
        <Dropdown
          label="Frente"
          value={filtros.frenteId}
          onChange={(v) => setFiltros((f) => ({ ...f, frenteId: v }))}
          options={[{ value: "", label: "Todas" }, ...frentes.map((fr) => ({ value: fr.id, label: fr.name }))]}
        />
        <Dropdown
          label="Responsável"
          value={filtros.memberId}
          onChange={(v) => setFiltros((f) => ({ ...f, memberId: v }))}
          options={[{ value: "", label: "Todos" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
        />
        {filtroLigado && (
          <button
            type="button"
            onClick={() =>
              setFiltros({ tipos: new Set(TIPOS_DE_EVENTO), tipoDeItem: "todos", frenteId: "", memberId: "", soAtrasados: false })
            }
            className="text-xs font-medium"
            style={{ color: "var(--brand-primary)", background: "none", border: "none", cursor: "pointer" }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {erroNoMes === mes && (
        <Alert
          variant="danger"
          action={
            <button
              type="button"
              className="text-xs font-semibold underline"
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
              onClick={() => buscar(mes, { forcar: true })}
            >
              Tentar de novo
            </button>
          }
        >
          Não foi possível carregar as datas deste mês.
        </Alert>
      )}

      <div style={{ opacity: carregando ? 0.5 : 1, transition: "opacity 120ms" }} aria-busy={carregando}>
        {visao === "mes" ? (
          <div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="text-[11px] font-semibold uppercase tracking-wide text-center py-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {semanas.map((semana) => (
                <div
                  key={toISODate(semana[0])}
                  className="grid"
                  style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}
                >
                  {semana.map((dia) => {
                    const iso = toISODate(dia);
                    const doDia = porDia.get(iso) ?? [];
                    const foraDoMes = dia.getUTCMonth() !== mesIdx;
                    const isHoje = iso === hoje;
                    const aberto = diasAbertos.has(iso);
                    const visiveis = aberto ? doDia : doDia.slice(0, MAX_POR_DIA);
                    const ocultos = doDia.length - visiveis.length;
                    const travasAqui = travasDoDia(travas, iso);
                    const ehAlvo = arrastando !== null && diaAlvo === iso && arrastando.data !== iso;
                    return (
                      <div
                        key={iso}
                        className="group flex flex-col gap-1 min-w-0"
                        onDragOver={
                          arrastando
                            ? (ev) => {
                                ev.preventDefault();
                                ev.dataTransfer.dropEffect = "move";
                                if (diaAlvo !== iso) setDiaAlvo(iso);
                              }
                            : undefined
                        }
                        onDrop={
                          arrastando
                            ? (ev) => {
                                ev.preventDefault();
                                const e = arrastando;
                                setArrastando(null);
                                setDiaAlvo(null);
                                void mover(e, iso);
                              }
                            : undefined
                        }
                        style={{
                          minHeight: 112,
                          padding: 4,
                          background: ehAlvo
                            ? "var(--accent-subtle)"
                            : isHoje
                              ? "var(--butter-soft)"
                              : foraDoMes
                                ? "transparent"
                                : "var(--bg-surface)",
                          border: `1px ${ehAlvo ? "dashed var(--brand-primary)" : `solid ${isHoje ? "var(--butter)" : "var(--border-subtle)"}`}`,
                          borderRadius: "var(--radius-md)",
                          opacity: foraDoMes ? 0.5 : 1,
                        }}
                      >
                        <div className="flex items-center justify-between gap-1 px-0.5 min-w-0" style={{ height: 18 }}>
                          <span
                            className="text-[11px] font-semibold shrink-0"
                            style={{ color: isHoje ? "var(--text-primary)" : "var(--text-muted)" }}
                          >
                            {dia.getUTCDate()}
                            {isHoje && <span className="sr-only"> (hoje)</span>}
                          </span>
                          {travasAqui.length > 0 && (
                            <span
                              className="text-[10px] font-medium inline-flex items-center gap-0.5 min-w-0"
                              style={{ color: "var(--butter-strong)" }}
                              data-tooltip={`Trava de férias: ${travasAqui.map((t) => t.nome).join(", ")}`}
                            >
                              <Lock size={9} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                              <span className="truncate">{travasAqui[0].nome}</span>
                              <span className="sr-only">(trava de férias)</span>
                            </span>
                          )}
                          {eu.podeEditar && (
                            <button
                              type="button"
                              onClick={() => abrirNova(iso)}
                              aria-label={`Nova data em ${rotuloCurto(iso)}`}
                              data-tooltip="Nova data neste dia"
                              className="ml-auto shrink-0 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: "var(--radius-sm)",
                                color: "var(--text-secondary)",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                              }}
                            >
                              <Plus size={13} />
                            </button>
                          )}
                        </div>
                        {visiveis.map((e) => (
                          <ChipDoEvento
                            key={e.id}
                            evento={e}
                            arrastavel={eu.podeEditar}
                            arrastando={arrastando?.id === e.id}
                            onClick={() => abrirDetalhe(e)}
                            onDragStart={() => {
                              tip.clear();
                              setArrastando(e);
                            }}
                            onDragEnd={() => {
                              setArrastando(null);
                              setDiaAlvo(null);
                            }}
                            bind={tip.bind}
                          />
                        ))}
                        {(ocultos > 0 || aberto) && doDia.length > MAX_POR_DIA && (
                          <button
                            type="button"
                            onClick={() =>
                              setDiasAbertos((atual) => {
                                const prox = new Set(atual);
                                if (prox.has(iso)) prox.delete(iso);
                                else prox.add(iso);
                                return prox;
                              })
                            }
                            className="text-[11px] font-medium text-left px-1"
                            style={{ color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer" }}
                          >
                            {aberto ? "Mostrar menos" : `+${ocultos} mais`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : diasDaLista.length === 0 ? (
          carregando ? null : (
            <EmptyState
              icon={CalendarDays}
              title="Nenhuma data neste mês"
              description={
                filtroLigado
                  ? "Nenhum evento com os filtros escolhidos. Ajuste os filtros ou mude de mês."
                  : "Nenhum lançamento, análise, comunicação ou marco cai neste mês."
              }
            />
          )
        ) : (
          <div className="space-y-5">
            {diasDaLista.map(([dia, evs]) => {
              const isHoje = dia === hoje;
              const passou = dia < hoje;
              const travasAqui = travasDoDia(travas, dia);
              return (
                <section key={dia} aria-label={rotuloDoDia(dia)}>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-2 flex-wrap"
                    style={{ color: passou ? "var(--text-muted)" : "var(--text-secondary)" }}
                  >
                    {rotuloDoDia(dia)}
                    {isHoje && (
                      <span
                        className="normal-case tracking-normal text-[11px] font-semibold px-1.5 py-0.5"
                        style={{
                          background: "var(--butter-soft)",
                          color: "var(--butter-strong)",
                          borderRadius: "var(--radius-full)",
                        }}
                      >
                        Hoje
                      </span>
                    )}
                    {travasAqui.length > 0 && (
                      <span
                        className="normal-case tracking-normal text-[11px] font-medium inline-flex items-center gap-1"
                        style={{ color: "var(--butter-strong)" }}
                      >
                        <Lock size={10} strokeWidth={2.5} aria-hidden="true" />
                        Trava de férias: {travasAqui.map((t) => t.nome).join(", ")}
                      </span>
                    )}
                  </h3>
                  <ul
                    className="overflow-hidden"
                    style={{
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-surface)",
                    }}
                  >
                    {evs.map((e, i) => (
                      <LinhaDoEvento key={e.id} evento={e} primeira={i === 0} onClick={() => abrirDetalhe(e)} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {tip.tip && !arrastando && (
        <CursorTooltip x={tip.tip.x} y={tip.tip.y}>
          <TooltipEvento evento={tip.tip.data} />
        </CursorTooltip>
      )}

      {detalhe && (
        <DetailModal
          id={detalhe.id}
          type={detalhe.type}
          checkpointId={detalhe.checkpointId}
          onClose={fecharDetalhe}
        />
      )}

      {novaEm && (
        <NovaDataModal
          data={novaEm}
          itens={itens}
          carregandoItens={carregandoItens}
          responsaveis={responsaveis}
          euId={eu.id}
          onClose={() => setNovaEm(null)}
          onCriado={(mensagem) => {
            setNovaEm(null);
            setItens(null);
            toast(mensagem);
            recarregarMes();
          }}
        />
      )}
    </div>
  );
}

function ChipDoEvento({
  evento,
  arrastavel,
  arrastando,
  onClick,
  onDragStart,
  onDragEnd,
  bind,
}: {
  evento: EventoDoCalendario;
  arrastavel: boolean;
  arrastando: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  bind: (e: EventoDoCalendario) => { onMouseEnter: (ev: React.MouseEvent) => void; onMouseLeave: () => void };
}) {
  const cfg = TIPO_CONFIG[evento.tipo];
  const Icon = cfg.icon;
  const feito = evento.concluido === true;
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={arrastavel}
      onDragStart={(ev) => {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", evento.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      {...bind(evento)}
      aria-label={rotuloAcessivel(evento)}
      className="flex items-center gap-1 text-[11px] leading-4 font-medium text-left min-w-0 w-full transition-opacity hover:opacity-80"
      style={{
        background: cfg.soft,
        color: cfg.text,
        borderLeft: `3px solid ${evento.atrasado ? COR_ATRASO : cfg.accent}`,
        // Atrasado: contorno na cor de atraso, por dentro (não muda a altura).
        boxShadow: evento.atrasado ? `inset 0 0 0 1px ${COR_ATRASO}` : undefined,
        borderRadius: "var(--radius-sm)",
        padding: "2px 4px",
        opacity: arrastando ? 0.4 : feito ? 0.6 : 1,
        cursor: arrastavel ? "grab" : "pointer",
      }}
    >
      {feito ? (
        <Check size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} aria-hidden="true" />
      ) : (
        <Icon size={11} strokeWidth={2} style={{ flexShrink: 0 }} aria-hidden="true" />
      )}
      <span className="truncate flex-1" style={{ textDecoration: feito ? "line-through" : undefined }}>
        {evento.titulo}
      </span>
      {evento.conflitos.length > 0 && (
        <UserX size={11} strokeWidth={2.25} style={{ flexShrink: 0, color: "var(--butter-strong)" }} aria-hidden="true" />
      )}
      {evento.atrasado && (
        <AlertCircle size={11} strokeWidth={2.25} style={{ flexShrink: 0, color: COR_ATRASO }} aria-hidden="true" />
      )}
    </button>
  );
}

function TooltipEvento({ evento }: { evento: EventoDoCalendario }) {
  const cfg = TIPO_CONFIG[evento.tipo];
  const item = ITEM_CONFIG[evento.item.tipo];
  return (
    <>
      <TooltipTitle>{evento.titulo}</TooltipTitle>
      <TooltipLine>
        {cfg.label} · {rotuloCurto(evento.data)}
        {evento.concluido ? " · concluído" : ""}
        {evento.atrasado ? " · atrasado" : ""}
      </TooltipLine>
      <TooltipLine>{evento.checkpointId ? `${item.label}: ${evento.item.nome}` : item.label}</TooltipLine>
      <TooltipLine>Frente: {evento.frente.name}</TooltipLine>
      {evento.members.length > 0 && (
        <TooltipLine dim>Responsáveis: {formatMemberNames(evento.members)}</TooltipLine>
      )}
      {evento.conflitos.length > 0 && <TooltipLine>Fora no dia: {rotuloDosConflitos(evento)}</TooltipLine>}
      <TooltipHint>
        Clique para abrir {evento.checkpointId ? "no checkpoint" : item.label.toLowerCase()}
      </TooltipHint>
    </>
  );
}

function LinhaDoEvento({
  evento,
  primeira,
  onClick,
}: {
  evento: EventoDoCalendario;
  primeira: boolean;
  onClick: () => void;
}) {
  const cfg = TIPO_CONFIG[evento.tipo];
  const Icon = cfg.icon;
  const item = ITEM_CONFIG[evento.item.tipo];
  const ItemIcon = item.icon;
  const feito = evento.concluido === true;
  return (
    <li style={{ borderTop: primeira ? undefined : "1px solid var(--border-subtle)" }}>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--accent-subtle)]"
        style={{ background: "none", border: "none", cursor: "pointer" }}
        aria-label={rotuloAcessivel(evento)}
      >
        <span
          className="flex items-center justify-center shrink-0"
          style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", background: cfg.soft }}
          aria-hidden="true"
        >
          <Icon size={14} strokeWidth={2} style={{ color: cfg.text }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <span
              className="text-sm font-medium truncate"
              style={{
                color: "var(--text-primary)",
                textDecoration: feito ? "line-through" : undefined,
                opacity: feito ? 0.6 : 1,
              }}
            >
              {evento.titulo}
            </span>
            {feito && (
              <span
                className="text-[11px] font-medium inline-flex items-center gap-0.5 shrink-0"
                style={{ color: "var(--sage-strong)" }}
              >
                <Check size={11} strokeWidth={2.5} aria-hidden="true" /> Concluído
              </span>
            )}
            {evento.atrasado && (
              <span
                className="text-[11px] font-medium inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5"
                style={{ color: "var(--peach-strong)", background: "var(--peach-soft)", borderRadius: "var(--radius-full)" }}
              >
                <AlertCircle size={11} strokeWidth={2.25} aria-hidden="true" /> Atrasado
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-xs mt-0.5 min-w-0" style={{ color: "var(--text-muted)" }}>
            <span className="font-medium shrink-0" style={{ color: cfg.text }}>
              {cfg.label}
            </span>
            <span aria-hidden="true">·</span>
            <ItemIcon size={12} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{evento.checkpointId ? evento.item.nome : item.label}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{evento.frente.name}</span>
          </span>
          {evento.conflitos.length > 0 && (
            <span
              className="flex items-center gap-1 text-xs mt-0.5"
              style={{ color: "var(--butter-strong)" }}
            >
              <UserX size={12} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />
              Fora no dia: {rotuloDosConflitos(evento)}
            </span>
          )}
        </span>
        <span className="shrink-0 hidden sm:block">
          <MemberChips members={evento.members} />
        </span>
      </button>
    </li>
  );
}
