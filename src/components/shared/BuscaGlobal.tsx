"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Flag,
  FlaskConical,
  ListChecks,
  MessageSquare,
  Search,
  Target,
} from "lucide-react";
import { buscarNoApp, type ResultadoDeBusca, type TipoDeResultado } from "@/actions/busca";
import { BUSCA_MIN_GLOBAL, normalizarBusca } from "@/lib/busca";
import { acaoSegura } from "@/lib/acao-segura";

/** Evento para abrir a busca de qualquer lugar (ex.: um botão): `window.dispatchEvent(new Event("sg:abrir-busca"))`. */
export const ABRIR_BUSCA_EVENT = "sg:abrir-busca";

const TIPOS: Record<TipoDeResultado, { rotulo: string; icone: typeof Search }> = {
  iniciativa: { rotulo: "Iniciativas", icone: ClipboardList },
  experimento: { rotulo: "Experimentos", icone: FlaskConical },
  checkpoint: { rotulo: "Checkpoints", icone: ListChecks },
  kr: { rotulo: "KRs", icone: Target },
  objetivo: { rotulo: "Objetivos", icone: Flag },
  acao: { rotulo: "Ações", icone: CalendarCheck },
  comentario: { rotulo: "Comentários", icone: MessageSquare },
  playbook: { rotulo: "Playbook", icone: BookOpen },
};
const ORDEM: TipoDeResultado[] = [
  "iniciativa",
  "experimento",
  "checkpoint",
  "kr",
  "objetivo",
  "acao",
  "comentario",
  "playbook",
];

/**
 * Busca global: Ctrl/⌘ + K em qualquer tela do app. Iniciativas, experimentos,
 * checkpoints, KRs, objetivos, ações, comentários e playbook por texto; setas
 * navegam, Enter abre, Esc fecha.
 *
 * Padrão "combobox": o foco fica no campo e a opção ativa é indicada por
 * `aria-activedescendant`, então o leitor de tela acompanha a seta sem o foco sair
 * de quem digita.
 */
