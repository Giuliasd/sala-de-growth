"use client";

import { useState } from "react";
import { updateProfile } from "@/actions/profile";
import { Button } from "@/components/shared/Button";
import { Avatar } from "@/components/shared/Avatar";
import { Field, Input } from "@/components/shared/Field";
import { toast } from "@/components/shared/Toast";
import { acaoSegura } from "@/lib/acao-segura";

export function ProfileForm({
  currentName,
  currentEmail,
}: {
  currentName: string;
  currentEmail: string;
}) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === currentName) return;
    setLoading(true);
    const res = await acaoSegura(updateProfile({ name: name.trim() }));
    setLoading(false);
    if (res.success) {
      toast("Perfil atualizado com sucesso.");
    } else {
      toast(res.error ?? "Erro ao atualizar.", "error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Live avatar preview */}
      {name !== currentName && (
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}>
          <Avatar name={name || " "} size={40} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Preview do novo ícone
          </p>
        </div>
      )}

      <Field label="Nome" htmlFor="perfil-nome">
        <Input
          id="perfil-nome"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
      </Field>

      <Field label="E-mail" htmlFor="perfil-email" hint="O e-mail não pode ser alterado">
        <Input id="perfil-email" type="email" value={currentEmail} disabled />
      </Field>

      <Button type="submit" variant="primary" size="sm" disabled={loading || name.trim() === currentName}>
        {loading ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
