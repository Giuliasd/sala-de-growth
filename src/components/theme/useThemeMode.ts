"use client";

import { useEffect, useSyncExternalStore } from "react";
import { applyTheme, readThemeCookie, THEME_EVENT, type ThemeMode } from "@/lib/theme";

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

/**
 * Modo de tema atual, lido do cookie via useSyncExternalStore (evita mismatch
 * de hidratação: getServerSnapshot retorna "system").
 */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore<ThemeMode>(subscribe, readThemeCookie, () => "system");
}

function subscribeResolved(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(THEME_EVENT, onChange);
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    mq.removeEventListener("change", onChange);
  };
}

/**
 * Tema efetivamente aplicado ("light" | "dark"), resolvendo "system". Lê o
 * data-theme do <html> (mantido em dia por applyTheme/useSystemThemeSync/script
 * inline) e reage tanto à troca deliberada quanto à preferência do SO.
 */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeResolved,
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    () => "light",
  );
}

/**
 * Enquanto o modo for "system", mantém o `data-theme` em sincronia com a
 * preferência do SO. Deve ser usado uma única vez num componente sempre montado
 * (a Sidebar), para valer em todo o app sem duplicar listeners.
 */
export function useSystemThemeSync(mode: ThemeMode) {
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
}