export function BuscaGlobal() {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ResultadoDeBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);
  // Só a resposta da ÚLTIMA busca vale: uma resposta lenta de "ab" não pode
  // sobrescrever a de "abc".
  const seq = useRef(0);
  const listaId = useId();

  const fechar = useCallback(() => {
    setAberta(false);
    setTexto("");
    setResultados([]);
    setErro(null);
    setAtivo(0);
    seq.current++;
    // Devolve o foco a quem estava com ele antes de abrir.
    const anterior = anteriorRef.current;
    if (anterior && document.contains(anterior)) anterior.focus();
  }, []);

  const abrir = useCallback(() => {
    // No popup de detalhe (iframe) a busca navegaria dentro do iframe.
    if (window.self !== window.top) return;
    anteriorRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAberta(true);
  }, []);

  // Atalho global e evento de abertura.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (aberta) fechar();
        else abrir();
      }
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener(ABRIR_BUSCA_EVENT, abrir);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(ABRIR_BUSCA_EVENT, abrir);
    };
  }, [aberta, abrir, fechar]);

  useEffect(() => {
    if (aberta) inputRef.current?.focus();
  }, [aberta]);

  // Busca com pausa de 250ms entre as teclas.
  useEffect(() => {
    if (!aberta) return;
    const termo = normalizarBusca(texto, BUSCA_MIN_GLOBAL);
    const minha = ++seq.current;
    if (!termo) {
      // Sem texto válido não há o que buscar: limpa o resultado antigo.
      const t = setTimeout(() => {
        if (seq.current !== minha) return;
        setResultados([]);
        setErro(null);
        setCarregando(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(async () => {
      setCarregando(true);
      const res = await acaoSegura(buscarNoApp(termo));
      if (seq.current !== minha) return;
      setCarregando(false);
      if (res.success) {
        setErro(null);
        setResultados(res.data);
        setAtivo(0);
      } else {
        setResultados([]);
        setErro(res.error);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [texto, aberta]);

  // Ordem de exibição = ordem da navegação por seta: agrupa por tipo.
  const ordenados = useMemo(
    () => ORDEM.flatMap((tipo) => resultados.filter((r) => r.tipo === tipo)),
    [resultados]
  );

  function abrirResultado(r: ResultadoDeBusca) {
    if (r.externo) {
      // Link do playbook: fora do app, em outra aba (só http/https).
      if (/^https?:\/\//i.test(r.href)) window.open(r.href, "_blank", "noopener,noreferrer");
    } else {
      router.push(r.href);
    }
    fechar();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      fechar();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (ordenados.length) setAtivo((i) => (i + 1) % ordenados.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (ordenados.length) setAtivo((i) => (i - 1 + ordenados.length) % ordenados.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = ordenados[ativo];
      if (r) abrirResultado(r);
    }
  }

  // Mantém a opção ativa visível ao navegar com a seta.
  useEffect(() => {
    if (!aberta) return;
    document.getElementById(`${listaId}-${ativo}`)?.scrollIntoView({ block: "nearest" });
  }, [ativo, aberta, listaId]);

  if (!aberta) return null;

  const termoValido = normalizarBusca(texto, BUSCA_MIN_GLOBAL) !== null;
  let indice = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", paddingTop: "12vh" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar no app"
        className="w-full"
        style={{
          maxWidth: 560,
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
        onKeyDown={onKeyDown}
      >
        <div
          className="flex items-center gap-3 px-4"
          style={{ borderBottom: "1px solid var(--border-subtle)", height: 52 }}
        >
          <Search size={16} aria-hidden style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            role="combobox"
            aria-expanded={ordenados.length > 0}
            aria-controls={listaId}
            aria-activedescendant={ordenados.length ? `${listaId}-${ativo}` : undefined}
            aria-autocomplete="list"
            aria-label="Buscar no app"
            placeholder="Buscar iniciativas, checkpoints, KRs, ações, comentários…"
            maxLength={80}
            autoComplete="off"
            className="flex-1 text-sm bg-transparent"
            style={{ color: "var(--text-primary)", outline: "none", border: "none" }}
          />
          <kbd
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ border: "1px solid var(--border-default)", color: "var(--text-muted)" }}
          >
            Esc
          </kbd>
        </div>

        <div
          id={listaId}
          role="listbox"
          aria-label="Resultados"
          style={{ maxHeight: "50vh", overflowY: "auto" }}
        >
          {ORDEM.map((tipo) => {
            const doTipo = ordenados.filter((r) => r.tipo === tipo);
            if (doTipo.length === 0) return null;
            const { rotulo, icone: Icone } = TIPOS[tipo];
            return (
              <div key={tipo} role="group" aria-label={rotulo}>
                <p
                  className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {rotulo}
                </p>
                {doTipo.map((r) => {
                  indice++;
                  const i = indice;
                  const selecionado = i === ativo;
                  return (
                    <div
                      key={`${r.tipo}-${r.id}`}
                      id={`${listaId}-${i}`}
                      role="option"
                      aria-selected={selecionado}
                      onMouseMove={() => setAtivo(i)}
                      onClick={() => abrirResultado(r)}
                      className="flex items-center gap-3 px-4 py-2 cursor-pointer"
                      style={{ background: selecionado ? "var(--accent-subtle)" : "transparent" }}
                    >
                      <Icone size={15} aria-hidden style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                          {r.titulo}
                        </p>
                        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                          {r.detalhe}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Estado: a região é viva para o leitor de tela anunciar o resultado. */}
          <div role="status" aria-live="polite">
            {erro ? (
              <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--status-error-text)" }}>
                {erro}
              </p>
            ) : !termoValido ? (
              <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--text-muted)" }}>
                Digite ao menos {BUSCA_MIN_GLOBAL} letras.
              </p>
            ) : carregando && ordenados.length === 0 ? (
              <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--text-muted)" }}>
                Buscando…
              </p>
            ) : ordenados.length === 0 ? (
              <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--text-muted)" }}>
                Nada encontrado para &ldquo;{texto.trim()}&rdquo;.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
