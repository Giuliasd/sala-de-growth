import { notFound } from "next/navigation";
import {
  ClipboardList, FlaskConical, Zap, GraduationCap, Palmtree, Sun, Target, Lock,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { ICEBadge } from "@/components/shared/ICEBadge";
import { ResultadoBadge } from "@/components/shared/ResultadoBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { MetricCard } from "@/components/shared/MetricCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { SectionCard } from "@/components/shared/SectionCard";
import { CardHeader } from "@/components/shared/CardHeader";
import { IconTile } from "@/components/shared/IconTile";
import { IconButton } from "@/components/shared/IconButton";
import { Avatar } from "@/components/shared/Avatar";
import { Block } from "@/components/shared/Skeleton";
import { ActivityItemCard, ActivityGroupLabel } from "@/components/shared/ActivityItemCard";
import { LaunchBanner } from "@/components/shared/LaunchBanner";
import { Alert } from "@/components/shared/Alert";
import { TooltipSurface, TooltipTitle, TooltipLine, TooltipHint } from "@/components/shared/CursorTooltip";
import { MarcoChip, MarcoProgressoSelo } from "@/components/shared/CheckpointMarco";
import { progressoDoMarco, type MarcoCheckpoint } from "@/lib/checkpoint-marco";
import { DesignSystemPlayground } from "./DesignSystemPlayground";

// Helper: título de seção padronizado (evita repetir <h2> em toda seção).
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>{title}</h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  // Swatches renderizam o TOKEN (var), não um hex fixo — assim refletem o
  // tema resolvido (claro/escuro) em vez de mentir no dark.
  const SWATCHES: { name: string; var: string; border?: boolean }[] = [
    { name: "bg-app", var: "--bg-app", border: true },
    { name: "bg-surface", var: "--bg-surface", border: true },
    { name: "text-primary", var: "--text-primary" },
    { name: "text-secondary", var: "--text-secondary" },
    { name: "text-muted", var: "--text-muted" },
    { name: "border-subtle", var: "--border-subtle", border: true },
    { name: "brand-primary", var: "--brand-primary" },
    { name: "accent", var: "--accent" },
    { name: "accent-subtle", var: "--accent-subtle", border: true },
    { name: "peach", var: "--peach" },
    { name: "peach-strong", var: "--peach-strong" },
    { name: "status-late-text", var: "--status-late-text" },
    { name: "status-error-text", var: "--status-error-text" },
    { name: "butter", var: "--butter" },
    { name: "butter-strong", var: "--butter-strong" },
    { name: "sky", var: "--sky" },
    { name: "sky-strong", var: "--sky-strong" },
    { name: "sage", var: "--sage" },
    { name: "blush", var: "--blush" },
    { name: "blush-strong", var: "--blush-strong" },
  ];

  const RADII = [
    { name: "sm", var: "--radius-sm" },
    { name: "md", var: "--radius-md" },
    { name: "lg", var: "--radius-lg" },
    { name: "xl", var: "--radius-xl" },
    { name: "full", var: "--radius-full" },
  ];

  const SHADOWS = [
    { name: "sm", var: "--shadow-sm" },
    { name: "md", var: "--shadow-md" },
    { name: "lg", var: "--shadow-lg" },
  ];

  // Marcos de exemplo para a seção "Marco — checkpoints necessários": um em
  // andamento, um em risco (necessário atrasado) e um completo.
  const exemploDeMarco = (feitos: boolean[], atrasado = false) => {
    const hoje = new Date();
    const dia = (d: number) => new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + d));
    const reqs: MarcoCheckpoint[] = feitos.map((ok, i) => ({
      id: `r${i}`, name: `Necessário ${i + 1}`, parentId: null, isCompleted: ok,
      dueDate: atrasado && i === 0 ? dia(-3) : dia(5),
    }));
    return progressoDoMarco(
      { id: "m", name: "Lançamento", parentId: null, categoria: "MARCO", isCompleted: false, dueDate: dia(10), requisitoIds: reqs.map((r) => r.id) },
      new Map(reqs.map((r) => [r.id, r]))
    )!;
  };
  const marcoAndando = exemploDeMarco([true, true, false, false]);
  const marcoEmRisco = exemploDeMarco([false, true, true, false], true);
  const marcoCompleto = exemploDeMarco([true, true, true]);

  return (
    <div className="space-y-16 pb-16">
      <div>
        <h1
          className="text-3xl font-medium"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          Design System
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Referência visual — disponível apenas em development
        </p>
      </div>

      {/* ── Playground interativo (tema, Field, Modal, Toast, SegmentedToggle, ConfirmDialog) ── */}
      <DesignSystemPlayground />

      {/* ── Paleta ─────────────────────────────────────────────── */}
      <Section title="Paleta (tokens — refletem o tema atual)">
        <div className="grid grid-cols-6 gap-3">
          {SWATCHES.map((s) => (
            <div key={s.name} className="space-y-2">
              <div
                style={{
                  height: 56,
                  borderRadius: "var(--radius-md)",
                  background: `var(${s.var})`,
                  border: s.border ? "1px solid var(--border-subtle)" : undefined,
                }}
              />
              <div>
                <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{s.name}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{s.var}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Tipografia ─────────────────────────────────────────── */}
      <Section title="Tipografia">
        <Card padding={24} className="space-y-4">
          <p style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>Geist Medium 36px</p>
          <p style={{ fontSize: 24, fontWeight: 400, color: "var(--text-primary)" }}>Geist Regular 24px</p>
          <p style={{ fontSize: 16, color: "var(--text-secondary)" }}>Body text em text-secondary, 16px, leitura confortável</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Caption text muted, 12px</p>
          <p
            className="tabular"
            style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 500, color: "var(--text-primary)" }}
          >
            1.234.567
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>↑ Geist Mono — números tabulares em métricas</p>
        </Card>
      </Section>

      {/* ── Botões ─────────────────────────────────────────────── */}
      <Section title="Botões">
        <div className="flex flex-wrap gap-3 items-center">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Passe o mouse / use Tab: hover, clique (afunda) e foco por teclado vêm do CSS.
        </p>
      </Section>

      {/* ── Movimento ──────────────────────────────────────────── */}
      <Section title="Movimento">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Passe o mouse nos blocos — cada um usa uma duração diferente.
        </p>
        <div className="flex flex-wrap gap-4">
          {[
            { name: "fast · 120ms", dur: "var(--duration-fast)" },
            { name: "base · 200ms", dur: "var(--duration-base)" },
            { name: "slow · 320ms", dur: "var(--duration-slow)" },
          ].map((d) => (
            <div
              key={d.name}
              className="motion-demo"
              style={{
                width: 150,
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                fontSize: 12,
                transition: `transform ${d.dur} var(--ease-out), background-color ${d.dur} var(--ease-out)`,
              }}
            >
              {d.name}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Radius & Shadow ────────────────────────────────────── */}
      <Section title="Radius & Shadow">
        <div className="flex flex-wrap gap-6">
          {RADII.map((r) => (
            <div key={r.name} className="space-y-2">
              <div
                style={{
                  width: 72, height: 72,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  borderRadius: `var(${r.var})`,
                }}
              />
              <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{r.var}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-6 pt-2">
          {SHADOWS.map((s) => (
            <div key={s.name} className="space-y-2">
              <div
                style={{
                  width: 96, height: 72,
                  background: "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: `var(${s.var})`,
                }}
              />
              <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{s.var}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Card ───────────────────────────────────────────────── */}
      <Section title="Card">
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Card padrão</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>fundo + borda + sombra via tokens</p>
          </Card>
          <Card interactive>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Card interativo</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>passe o mouse — ele sobe levemente</p>
          </Card>
        </div>
      </Section>

      {/* ── Avatar ─────────────────────────────────────────────── */}
      <Section title="Avatar">
        <Card padding={24} className="flex items-center gap-4">
          <Avatar name="Marina" size={40} />
          <Avatar name="Beatriz Souza" size={40} />
          <Avatar name="Ítalo Ferreira" size={40} />
          <Avatar name="Karina Lima" size={40} />
          <Avatar name="Lucas Prado" size={40} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Cor derivada do nome; iniciais automáticas.
          </span>
        </Card>
      </Section>

      {/* ── IconTile / IconButton ──────────────────────────────── */}
      <Section title="IconTile & IconButton">
        <div className="flex items-center gap-4 flex-wrap">
          <IconTile icon={ClipboardList} />
          <IconTile icon={FlaskConical} bg="var(--peach-soft)" color="var(--peach)" />
          <IconTile icon={Zap} bg="var(--sky-soft)" color="var(--sky)" />
          <IconTile icon={Palmtree} bg="var(--blush-soft)" color="var(--blush-strong)" />
          <span className="mx-2" style={{ color: "var(--text-muted)" }}>|</span>
          <IconButton aria-label="Exemplo"><Zap size={16} /></IconButton>
          <IconButton aria-label="Exemplo desabilitado" disabled><Sun size={16} /></IconButton>
          <IconButton aria-label="Exemplo destrutivo" className="icon-btn--danger"><FlaskConical size={16} /></IconButton>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            ← ghost · disabled · <code>.icon-btn--danger</code> (hover vermelho, p/ excluir)
          </span>
        </div>
      </Section>

      {/* ── SectionCard ────────────────────────────────────────── */}
      <Section title="SectionCard">
        <div className="grid grid-cols-2 gap-6">
          <SectionCard icon={ClipboardList} iconBg="var(--peach-soft)" iconColor="var(--peach)" title="Iniciativas" count={5} action={{ label: "Ver todas →", href: "#" }}>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Corpo do painel.</p>
          </SectionCard>
          <SectionCard icon={FlaskConical} title="Experimentos" count={11}>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Cabeçalho com ícone, título e contador.</p>
          </SectionCard>
        </div>
      </Section>

      {/* ── CardHeader ─────────────────────────────────────────── */}
      <Section title="CardHeader — cabeçalho de card">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Cabeçalho grande de card: <code>IconTile</code> + título + pill + subtítulo, com espaço
          para ações à direita. Use quando o card é uma <strong>seção da página</strong> com nome
          próprio (objetivos de OKR, Travas de Férias, &quot;Precisa de você&quot; do dashboard). Para
          painéis menores dentro de uma grade — título de 14px e só um contador — use{" "}
          <code>SectionCard</code>. Ele não desenha superfície: vai dentro de um <code>Card</code>;
          num card <code>padding={0}</code>, envolva com o padding e a divisória.
        </p>
        <div className="space-y-6">
          <Card padding="20px 24px">
            <CardHeader
              icon={Target}
              title="Construir uma máquina de aquisição previsível"
              badge="3 KRs"
              subtitle="Menos dependência de mídia paga: mix de canais com CAC sustentável."
              actions={
                <IconButton boxSize={32} aria-label="Editar">
                  <Zap size={14} />
                </IconButton>
              }
            />
          </Card>

          <Card padding={0} className="overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <CardHeader
                icon={Lock}
                iconBg="var(--blush-soft)"
                iconColor="var(--blush-strong)"
                title="Travas de Férias"
                badge="1 no período"
                subtitle="Períodos em que ninguém do time pode tirar férias"
                actions={<Button variant="secondary" size="sm">Nova trava</Button>}
              />
            </div>
            <div className="px-5 py-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Corpo do card — em <code>padding={0}</code>, a lista sangra até a borda.
              </p>
            </div>
          </Card>

          <Card padding="20px 24px">
            <CardHeader icon={ClipboardList} title="Sem pill e sem subtítulo" />
          </Card>
        </div>
      </Section>

      {/* ── ActivityItemCard ───────────────────────────────────── */}
      <Section title="ActivityItemCard — item de atividade">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Padrão canônico para listar iniciativas/experimentos em visões de acompanhamento —
          é o card do <strong>&ldquo;Precisa de você&rdquo;</strong> do dashboard e das abas{" "}
          <strong>Weekly</strong> e <strong>Experimentos ativos</strong> em Rituais.
          Anatomia: ícone do tipo → nome clicável → pill de status → chip do responsável →
          slot <code>trailing</code> (contador, ICE, botões); corpo livre para checkpoints e
          lançamento. Grupos usam <code>ActivityGroupLabel</code>.{" "}
          <strong>Não recrie variações locais</strong> (borda lateral colorida, avatar no
          lugar do chip) — importe de <code>components/shared/ActivityItemCard</code>.
        </p>
        <div className="max-w-xl flex flex-col gap-2">
          <ActivityGroupLabel>Aquisição</ActivityGroupLabel>
          <ActivityItemCard
            kind="iniciativa"
            name="Ajustar fluxo de recuperação de senha"
            status="EM_ANDAMENTO"
            members={[{ id: "m1", name: "Beatriz Souza" }]}
            trailing={
              <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
                1/3
              </span>
            }
          />
          <ActivityItemCard
            kind="experimento"
            name="Teste de headline na home"
            status="AGUARDANDO_RESULTADOS"
            members={[
              { id: "m2", name: "Marina" },
              { id: "m3", name: "Rafael Nunes" },
            ]}
            trailing={
              <span
                className="shrink-0 text-xs font-mono font-semibold tabular"
                style={{ color: "var(--text-muted)" }}
                data-tooltip="ICE Score"
              >
                7.5
              </span>
            }
          >
            <LaunchBanner variant="semana" date="2026-07-15" />
          </ActivityItemCard>
          <ActivityItemCard
            kind="experimento"
            name="Sem status (ex.: coluna de kanban já indica a etapa)"
            /* Quatro responsáveis: dois chips nominais + "+2" (tooltip lista todos). */
            members={[
              { id: "m4", name: "Italo Ferreira" },
              { id: "m5", name: "Marina Costa" },
              { id: "m6", name: "Pedro Alves" },
              { id: "m7", name: "Sofia Lima" },
            ]}
          />
        </div>
      </Section>

      {/* ── Alert ──────────────────────────────────────────────── */}
      <Section title="Alert — aviso / callout">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Faixa de aviso canônica: fundo <code>-soft</code> da família + texto/ícone{" "}
          <code>-strong</code> (par legível nos dois temas) + borda fina no tom da família.
          Quatro variantes semânticas — <code>info</code> (sky), <code>warning</code> (butter),{" "}
          <code>danger</code> (blush) e <code>success</code> (sage). Anatomia: ícone → título
          opcional + corpo → slot <code>action</code>.{" "}
          <strong>Não recrie faixas de aviso locais</strong> — importe de{" "}
          <code>components/shared/Alert</code>.
        </p>
        <div className="max-w-xl flex flex-col gap-3">
          <Alert variant="info">
            Este quarter ainda não tem OKRs cadastrados.
          </Alert>
          <Alert variant="warning">
            Sem OKR vinculado — o OKR anterior era de outro quarter e foi removido ao trocar o
            quarter. Vincule um OKR deste quarter.
          </Alert>
          <Alert variant="danger" title="Não foi possível salvar">
            Verifique a conexão e tente novamente.
          </Alert>
          <Alert variant="success">
            Nenhum conflito detectado neste período.
          </Alert>
        </div>
      </Section>

      {/* ── Tooltip ────────────────────────────────────────────── */}
      <Section title="Tooltip — CursorTooltip">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Tooltip canônico do produto: caixa escura sobre tokens{" "}
          <code>--bg-tooltip</code>/<code>--border-tooltip</code> (legível nos dois temas),
          que segue o cursor. Use <code>useCursorTooltip()</code> +{" "}
          <code>CursorTooltip</code> com <code>TooltipTitle</code>/<code>TooltipLine</code>/
          <code>TooltipHint</code>. Usado nos roadmaps de Ausências e geral.{" "}
          <strong>Não use o <code>title</code> nativo do navegador nem recrie caixas locais.</strong>
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Rótulo de uma linha: o <code>IconButton</code> já transforma o próprio{" "}
          <code>title</code> neste tooltip (hover e foco por teclado). Em qualquer outro alvo
          (nome truncado, ícone, checkbox), use <code>useLabelTooltip()</code>:{" "}
          <code>{"{...rotulo.alvo(\"Fechar\")}"}</code> no elemento e{" "}
          <code>{"{rotulo.tooltip}"}</code> ao lado.
        </p>
        <div className="flex flex-wrap gap-6">
          <TooltipSurface>
            <TooltipTitle>Férias</TooltipTitle>
            <TooltipLine>12/04/2026 – 20/04/2026</TooltipLine>
            <TooltipLine dim italic>Férias Abril</TooltipLine>
            <TooltipHint>Clique para editar</TooltipHint>
          </TooltipSurface>
          <TooltipSurface>
            <TooltipTitle>Migração para nova plataforma de pagamentos</TooltipTitle>
            <TooltipLine>03/04/2026 – 18/04/2026</TooltipLine>
            <TooltipLine dim>Iniciativa · Em Andamento · Assinatura</TooltipLine>
            <TooltipHint>Clique para detalhes · Arraste para mover</TooltipHint>
          </TooltipSurface>
        </div>
      </Section>

      {/* ── StatusBadge — Iniciativa ───────────────────────────── */}
      <Section title="StatusBadge — Iniciativa">
        <div className="flex flex-wrap gap-3">
          <StatusBadge status="BACKLOG" type="iniciativa" />
          <StatusBadge status="EM_ANDAMENTO" type="iniciativa" />
          <StatusBadge status="CONCLUIDA" type="iniciativa" />
          <StatusBadge status="ESCREVENDO_RELATORIO" type="iniciativa" />
          <StatusBadge status="RELATORIO_FINALIZADO" type="iniciativa" />
          <StatusBadge status="PAUSADA" type="iniciativa" />
          <StatusBadge status="CANCELADA" type="iniciativa" />
        </div>
      </Section>

      {/* ── StatusBadge — Experimento ──────────────────────────── */}
      <Section title="StatusBadge — Experimento">
        <div className="flex flex-wrap gap-3">
          <StatusBadge status="BACKLOG" type="experimento" />
          <StatusBadge status="EM_ANDAMENTO" type="experimento" />
          <StatusBadge status="AGUARDANDO_RESULTADOS" type="experimento" />
          <StatusBadge status="RELATORIO_PRONTO" type="experimento" />
          <StatusBadge status="RESULTADOS_APRESENTADOS" type="experimento" />
          <StatusBadge status="PAUSADO" type="experimento" />
          <StatusBadge status="ARQUIVADO" type="experimento" />
        </div>
      </Section>

      {/* ── StatusBadge — Ausência ─────────────────────────────── */}
      <Section title="StatusBadge — Ausência">
        <div className="flex flex-wrap gap-3">
          <StatusBadge status="FERIAS" type="ausencia" />
          <StatusBadge status="LICENCA_MEDICA" type="ausencia" />
          <StatusBadge status="LICENCA_MATERNIDADE" type="ausencia" />
          <StatusBadge status="OUTROS" type="ausencia" />
        </div>
      </Section>

      {/* ── Badges — Prioridade / ICE / Resultado ──────────────── */}
      <Section title="Badges — Prioridade · ICE · Resultado">
        <div className="flex flex-wrap gap-3">
          <PriorityBadge priority="URGENTE" />
          <PriorityBadge priority="ALTA" />
          <PriorityBadge priority="MEDIA" />
          <PriorityBadge priority="BAIXA" />
        </div>
        <div className="flex flex-wrap gap-3">
          <ICEBadge action="EXECUTAR_AGORA" iceScore={8.5} />
          <ICEBadge action="EM_SEGUIDA" iceScore={5.2} />
          <ICEBadge action="BACKLOG" iceScore={2.1} />
          <ICEBadge action="ARQUIVAR" />
        </div>
        <div className="flex flex-wrap gap-3">
          <ResultadoBadge resultado="SUCESSO" />
          <ResultadoBadge resultado="PARCIAL" />
          <ResultadoBadge resultado="FALHA" />
        </div>
      </Section>

      {/* ── Atraso e risco ─────────────────────────────────────── */}
      <Section title="Atraso e risco — cor única">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>Todo sinal de atraso ou risco usa a mesma cor</strong>: data de fim vencida,
          contagem do marco em risco, &quot;1 checkpoint atrasado&quot;, análise vencida, KR sem
          atualização, prazo em conflito com férias, percentual baixo de OKR. Em texto solto no
          card use <code>--status-late-text</code> (é o <code>--peach-strong</code> no tema claro e
          clareia no escuro, onde o strong some). Dentro de pill ou barra com fundo{" "}
          <code>--peach-soft</code> use <code>--peach-strong</code> — o fundo segue claro nos dois
          temas. Atraso em negrito quando é um dado (data, contagem); peso normal quando é frase.
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>Não é a cor de erro.</strong> Falha de sistema, validação de formulário e ação
          destrutiva (excluir) seguem em <code>--status-error-*</code> / <code>Alert</code>{" "}
          <code>danger</code>: atraso é um estado do trabalho, erro é algo que deu errado na tela.
        </p>
        <Card padding={20} className="space-y-3">
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <span className="font-mono font-bold" style={{ color: "var(--status-late-text)" }}>18/09/2026</span>
            <span className="font-bold tabular-nums" style={{ color: "var(--status-late-text)" }}>3/4</span>
            <span style={{ color: "var(--status-late-text)" }}>1 checkpoint atrasado</span>
            <span style={{ color: "var(--status-late-text)" }}>Sem atualização há 96 dias</span>
            <MarcoProgressoSelo progresso={marcoEmRisco} compacto={false} />
            <span style={{ color: "var(--status-error-text)" }}>Erro ao salvar o checkpoint.</span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            ← data vencida · contagem do marco em risco · frase de atraso · KR parado · pill sobre
            peach-soft (peach-strong) · e, para comparar, um erro de sistema (outra cor)
          </p>
        </Card>
      </Section>

      {/* ── Tabelas ─────────────────────────────────────────────── */}
      <Section title="Tabelas — alinhamento">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>Toda coluna alinha à esquerda — título e conteúdo.</strong> Vale para texto,
          pessoas, datas, números e pills: o título fica exatamente em cima do começo do que ele
          descreve, e o olho desce a coluna sem procurar onde cada uma começa. Antes cada tabela
          misturava esquerda, centro e direita (na lista de checkpoints, uma por coluna).
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Única exceção: a <strong>coluna de ações</strong> (ícones de editar/excluir, link
          &quot;Ver …&quot;), que não tem título e fica colada na borda direita. Título de coluna: 11px,
          peso 600, <code>--text-muted</code>, caixa alta, <code>letter-spacing 0.05em</code> — é
          o <code>SortableColumnHeader</code> (tabelas de Iniciativas e Experimentos) e o rótulo da
          lista de checkpoints.
        </p>
        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            background: "var(--bg-surface)",
          }}
        >
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)" }}>
                {["Nome", "Responsável", "Fim", "Atrasados"].map((t) => (
                  <th
                    key={t}
                    className="text-left px-4 py-3"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {t}
                  </th>
                ))}
                <th className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                { nome: "Refazer o fluxo de onboarding", pessoa: "Bruno", fim: "18/09/2026", n: 2 },
                { nome: "Revisar as métricas", pessoa: "Caio", fim: "30/10/2026", n: 0 },
              ].map((r, i) => (
                <tr key={r.nome} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                  <td className="text-left px-4 py-3 text-sm" style={{ color: "var(--text-primary)" }}>{r.nome}</td>
                  <td className="text-left px-4 py-3 text-sm" style={{ color: "var(--text-secondary)" }}>{r.pessoa}</td>
                  <td className="text-left px-4 py-3 text-xs font-mono" style={{ color: "var(--text-muted)" }}>{r.fim}</td>
                  <td className="text-left px-4 py-3 text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>{r.n}</td>
                  <td className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--brand-primary)" }}>Ver</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          ← todas as colunas com título à esquerda · ações sem título, à direita
        </p>
      </Section>

      {/* ── Marco — checkpoints necessários ───────────────────── */}
      <Section title="Marco — checkpoints necessários">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Um marco pode listar os checkpoints (de qualquer nível, cada um sozinho — sem o pai nem os
          filhos) que precisam estar entregues para ele acontecer (regras em <code>lib/checkpoint-marco.ts</code>). A pill de progresso
          carrega o estado todo pela cor: <strong>lilás</strong> (a cor do marco) em andamento,{" "}
          <strong>peach</strong> com alerta quando algum necessário atrasou ou vence depois do
          marco, <strong>sage</strong> quando tudo foi entregue — é o <code>MarcoProgressoSelo</code>, do
          roadmap, da Weekly e do dashboard. Na lista do detalhe o progresso fica no formato da
          contagem de subcheckpoints, ao lado do nome (<code>MarcoProgressoContagem</code>: &quot;3/5&quot;,
          na cor de atraso quando em risco; clique abre os necessários).
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          O checkpoint atrelado ganha o <code>MarcoChip</code> — caixa do chip de tag, em lilás, só com
          o nome do marco (truncado na coluna &quot;Marco&quot;). Não recrie essas pills: o
          progresso vem sempre de <code>progressoDoMarco</code>, para todas as telas contarem igual.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <MarcoProgressoSelo progresso={marcoAndando} compacto={false} />
          <MarcoProgressoSelo progresso={marcoEmRisco} compacto={false} />
          <MarcoProgressoSelo progresso={marcoCompleto} compacto={false} />
          <MarcoProgressoSelo progresso={marcoAndando} />
          <span style={{ width: 16 }} />
          <MarcoChip marcos={[{ id: "m", name: "Lançamento v2", progresso: marcoAndando }]} />
          <MarcoChip
            marcos={[
              { id: "m", name: "Lançamento v2", progresso: marcoAndando },
              { id: "n", name: "Beta fechado", progresso: marcoEmRisco },
            ]}
          />
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          ← em andamento · em risco · completo · compacto (card apertado) · chip do necessário ·
          necessário de dois marcos
        </p>
      </Section>

      {/* ── MetricCards ────────────────────────────────────────── */}
      <Section title="MetricCard — contador">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Anatomia: <strong>ícone e número na mesma linha</strong>, rótulo (e subtítulo
          opcional) embaixo. Padding de 16, ícone de 32 e número de 30px — empilhar ícone e
          número gastava duas faixas de altura para dizer uma coisa só. Com <code>href</code> o
          card inteiro vira link, com hover que levanta.
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          É o card de contador do produto (dashboard e relatórios). Não recrie contadores
          locais: para um painel com cabeçalho e conteúdo use <code>SectionCard</code>; para uma
          seção de página com nome próprio, <code>CardHeader</code> dentro de um{" "}
          <code>Card</code>.
        </p>
        <div className="grid grid-cols-4 gap-6">
          <MetricCard value={12} label="Iniciativas Ativas" icon={ClipboardList} accentBg="var(--peach-soft)" accentColor="var(--peach)" />
          <MetricCard value={8} label="Experimentos Ativos" icon={FlaskConical} accentBg="var(--sky-soft)" accentColor="var(--sky)" href="#" />
          <MetricCard value="64%" label="Progresso médio dos OKRs" subtitle="4 OKRs" icon={GraduationCap} accentBg="var(--sage-soft)" accentColor="var(--sage)" />
          <MetricCard value={2} label="Próximas Ausências" icon={Palmtree} accentBg="var(--blush-soft)" accentColor="var(--blush-strong)" />
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          ← valor numérico · com <code>href</code> (clicável) · com <code>subtitle</code> e valor
          em texto · valor numérico
        </p>
      </Section>

      {/* ── ProgressBar ────────────────────────────────────────── */}
      <Section title="ProgressBar">
        <Card padding={24} className="space-y-6">
          <div>
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Default (forest) — 65%</p>
            <ProgressBar value={65} />
          </div>
          <div>
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Contexto Temporal (sky) — 80%</p>
            <ProgressBar value={80} variant="time" />
          </div>
          <div>
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Com label — 42%</p>
            <ProgressBar value={42} showLabel />
          </div>
        </Card>
      </Section>

      {/* ── Skeleton ───────────────────────────────────────────── */}
      <Section title="Skeleton">
        <Card padding={24} className="space-y-3">
          <Block style={{ height: 16, width: "40%" }} />
          <Block style={{ height: 12, width: "80%" }} />
          <Block style={{ height: 12, width: "65%" }} />
        </Card>
      </Section>

      {/* ── EmptyState ─────────────────────────────────────────── */}
      <Section title="EmptyState">
        <div className="grid grid-cols-2 gap-6">
          <Card padding={0}>
            <EmptyState
              icon={FlaskConical}
              title="Nenhum experimento fervendo aqui ainda."
              description="Bora criar o primeiro?"
            />
          </Card>
          <Card padding={0}>
            <EmptyState
              icon={Sun}
              title="Time inteiro na ativa esse mês ☀️"
            />
          </Card>
        </div>
      </Section>

      {/* ── Copy — Saudações ───────────────────────────────────── */}
      <Section title="Copy — Saudações por dia da semana">
        <Card padding={24} className="space-y-2">
          {[
            "Boa segunda, Marina ☕",
            "Bom dia, Marina — bora rodar?",
            "Meio da semana chegando, Marina",
            "Quinta é quase sexta, Marina",
            "Sexta-feira, Marina — bora fechar?",
            "Oi, Marina — trabalhando no fim de semana?",
          ].map((msg) => (
            <p key={msg} className="text-sm" style={{ color: "var(--text-primary)" }}>
              {msg}
            </p>
          ))}
        </Card>
      </Section>
    </div>
  );
}
