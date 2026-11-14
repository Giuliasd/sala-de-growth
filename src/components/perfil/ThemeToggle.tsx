"use client";

import { Monitor, Sun, Moon } from "lucide-react";
import { applyTheme, type ThemeMode } from "@/lib/theme";
import { useSystemThemeSync, useThemeMode } from "@/components/theme/useThemeMode";

const OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
];

export function ThemeToggle() {
  const mode = useThemeMode();
  useSystemThemeSync(mode);

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className="inline-flex gap-1 p-1"
      style={{
        background: "var(--bg-app)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => applyTheme(value)}
            className="flex items-center gap-2 text-sm font-medium transition-colors"
            style={{
              padding: "7px 14px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              cursor: "pointer",
              background: active ? "var(--bg-surface)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: active ? "var(--shadow-sm)" : "none",
            }}
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
