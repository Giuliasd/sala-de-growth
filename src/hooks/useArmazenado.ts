"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// ─── Preferências do navegador (localStorage) como store externa ─────────────
//
// useSyncExternalStore e não useEffect + setState: o servidor e o render de
// hidratação veem `null` (nada guardado), e o valor do navegador entra logo em
// seguida sem setState dentro de efeito. O snapshot é a string crua do storage,
// então comparar por valor é de graça. Sem storage (aba anônima, bloqueio), vale
// a memória da aba. Mesmo padrão do "Ocultar concluídos" do dashboard.

const ouvintes = new Map<string, Set<() => void>>();
const emMemoria = new Map<string, string | null>();

/** Valor guardado na chave, ou `null` se não há nada. */
export function lerArmazenado(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return emMemoria.get(chave) ?? null;
  }
}

/** Grava (ou apaga, com `null`) e avisa quem lê a chave. */
export function gravarArmazenado(chave: string, valor: string | null) {
  emMemoria.set(chave, valor);
  try {
    if (valor === null) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, valor);
  } catch {
    // Fica só em memória.
  }
  ouvintes.get(chave)?.forEach((avisar) => avisar());
}

function assinar(chave: string, avisar: () => void) {
  let daChave = ouvintes.get(chave);
  if (!daChave) {
    daChave = new Set();
    ouvintes.set(chave, daChave);
  }
  daChave.add(avisar);
  // Outra aba mudou a preferência.
  const aoMudarEmOutraAba = (e: StorageEvent) => {
    if (e.key === chave || e.key === null) avisar();
  };
  window.addEventListener("storage", aoMudarEmOutraAba);
  return () => {
    daChave.delete(avisar);
    window.removeEventListener("storage", aoMudarEmOutraAba);
  };
}

/**
 * Valor guardado em `chave` no localStorage — `null` no servidor, na hidratação
 * e quando não há nada guardado. Para gravar, `gravarArmazenado(chave, valor)`.
 */
export function useArmazenado(chave: string): string | null {
  const assinarChave = useCallback((avisar: () => void) => assinar(chave, avisar), [chave]);
  return useSyncExternalStore(
    assinarChave,
    () => lerArmazenado(chave),
    () => null
  );
}

/**
 * `useArmazenado` para várias chaves de uma vez (ex.: um valor por grupo de
 * menu), na mesma ordem de `chaves`. O snapshot é o JSON dos valores — string,
 * que o React compara por valor —, então a lista devolvida só muda de
 * identidade quando algum valor muda.
 */
export function useArmazenados(chaves: readonly string[]): readonly (string | null)[] {
  // Chave estável por valor: o chamador pode montar o array a cada render.
  const lista = JSON.stringify(chaves);
  const assinarTodas = useCallback(
    (avisar: () => void) => {
      const desfazer = (JSON.parse(lista) as string[]).map((c) => assinar(c, avisar));
      return () => desfazer.forEach((d) => d());
    },
    [lista]
  );
  const instantaneo = useSyncExternalStore(
    assinarTodas,
    () => JSON.stringify((JSON.parse(lista) as string[]).map(lerArmazenado)),
    () => JSON.stringify((JSON.parse(lista) as string[]).map(() => null))
  );
  return useMemo(() => JSON.parse(instantaneo) as (string | null)[], [instantaneo]);
}
