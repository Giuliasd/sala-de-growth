// Lógica de tema compartilhada entre o ThemeToggle (perfil) e o atalho da
// sidebar. Funções tocam `document`/`window` só quando chamadas (client-side);
// nada roda no nível de módulo, então é seguro importar de qualquer lugar.

export type ThemeMode = "system" | "light" | "dark";

export const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Escuro",
};

// Evento interno pra sincronizar todos os consumidores do tema na mesma aba.
export const THEME_EVENT = "sg:themechange";

export function readThemeCookie(): ThemeMode {
  const m = document.cookie.match(/(?:^|; )theme=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : "system";
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  // Anima só a troca deliberada; a classe é removida após a transição do CSS.
  root.classList.add("theme-transition");
  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => root.classList.remove("theme-transition"), 300);

  root.setAttribute("data-theme", resolveTheme(mode));
  // 1 ano; sem httpOnly de propósito (o SSR e os componentes precisam ler).
  document.cookie = `theme=${mode}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(THEME_EVENT));
}
