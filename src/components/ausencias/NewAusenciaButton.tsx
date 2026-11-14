"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { AusenciaForm } from "./AusenciaForm";

type MemberItem = { id: string; name: string; isActive: boolean };

export function NewAusenciaButton({ members }: { members: MemberItem[] }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <Button variant="primary" size="md" onClick={() => setShow(true)}>
        <CalendarPlus size={16} />
        Nova Ausência
      </Button>
      {show && (
        <AusenciaForm
          mode="create"
          members={members}
          onSuccess={() => setShow(false)}
          onCancel={() => setShow(false)}
        />
      )}
    </>
  );
}
