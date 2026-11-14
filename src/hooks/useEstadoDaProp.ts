"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * Cópia local de uma prop, editável (atualização otimista, rascunho de campo),
 * que volta ao valor da prop sempre que a prop muda.
 *
 * Substitui `useEffect(() => setLocal(prop), [prop])`. O efeito mostrava um
 * render com o valor velho e depois re-renderizava; aqui o ajuste acontece
 * durante o render (padrão "ajustar estado quando a prop muda" da documentação
 * do React), sem render intermediário e sem setState dentro de efeito.
 *
 * "Mudou" é por identidade (`Object.is`) — igual às dependências do efeito que
 * isto substitui. Para arrays/objetos vindos do servidor, cada `router.refresh()`
 * traz uma referência nova e a cópia local é reposta, como antes.
 *
 * `derivar` transforma a prop na cópia local (ex.: acrescentar um campo). A
 * comparação continua sendo sobre a prop, então `derivar` pode devolver um
 * objeto novo a cada chamada sem repor o estado a todo render.
 */
export function useEstadoDaProp<P, T = P>(
  prop: P,
  derivar?: (prop: P) => T
): [T, Dispatch<SetStateAction<T>>] {
  const calcular = (p: P): T => (derivar ? derivar(p) : (p as unknown as T));
  const [local, setLocal] = useState<T>(() => calcular(prop));
  const [propAnterior, setPropAnterior] = useState<P>(() => prop);
  if (!Object.is(prop, propAnterior)) {
    setPropAnterior(() => prop);
    setLocal(() => calcular(prop));
  }
  return [local, setLocal];
}
