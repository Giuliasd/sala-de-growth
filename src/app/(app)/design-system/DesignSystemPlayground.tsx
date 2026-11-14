"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sun, Moon, Plus, X, Table2, LayoutGrid, BarChart2, Eye, EyeOff, Send } from "lucide-react";
import { applyTheme } from "@/lib/theme";
import { useResolvedTheme } from "@/components/theme/useThemeMode";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { toast } from "@/components/shared/Toast";
import { Field, Input, Textarea } from "@/components/shared/Field";
import { Dropdown } from "@/components/shared/Dropdown";
import { TagSelect } from "@/components/shared/TagSelect";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FilterPill } from "@/components/shared/FilterPill";
import { Avatar } from "@/components/shared/Avatar";

// Demos interativas da página /design-system (toggle de tema, Modal, Toast, Field, Motion).
export function DesignSystemPlayground() {
  const resolved = useResolvedTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [segView, setSegView] = useState("lista");
  const [items, setItems] = useState([1, 2, 3]);
  const [nextId, setNextId] = useState(4);
  const [quarterDemo, setQuarterDemo] = useState("q3");
  const [selecao, setSelecao] = useState("a");
  const [pessoaDemo, setPessoaDemo] = useState("todos");
  const isDark = resolved === "dark";
  const [pillsAtivas, setPillsAtivas] = useState<Set<string>>(new Set());
  const alternarPill = (k: string) =>
    setPillsAtivas((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="space-y-16">
      {/* Toggle de tema (afeta o app todo — é uma página de dev) */}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => applyTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          {isDark ? "Ver no claro" : "Ver no escuro"}
        </Button>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Tema atual: {isDark ? "escuro" : "claro"}
        </span>
      </div>

      {/* FilterPill */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>
          FilterPill — pill de filtro
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>Todas as pills são iguais.</strong> Numa barra de filtros, toda pill
          (liga/desliga, categoria, tag, pessoa) tem a mesma caixa: <code>text-xs</code>,{" "}
          <code>px-2 py-1</code>, borda de 1px e raio cheio — 25px de altura. O que muda de
          uma para outra é só a <strong>cor</strong> (e um ícone/avatar de até 16px, que não
          altera a altura).
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Use <code>components/shared/FilterPill</code>, passando <code>colors</code> para
          pintar. Não recrie a pill com classes locais: foi assim que a barra dos checkpoints
          ficou com três alturas lado a lado. Os badges de status (<code>.badge</code>) são
          outro componente — rótulo, não filtro.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill
            active={pillsAtivas.has("ocultar")}
            onClick={() => alternarPill("ocultar")}
            icon={pillsAtivas.has("ocultar") ? <EyeOff size={12} /> : <Eye size={12} />}
          >
            {pillsAtivas.has("ocultar") ? "Concluídos ocultos" : "Ocultar concluídos"}
          </FilterPill>
          <FilterPill
            active={pillsAtivas.has("com")}
            onClick={() => alternarPill("com")}
            icon={<Send size={12} strokeWidth={2} />}
            colors={{ bg: "var(--blush-soft)", text: "var(--blush-strong)", border: "var(--blush)" }}
          >
            Apenas comunicações
          </FilterPill>
          {(["sky", "sage", "butter"] as const).map((c, i) => (
            <FilterPill
              key={c}
              active={pillsAtivas.has(c)}
              onClick={() => alternarPill(c)}
              colors={{ bg: `var(--${c}-soft)`, text: `var(--${c}-strong)`, border: `var(--${c})`, always: true }}
              activeRing
            >
              {["Design", "QA", "Revisão"][i]}
            </FilterPill>
          ))}
          <FilterPill
            active={pillsAtivas.has("pessoa")}
            onClick={() => alternarPill("pessoa")}
            icon={<Avatar name="Bruno Teixeira" size={16} />}
            colors={{
              bg: "var(--bg-surface)",
              text: pillsAtivas.has("pessoa") ? "var(--text-primary)" : "var(--text-muted)",
              border: pillsAtivas.has("pessoa") ? "var(--brand-primary)" : "var(--border-subtle)",
              always: true,
            }}
            style={{ paddingLeft: 4 }}
          >
            Bruno
          </FilterPill>
        </div>
      </section>

      {/* Dropdown */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>Dropdown</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>Todo dropdown do produto é este componente.</strong> Seletor de quarter,
          filtro de responsável, filtro de mês, filtro de lista — todos com o mesmo botão de
          superfície (borda, <code>radius-md</code>, sombra sm, chevron) e o mesmo menu no tema,
          em portal, com teclado (↑/↓, Enter, Esc).
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Nunca use <code>&lt;select&gt;</code> nativo: o menu dele é desenhado pelo sistema
          operacional (fundo branco, azul do Windows) e quebra o tema — era o que acontecia no
          seletor de quarter. Quando o gatilho é o próprio pill (status, prioridade, resultado),
          use <code>TagSelect</code>: mesmo menu, outro gatilho. Para escolha múltipla,{" "}
          <code>MultiSelect</code>. Nos formulários, <code>Field</code> +{" "}
          <code>Select</code> segue nativo, porque depende da validação do browser.
        </p>
        <div
          className="flex items-end gap-6 flex-wrap p-6"
          style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>sem rótulo</p>
            <Dropdown
              value={quarterDemo}
              onChange={setQuarterDemo}
              options={[
                { value: "q4", label: "Q4 2026" },
                { value: "q3", label: "Q3 2026 (ativo)" },
                { value: "q2", label: "Q2 2026" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>com rótulo interno</p>
            <Dropdown
              label="Responsável"
              value={pessoaDemo}
              onChange={setPessoaDemo}
              options={[
                { value: "todos", label: "Todos" },
                { value: "1", label: "Camila Rocha" },
                { value: "2", label: "Rafael Nunes" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>gatilho de pill (TagSelect)</p>
            <TagSelect
              value="EM_ANDAMENTO"
              options={[
                { value: "PLANEJADA", label: "Planejada" },
                { value: "EM_ANDAMENTO", label: "Em Andamento" },
                { value: "CONCLUIDA", label: "Concluída" },
              ]}
              onChange={() => {}}
            >
              <StatusBadge status="EM_ANDAMENTO" />
            </TagSelect>
          </div>
        </div>
      </section>

      {/* Field */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>Field</h2>
        <div
          className="grid grid-cols-2 gap-4 p-6"
          style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}
        >
          <Field label="Texto"><Input placeholder="Digite algo…" /></Field>
          {/* Campo de seleção é Dropdown, nunca <select> nativo: o menu dele é
              desenhado pelo sistema operacional e ignora o tema. */}
          <Field label="Seleção">
            <Dropdown
              value={selecao}
              options={[
                { value: "a", label: "Opção A" },
                { value: "b", label: "Opção B" },
              ]}
              onChange={setSelecao}
              fullWidth
            />
          </Field>
          <Field label="Com erro" error="Campo obrigatório"><Input defaultValue="" /></Field>
          <Field label="Desabilitado"><Input value="Somente leitura" disabled readOnly /></Field>
          <div className="col-span-2">
            <Field label="Área de texto" hint="Dica opcional abaixo do campo">
              <Textarea rows={2} placeholder="Escreva…" />
            </Field>
          </div>
        </div>
      </section>

      {/* Motion — lista animada (entra/sai/reordena) */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>Motion — lista</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Itens entram, saem e reposicionam com continuidade (usado em kanban, checkpoints e OKRs).
        </p>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => { setItems((prev) => [...prev, nextId]); setNextId((n) => n + 1); }}>
            <Plus size={14} /> Adicionar
          </Button>
        </div>
        <div
          className="p-4 flex flex-col gap-2"
          style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}
        >
          <AnimatePresence initial={false}>
            {items.map((id) => (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between px-3 py-2"
                style={{ background: "var(--bg-app)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}
              >
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>Item {id}</span>
                <button
                  onClick={() => setItems((prev) => prev.filter((x) => x !== id))}
                  aria-label={`Remover item ${id}`}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                >
                  <X size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* SegmentedToggle */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>SegmentedToggle</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          &quot;Escolha um&quot; entre N opções (view/período). Um só primitivo — estado ativo, hover e foco vêm do CSS.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <SegmentedToggle
            ariaLabel="Exemplo de visualização"
            value={segView}
            onChange={setSegView}
            items={[
              { value: "lista", label: "Tabela", icon: Table2 },
              { value: "kanban", label: "Kanban", icon: LayoutGrid },
              { value: "analise", label: "Análise", icon: BarChart2 },
            ]}
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Ativo: {segView}</span>
        </div>
      </section>

      {/* Modal + Toast + ConfirmDialog */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>Modal · Toast · ConfirmDialog</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => setModalOpen(true)}>Abrir modal</Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>Abrir confirmação</Button>
          <Button variant="secondary" onClick={() => toast("Salvo com sucesso.")}>Toast sucesso</Button>
          <Button variant="secondary" onClick={() => toast("Algo deu errado.", "error")}>Toast erro</Button>
          <Button variant="ghost" onClick={() => toast("Só um aviso.", "info")}>Toast info</Button>
        </div>
      </section>

      {confirmOpen && (
        <ConfirmDialog
          title="Excluir item?"
          message="Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={() => { toast("Item excluído.", "error"); setConfirmOpen(false); }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} labelledBy="ds-modal-title">
        <div className="flex flex-col gap-3">
          <h3 id="ds-modal-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Exemplo de modal
          </h3>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Abre e fecha com animação, fecha no ESC ou clicando fora.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Fechar</Button>
            <Button variant="primary" size="sm" onClick={() => { toast("Confirmado!"); setModalOpen(false); }}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
