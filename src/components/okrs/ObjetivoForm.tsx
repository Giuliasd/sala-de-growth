"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createObjetivo, updateObjetivo } from "@/actions/objetivos";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { Field, Input, Textarea } from "@/components/shared/Field";
import { IconButton } from "@/components/shared/IconButton";
import { acaoSegura } from "@/lib/acao-segura";

interface ObjetivoFormProps {
  quarterId: string;
  // Quando presente, o form edita; senão, cria.
  objetivo?: { id: string; title: string; description: string | null };
  onSuccess: () => void;
  onCancel: () => void;
}

export function ObjetivoForm({ quarterId, objetivo, onSuccess, onCancel }: ObjetivoFormProps) {
  const isEdit = !!objetivo;
  const [title, setTitle] = useState(objetivo?.title ?? "");
  const [description, setDescription] = useState(objetivo?.description ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    const res = isEdit
      ? await acaoSegura(updateObjetivo(objetivo!.id, { title, description }))
      : await acaoSegura(createObjetivo({ quarterId, title, description }));
    setLoading(false);
    if (res.success) {
      onSuccess();
    } else {
      setErrorMsg(res.error);
    }
  }

  return (
    <Modal open onClose={onCancel} labelledBy="objetivo-form-title">
      <div className="flex items-center justify-between mb-6">
        <h2 id="objetivo-form-title" className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          {isEdit ? "Editar objetivo" : "Novo objetivo"}
        </h2>
        <IconButton boxSize={32} onClick={onCancel} aria-label="Fechar">
          <X size={18} />
        </IconButton>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Objetivo">
          <Input
            autoFocus
            placeholder="Ex: Tornar a aquisição previsível e escalável"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>

        <Field label="Descrição (opcional)">
          <Textarea
            rows={3}
            style={{ resize: "none" }}
            placeholder="Contexto do objetivo, se quiser detalhar..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {errorMsg && (
          <p
            className="text-xs px-3 py-2 rounded-lg"
            style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)" }}
          >
            {errorMsg}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" size="md" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={loading}>
            {loading ? "Salvando..." : isEdit ? "Salvar" : "Criar objetivo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
