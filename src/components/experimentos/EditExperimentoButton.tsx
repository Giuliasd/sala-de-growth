"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/shared/Button";
import dynamic from "next/dynamic";

// Formulário só abre sob demanda (modal): fica fora do bundle inicial da tela.
const ExperimentoForm = dynamic(
  () => import("@/components/experimentos/ExperimentoForm").then((m) => ({ default: m.ExperimentoForm })),
  { ssr: false }
);

type QuarterItem = { id: string; year: number; quarter: number; isActive: boolean };
type FrenteItem = { id: string; name: string; isActive: boolean };
type MemberItem = { id: string; name: string; isActive: boolean };
type OKRItem = { id: string; objective: string };

export function EditExperimentoButton({
  experimento,
  quarters,
  frentes,
  members,
  okrs,
}: {
  experimento: any;
  quarters: QuarterItem[];
  frentes: FrenteItem[];
  members: MemberItem[];
  okrs: OKRItem[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setShowForm(true)}>
        <Pencil size={16} />
        Editar
      </Button>

      {showForm && (
        <ExperimentoForm
          mode="edit"
          experimento={experimento}
          quarters={quarters}
          frentes={frentes}
          members={members}
          initialOkrs={okrs}
          selectedQuarterId={experimento.quarterId}
          onSuccess={() => {
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </>
  );
}
