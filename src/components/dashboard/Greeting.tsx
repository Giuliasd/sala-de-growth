"use client";

import { useState } from "react";
import { getGreeting, getRandomEnergyEmoji } from "@/lib/greetings";
import { useHidratado } from "@/hooks/useHidratado";

interface GreetingProps {
  name: string;
}

export function Greeting({ name }: GreetingProps) {
  // O emoji é sorteado uma vez por montagem e só aparece depois da hidratação:
  // sorteado no servidor, divergiria do HTML que o navegador recebeu.
  const [emoji] = useState(getRandomEnergyEmoji);
  const hidratado = useHidratado();
  const text = getGreeting(name, hidratado ? emoji : undefined);

  return (
    <h1
      // Mesma fonte/tamanho do título do roadmap (text-2xl font-bold, sem
      // letter-spacing), para os títulos de página não terem três receitas.
      className="text-2xl font-bold"
      style={{ color: "var(--text-primary)" }}
    >
      {text}
    </h1>
  );
}
