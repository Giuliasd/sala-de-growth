"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Layers, Plus, Repeat, Star, Trash2 } from "lucide-react";
import { FocoDaSemanaStar } from "./FocoDaSemanaStar";
import { IconButton } from "@/components/shared/IconButton";
import { TagSelect } from "@/components/shared/TagSelect";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ActivityGroupLabel } from "@/components/shared/ActivityItemCard";
import { registrarEdicao } from "@/lib/undo";
import {
  alternarAcaoNaSemana,
  criarAcaoDaSemana,
  definirFrenteDaAcao,
  definirRecorrenciaDaAcao,
  encerrarAcao,
  renomearAcao,
  type AcaoDaSemana,
  type Recorrencia,
} from "@/actions/acoes-semana";

/** Ciclo do botão de repetição na criação: uma vez → toda semana → todo mês. */
const CICLO: (Recorrencia | null)[] = [null, "semanal", "mensal"];

const ROTULO: Record<string, string> = {
  null: "só nesta semana",
  semanal: "toda semana",
  mensal: "todo mês",
};

/** "todo mês · 2ª semana" — a semana equivalente em que a ação reaparece. */
function rotuloDaLinha(acao: AcaoDaSemana): string | null {
  if (acao.recorrencia === "semanal") return "toda semana";
  if (acao.recorrencia === "mensal") {
    return acao.semanaDoMes ? `todo mês · ${acao.semanaDoMes}ª semana` : "todo mês";
  }
  return null;
}

/**
 * O trabalho recorrente e miúdo da pessoa na semana — "TH", "1:1",
 * "acompanhamento". Mesma gramática das linhas de checkpoint: caixa para
 * concluir, clique no título para renomear, lixeira para tirar.
 *
 * A conclusão é da SEMANA: concluir o "1:1" desta semana não marca o 1:1 das
 * próximas (ver AcaoSemana no schema).
 */
