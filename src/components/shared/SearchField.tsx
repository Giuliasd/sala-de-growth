"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/shared/Field";

/**
 * Campo de busca das listas. O valor mora na URL (`?q=`), como os demais
 * filtros: este componente só segura o texto digitado e avisa `onSearch` depois
 * de uma pausa, para não navegar a cada tecla.
 *
 * - Esc limpa o campo.
 * - `value` é o que a URL tem agora. Se mudar por fora (ex.: "Limpar filtros"),
 *   o texto acompanha — mas NÃO quando a mudança é eco da própria digitação:
 *   senão a resposta atrasada do servidor apagava o que a pessoa já tinha
 *   digitado depois.
 */
export function SearchField({
  value,
  onSearch,
  placeholder = "Buscar por nome…",
  label = "Buscar",
  delay = 350,
}: {
  value: string;
  onSearch: (texto: string) => void;
  placeholder?: string;
  label?: string;
  delay?: number;
}) {
  const [texto, setTexto] = useState(value);
  // Último valor que ESTE campo já mandou para a URL.
  const [emitido, setEmitido] = useState(value);
  const [anterior, setAnterior] = useState(value);

  // Ajuste de estado durante o render (padrão do React para derivar de props):
  // só sincroniza quando a URL mudou e não foi por nós.
  if (value !== anterior) {
    setAnterior(value);
    if (value !== emitido) {
      setTexto(value);
      setEmitido(value);
    }
  }

  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    const alvo = texto.trim();
    if (alvo === emitido) return;
    const t = setTimeout(() => {
      setEmitido(alvo);
      onSearchRef.current(alvo);
    }, delay);
    return () => clearTimeout(t);
  }, [texto, emitido, delay]);

  return (
    <div className="relative" style={{ width: 220 }}>
      <Search
        size={14}
        aria-hidden
        className="absolute pointer-events-none"
        style={{ left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
      />
      <Input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && texto) {
            e.preventDefault();
            setTexto("");
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        maxLength={80}
        // type=search ganha um "x" nativo no Chrome; o nosso é consistente nos navegadores.
        style={{ paddingLeft: 30, paddingRight: texto ? 28 : undefined }}
      />
      {texto && (
        <button
          type="button"
          onClick={() => setTexto("")}
          aria-label="Limpar busca"
          className="absolute"
          style={{
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-muted)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            display: "flex",
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
