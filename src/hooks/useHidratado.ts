"use client";

import { useSyncExternalStore } from "react";

const semAssinatura = () => () => {};

/**
 * `false` no HTML do servidor e no render de hidratação; `true` daí em diante.
 *
 * Substitui o `const [mounted, setMounted] = useState(false)` +
 * `useEffect(() => setMounted(true), [])`: o resultado na tela é o mesmo, sem
 * setState dentro de efeito (regra `react-hooks/set-state-in-effect`). Use para
 * o que só pode existir no navegador — portal em `document.body`, valor
 * aleatório, preferência do localStorage — sem divergir da hidratação.
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false
  );
}