function Linha({
  acao,
  weekOf,
  memberId,
  focada,
  podeEditar,
  frentes,
  onErro,
  onPedirRemocao,
  textoCheckpoint,
}: {
  acao: AcaoDaSemana;
  weekOf: string;
  /** De quem é a linha — a prioridade é da pessoa, na semana. */
  memberId: string;
  /** Já marcada como prioridade da semana. */
  focada: boolean;
  podeEditar: boolean;
  /** Frentes ativas, para mover a ação. Vazio = sem seletor. */
  frentes: { id: string; name: string }[];
  onErro: (msg: string | null) => void;
  onPedirRemocao: (acao: AcaoDaSemana) => void;
  textoCheckpoint: boolean;
}) {
  // No dashboard a ação divide o card com os checkpoints: mesma fonte deles
  // (text-sm, cor primária). Nos Rituais fica compacta.
  const classeTexto = textoCheckpoint ? "text-sm leading-snug" : "text-xs";
  const corTexto = textoCheckpoint ? "var(--text-primary)" : "var(--text-secondary)";
  const [editando, setEditando] = useState(false);
  const [salvando, startTransition] = useTransition();
  // Otimista na caixa: marcar tem de responder na hora, é o gesto da reunião.
  const [otimista, setOtimista] = useState<boolean | null>(null);
  // O otimista vale até o servidor responder: quando a prop muda, ela volta a
  // mandar. Sem isso ele ficava preso e escondia mudanças posteriores (Ctrl+Z,
  // edição em outra tela) até recarregar a página.
  const [servidorAnterior, setServidorAnterior] = useState(acao.concluida);
  if (servidorAnterior !== acao.concluida) {
    setServidorAnterior(acao.concluida);
    setOtimista(null);
  }
  const concluida = otimista ?? acao.concluida;

  async function alternar() {
    const res = await alternarAcaoNaSemana({ id: acao.id, weekOf });
    if (!res.success) {
      setOtimista(null);
      onErro(res.error);
      throw new Error(res.error);
    }
  }

  function onAlternar() {
    if (!podeEditar || salvando) return;
    setOtimista(!concluida);
    onErro(null);
    registrarEdicao(concluida ? `"${acao.title}" desmarcada` : `"${acao.title}" concluída`, () =>
      alternar()
    );
    startTransition(async () => {
      try {
        await alternar();
      } catch {
        // Erro já foi para a seção.
      }
    });
  }

  async function aplicarFrente(frenteId: string | null) {
    const res = await definirFrenteDaAcao({ id: acao.id, frenteId });
    if (!res.success) {
      onErro(res.error);
      throw new Error(res.error);
    }
  }

  function mudarFrente(valor: string) {
    const proxima = valor || null;
    const atual = acao.frente?.id ?? null;
    if (proxima === atual || salvando) return;
    onErro(null);
    registrarEdicao(`frente de ${acao.title}`, () => aplicarFrente(atual));
    startTransition(async () => {
      try {
        await aplicarFrente(proxima);
      } catch {
        // Erro já foi para a seção.
      }
    });
  }

  async function aplicarTitulo(novo: string) {
    const res = await renomearAcao({ id: acao.id, title: novo });
    if (!res.success) {
      onErro(res.error);
      throw new Error(res.error);
    }
  }

  async function aplicarFrequencia(proxima: Recorrencia | null) {
    const res = await definirRecorrenciaDaAcao({ id: acao.id, weekOf, recorrencia: proxima });
    if (!res.success) {
      onErro(res.error);
      throw new Error(res.error);
    }
  }

  function mudarFrequencia() {
    if (!podeEditar || salvando) return;
    const atual = acao.recorrencia;
    const proxima = CICLO[(CICLO.indexOf(atual) + 1) % CICLO.length];
    onErro(null);
    registrarEdicao(`frequência de ${acao.title}`, () => aplicarFrequencia(atual));
    startTransition(async () => {
      try {
        await aplicarFrequencia(proxima);
      } catch {
        // Erro já foi para a seção.
      }
    });
  }

  function salvarTitulo(valor: string) {
    setEditando(false);
    const limpo = valor.trim();
    const anterior = acao.title;
    if (!limpo || limpo === anterior) return;
    onErro(null);
    registrarEdicao(`título de ${anterior}`, () => aplicarTitulo(anterior));
    startTransition(async () => {
      try {
        await aplicarTitulo(limpo);
      } catch {
        // Erro já foi para a seção.
      }
    });
  }

  return (
    <li
      className={`flex items-center gap-1.5 min-w-0 group/acao ${salvando ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onAlternar}
        disabled={!podeEditar}
        aria-pressed={concluida}
        aria-label={concluida ? "Desmarcar" : "Concluir"}
        data-tooltip={podeEditar ? (concluida ? "Desmarcar" : "Concluir") : undefined}
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 13,
          height: 13,
          borderRadius: 3,
          border: concluida ? "none" : "1.5px solid var(--border-default)",
          background: concluida ? "var(--brand-primary)" : "transparent",
          cursor: podeEditar ? "pointer" : "default",
          padding: 0,
        }}
      >
        {concluida && <Check size={9} strokeWidth={3} color="#fff" />}
      </button>

      {editando ? (
        <input
          type="text"
          autoFocus
          defaultValue={acao.title}
          maxLength={200}
          className={`field ${classeTexto}`}
          style={{ padding: "1px 4px", minWidth: 0, flex: 1 }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => salvarTitulo(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              salvarTitulo(e.currentTarget.value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              // Devolve o original antes de fechar: o blur seguinte gravaria o
              // que foi digitado (mesma armadilha das linhas de checkpoint).
              e.currentTarget.value = acao.title;
              setEditando(false);
            }
          }}
        />
      ) : podeEditar ? (
        <button
          type="button"
          onClick={() => setEditando(true)}
          data-tooltip="Clique para renomear"
          className={`${classeTexto} truncate text-left`}
          style={{
            color: concluida ? "var(--text-muted)" : corTexto,
            textDecoration: concluida ? "line-through" : "none",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: "var(--radius-sm)",
            padding: "0 3px",
            cursor: "text",
            minWidth: 0,
          }}
        >
          {acao.title}
        </button>
      ) : (
        <span
          className={`${classeTexto} truncate`}
          style={{
            color: concluida ? "var(--text-muted)" : corTexto,
            textDecoration: concluida ? "line-through" : "none",
          }}
          data-tooltip={acao.title}
        >
          {acao.title}
        </span>
      )}

      {/* Prioridade da semana: a mesma estrela dos cards de iniciativa e
          experimento. Sem permissão, a estrela marcada ainda informa. */}
      {podeEditar ? (
        <FocoDaSemanaStar
          weekOf={weekOf}
          memberId={memberId}
          itemId={acao.id}
          kind="acao"
          marcado={focada}
        />
      ) : focada ? (
        <Star
          size={12}
          strokeWidth={2}
          fill="currentColor"
          className="shrink-0"
          style={{ color: "var(--butter-strong)" }}
          aria-label="Prioridade da semana"
        />
      ) : null}

      {/* Frequência editável depois de criada, no mesmo lugar onde ela é
          exibida: clicar cicla só nesta semana → toda semana → todo mês. Sem
          frequência, o botão aparece no hover (como a lixeira) para não
          poluir a linha de quem não repete nada. */}
      {podeEditar ? (
        <button
          type="button"
          onClick={mudarFrequencia}
          disabled={salvando}
          data-tooltip={
            acao.recorrencia === "mensal"
              ? "Reaparece na mesma semana de cada mês · clique para mudar"
              : acao.recorrencia === "semanal"
                ? "Reaparece toda semana · clique para mudar"
                : "Só nesta semana · clique para repetir"
          }
          aria-label="Mudar a frequência"
          className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] u-transition ${
            acao.recorrencia ? "" : "opacity-0 group-hover/acao:opacity-100 group-focus-within/acao:opacity-100 focus-visible:opacity-100"
          }`}
          style={{
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "0 4px",
            cursor: "pointer",
            color: acao.recorrencia ? "var(--text-muted)" : "var(--text-muted)",
          }}
        >
          <Repeat size={10} strokeWidth={2} />
          {rotuloDaLinha(acao) ?? "só nesta semana"}
        </button>
      ) : (
        rotuloDaLinha(acao) && (
          <span
            className="shrink-0 inline-flex items-center gap-0.5 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            <Repeat size={10} strokeWidth={2} />
            {rotuloDaLinha(acao)}
          </span>
        )
      )}

      {/* Mover de frente — o chip mais à direita, depois da frequência. Só no
          hover, como a lixeira: a frente já está dita
          pelo grupo em que a linha mora, então repeti-la em cada linha era
          ruído. O que falta ali é o gesto de MOVER, e é ele que aparece.
          TagSelect e não Dropdown: aqui o gatilho é o próprio chip, no
          tamanho da linha — o Dropdown é o botão de superfície com chevron. */}
      {podeEditar && frentes.length > 0 && (
        <span className="shrink-0 opacity-0 group-hover/acao:opacity-100 group-focus-within/acao:opacity-100 focus-visible:opacity-100 u-transition">
          <TagSelect
            value={acao.frente?.id ?? ""}
            onChange={mudarFrente}
            disabled={salvando}
            undoLabel="frente"
            title={acao.frente ? `Frente: ${acao.frente.name}` : "Sem frente"}
            options={[
              { value: "", label: "Sem frente" },
              ...frentes.map((f) => ({ value: f.id, label: f.name })),
            ]}
          >
            <span
              className="inline-flex items-center gap-0.5 text-[10px]"
              style={{
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "0 4px",
                color: "var(--text-muted)",
              }}
            >
              <Layers size={10} strokeWidth={2} />
              {acao.frente?.name ?? "sem frente"}
            </span>
          </TagSelect>
        </span>
      )}

      {podeEditar && (
        <IconButton
          boxSize={20}
          onClick={() => onPedirRemocao(acao)}
          className="icon-btn--danger shrink-0 opacity-0 group-hover/acao:opacity-100 group-focus-within/acao:opacity-100 focus-visible:opacity-100"
          title={acao.recorrencia ? "Parar de repetir" : "Remover ação"}
          aria-label={
            acao.recorrencia ? `Parar de repetir ${acao.title}` : `Remover ${acao.title}`
          }
        >
          <Trash2 size={12} />
        </IconButton>
      )}
    </li>
  );
}

