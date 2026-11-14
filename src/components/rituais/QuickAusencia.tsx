"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { IconButton } from "@/components/shared/IconButton";
import { AusenciaForm } from "@/components/ausencias/AusenciaForm";

/**
 * Registra uma ausência sem sair da Weekly.
 *
 * Reusa o `AusenciaForm` de /ausencias — pessoa, tipo, período e observação são
 * os mesmos campos, e o formulário do ritual não deve divergir do da página.
 *
 * A lista de `members` já chega recortada pela permissão: liderança escolhe
 * qualquer pessoa, colaborador só a si mesmo. A regra é da action
 * (`createAusencia`); filtrar aqui evita oferecer uma escolha que só falharia
 * depois do submit — mesmo motivo do atalho de checkpoint.
 */
export function QuickAusencia({
  members,
}: {
  members: { id: string; name: string; isActive: boolean }[];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <IconButton
        boxSize={24}
        onClick={() => setAberto(true)}
        title="Registrar ausência"
        aria-label="Registrar ausência"
      >
        <Plus size={14} />
      </IconButton>
      {aberto && (
        <AusenciaForm
          mode="create"
          members={members}
          onSuccess={() => {
            setAberto(false);
          }}
          onCancel={() => setAberto(false)}
        />
      )}
    </>
  );
}
