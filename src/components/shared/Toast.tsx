"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";

type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const TOAST_EVENT = "sg:toast";
let seq = 0;

/**
 * Quanto cada toast fica na tela. Erro dura mais que confirmação: "Erro ao
 * atualizar o status" sumia em 3s, antes de dar para ler e entender o que
 * reverteu.
 */
const DURACAO_MS: Record<ToastType, number> = {
  success: 3500,
  info: 4500,
  error: 8000,
};

/**
 * Dispara um toast de qualquer lugar (inclusive fora da árvore React):
 * `toast("Salvo!")` ou `toast("Erro ao salvar", "error")`.
 */
export function toast(message: string, type: ToastType = "success") {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }));
}

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ICON_COLOR: Record<ToastType, string> = {
  success: "var(--status-done-text)",
  error: "var(--status-error-text)",
  info: "var(--brand-primary)",
};

function ToastRow({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const [pausado, setPausado] = useState(false);
  const Icon = ICONS[item.type];

  // O relógio pausa com o mouse ou o foco em cima: dá tempo de ler e de
  // alcançar o botão de fechar. Ao sair, volta a contar do início.
  useEffect(() => {
    if (pausado) return;
    const t = setTimeout(() => onClose(item.id), DURACAO_MS[item.type]);
    return () => clearTimeout(t);
  }, [pausado, item.id, item.type, onClose]);

  return (
    <div
      className="toast-item"
      // Erro interrompe o leitor de tela; o resto espera a vez.
      role={item.type === "error" ? "alert" : undefined}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <Icon size={16} style={{ color: ICON_COLOR[item.type], flexShrink: 0 }} />
      <p className="text-sm" style={{ color: "var(--text-primary)" }}>
        {item.message}
      </p>
      <IconButton
        type="button"
        boxSize={22}
        onClick={() => onClose(item.id)}
        aria-label="Fechar aviso"
        style={{ marginLeft: 4, flexShrink: 0 }}
      >
        <X size={14} />
      </IconButton>
    </div>
  );
}

// Container global de toasts. Montado uma vez no layout do app.
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const fechar = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  // Última mensagem repetida em sequência não empilha: três cliques rápidos no
  // mesmo erro viravam três toasts idênticos.
  const ultima = useRef<{ message: string; type: ToastType; at: number } | null>(null);

  useEffect(() => {
    function onToast(e: Event) {
      const { message, type } = (e as CustomEvent).detail as { message: string; type: ToastType };
      const agora = Date.now();
      const u = ultima.current;
      if (u && u.message === message && u.type === type && agora - u.at < 1000) return;
      ultima.current = { message, type, at: agora };
      const id = ++seq;
      setItems((prev) => [...prev, { id, message, type }]);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  // A região viva fica SEMPRE montada: um aria-live inserido junto com o
  // conteúdo costuma não ser anunciado pelos leitores de tela.
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => (
        <ToastRow key={t.id} item={t} onClose={fechar} />
      ))}
    </div>
  );
}