export function AcoesDaSemana({
  acoes,
  weekOf,
  memberId,
  podeEditar,
  frentes = [],
  frenteId = null,
  comRotulo = true,
  comCriar = true,
  focadas,
  textoCheckpoint = false,
}: {
  /** Usa a fonte das linhas de checkpoint (dashboard). */
  textoCheckpoint?: boolean;
  /** Ids das ações que já são prioridade da semana desta pessoa. */
  focadas?: Set<string>;
  acoes: AcaoDaSemana[];
  weekOf: string;
  /** De quem é a linha — a ação nasce no nome dessa pessoa. */
  memberId: string;
  podeEditar: boolean;
  /** Frentes ativas, para criar e mover. */
  frentes?: { id: string; name: string }[];
  /**
   * Frente desta seção. A ação criada aqui já nasce nela — é o que faz o
   * "+ Ação" dentro de um grupo significar "ação desta frente". `null` no
   * balde transversal.
   */
  frenteId?: string | null;
  /**
   * Mostrar o rótulo "Também nesta semana". Falso dentro de um grupo de
   * frente, onde o título do grupo já diz onde a linha está.
   */
  comRotulo?: boolean;
  /**
   * Mostrar o "+ Ação". Só o balde transversal cria: dentro de um grupo de
   * frente, um botão por frente enchia a linha de cada pessoa de botões
   * repetidos. Quem quer a ação numa frente cria aqui e move pelo chip.
   */
  comCriar?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<AcaoDaSemana | null>(null);
  const [abertoNovo, setAbertoNovo] = useState(false);
  const [nome, setNome] = useState("");
  const campoNovo = useRef<HTMLInputElement>(null);
  const [recorrencia, setRecorrencia] = useState<Recorrencia | null>(null);
  const [salvando, startTransition] = useTransition();

  if (acoes.length === 0 && !podeEditar) return null;

  function criar() {
    const limpo = nome.trim();
    // Sem checar `salvando`: numa weekly as ações saem em série, e recusar a
    // próxima enquanto a anterior grava significava perder a que a pessoa
    // acabou de digitar. Como o campo é limpo já abaixo, um Enter repetido
    // sem texto novo cai no `!limpo` e não duplica nada.
    if (!limpo) return;
    setErro(null);
    // Limpa e devolve o foco na hora, sem esperar o servidor: é o que faz o
    // Enter "publicar e já começar a próxima". Esperar o round-trip para
    // limpar também apagava o que fosse digitado durante a gravação.
    setNome("");
    campoNovo.current?.focus();
    startTransition(async () => {
      const res = await criarAcaoDaSemana({
        weekOf,
        responsavelId: memberId,
        title: limpo,
        recorrencia,
        frenteId,
      });
      if (res.success) {
        // A resposta da action re-renderiza a lista; sem isto o foco se perde
        // no meio de uma série.
        campoNovo.current?.focus();
      } else {
        setErro(res.error);
        // Devolve o texto para a pessoa não reescrever — a não ser que ela
        // já tenha começado a próxima, que tem precedência.
        setNome((atual) => atual || limpo);
      }
    });
  }

  function remover() {
    const acao = alvo;
    if (!acao) return;
    setAlvo(null);
    setErro(null);
    startTransition(async () => {
      const res = await encerrarAcao({ id: acao.id, weekOf });
      if (!res.success) setErro(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* O rótulo só aparece quando há ação. Sem isso, numa Weekly vista pela
          liderança, todas as linhas do time anunciavam uma seção vazia — dez
          títulos "Também nesta semana" sem nada embaixo. */}
      {comRotulo && acoes.length > 0 && (
        <ActivityGroupLabel>Também nesta semana</ActivityGroupLabel>
      )}

      {acoes.length > 0 && (
        <ul className="flex flex-col gap-1">
          {acoes.map((a) => (
            <Linha
              key={a.id}
              acao={a}
              weekOf={weekOf}
              memberId={memberId}
              focada={focadas?.has(a.id) ?? false}
              podeEditar={podeEditar}
              frentes={frentes}
              onErro={setErro}
              onPedirRemocao={setAlvo}
              textoCheckpoint={textoCheckpoint}
            />
          ))}
        </ul>
      )}

      {podeEditar &&
        comCriar &&
        (abertoNovo ? (
          <div className="flex items-center gap-1.5">
            <input
              // Sem `disabled` durante a gravação: desabilitar tira o foco do
              // campo (o navegador desfoca elemento desabilitado), e aí a
              // série de ações parava a cada Enter esperando um novo clique.
              ref={campoNovo}
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  criar();
                } else if (e.key === "Escape") {
                  setAbertoNovo(false);
                  setNome("");
                  setErro(null);
                }
              }}
              onBlur={() => {
                if (!nome.trim()) setAbertoNovo(false);
              }}
              placeholder="Ação e apertar Enter…"
              className="field text-xs"
              style={{ padding: "1px 4px", minWidth: 0, flex: 1 }}
            />
            {/* Três estados num clique: o rótulo fica visível ao lado do
                ícone para o estado nunca ser adivinhado. */}
            <button
              type="button"
              onClick={() =>
                setRecorrencia((atual) => CICLO[(CICLO.indexOf(atual) + 1) % CICLO.length])
              }
              data-tooltip="Clique para alternar entre só nesta semana, toda semana e todo mês"
              className="shrink-0 inline-flex items-center gap-1 text-[10px]"
              style={{
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "1px 5px",
                cursor: "pointer",
                color: recorrencia ? "var(--brand-primary)" : "var(--text-muted)",
              }}
            >
              <Repeat size={10} strokeWidth={recorrencia ? 2.5 : 2} />
              {ROTULO[String(recorrencia)]}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAbertoNovo(true)}
            className="inline-flex items-center gap-1 text-xs self-start"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <Plus size={12} />
            Ação
          </button>
        ))}

      {erro && (
        <p className="text-[11px]" style={{ color: "var(--status-error-text)" }}>
          {erro}
        </p>
      )}

      {alvo && (
        <ConfirmDialog
          title={alvo.recorrencia ? "Parar de repetir" : "Remover ação"}
          message={
            alvo.recorrencia
              ? `"${alvo.title}" para de aparecer desta semana em diante. As semanas anteriores continuam como estão.`
              : `Remover "${alvo.title}"? Esta ação não pode ser desfeita.`
          }
          confirmLabel={alvo.recorrencia ? "Parar de repetir" : "Remover"}
          onConfirm={remover}
          onCancel={() => setAlvo(null)}
        />
      )}
    </div>
  );
}
