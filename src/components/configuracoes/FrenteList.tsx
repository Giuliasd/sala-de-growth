"use client";

import { useState } from "react";
import { Layers, Pencil, Power, Plus, X } from "lucide-react";
import { Frente } from "@/generated/prisma/client";
import { createFrente, updateFrente, toggleFrenteActive } from "@/actions/frentes";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { Input } from "@/components/shared/Field";
import { toast } from "@/components/shared/Toast";

export function FrenteList({ frentes }: { frentes: Frente[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [addingName, setAddingName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addingName.trim()) return;
    const res = await createFrente({ name: addingName });
    if (res.success) {
      setIsAdding(false);
      setAddingName("");
      toast("Frente criada com sucesso.");
    } else {
      toast(res.error, "error");
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    if (!editingName.trim()) return;
    setLoadingId(id);
    const res = await updateFrente(id, { name: editingName });
    setLoadingId(null);
    if (res.success) {
      setEditingId(null);
      toast("Frente atualizada.");
    } else {
      toast(res.error, "error");
    }
  }

  async function handleToggle(frente: Frente) {
    setLoadingId(frente.id);
    const res = await toggleFrenteActive(frente.id);
    setLoadingId(null);
    if (res.success) {
      toast(frente.isActive ? "Frente desativada." : "Frente reativada.");
    } else {
      toast(res.error, "error");
    }
  }

  function startEditing(frente: Frente) {
    setEditingId(frente.id);
    setEditingName(frente.name);
    setIsAdding(false);
  }

  return (
    <Card padding="24px 28px">
        {/* Section header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "var(--radius-full)",
                background: "var(--accent-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Layers size={18} style={{ color: "var(--brand-primary)" }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Frentes
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Áreas de atuação do time
              </p>
            </div>
          </div>
          {!isAdding && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setIsAdding(true);
                setEditingId(null);
                setAddingName("");
              }}
            >
              <Plus size={14} />
              Nova Frente
            </Button>
          )}
        </div>

        {/* Inline add form */}
        {isAdding && (
          <form
            onSubmit={handleAdd}
            className="mb-4 p-4 rounded-xl"
            style={{
              background: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Nome da Frente
            </label>
            <Input
              autoFocus
              type="text"
              placeholder="Ex: Aquisição, Ativação..."
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              required
            />
            <div className="flex gap-2 mt-3">
              <Button type="submit" variant="primary" size="sm">
                Salvar
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setAddingName("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {/* List */}
        {frentes.length === 0 && !isAdding ? (
          <EmptyState icon={Layers} title="Nenhuma frente cadastrada" />
        ) : (
          <ul>
            {frentes.map((frente, idx) => {
              const isEditing = editingId === frente.id;
              const isLast = idx === frentes.length - 1;

              if (isEditing) {
                return (
                  <li
                    key={frente.id}
                    style={{
                      borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                      padding: "8px 0",
                    }}
                  >
                    <form
                      onSubmit={(e) => handleUpdate(e, frente.id)}
                      className="p-3 rounded-xl"
                      style={{
                        background: "var(--bg-app)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <label
                        className="block text-xs font-medium mb-1.5"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Nome
                      </label>
                      <Input
                        autoFocus
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        required
                      />
                      <div className="flex gap-2 mt-3">
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={loadingId === frente.id}
                        >
                          {loadingId === frente.id ? "Salvando..." : "Salvar"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  </li>
                );
              }

              return (
                <li
                  key={frente.id}
                  className="list-row flex items-center justify-between"
                  style={{
                    padding: "12px 8px",
                    borderRadius: "var(--radius-md)",
                    borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                    opacity: frente.isActive ? 1 : 0.6,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-sm font-medium truncate"
                      style={{
                        color: "var(--text-primary)",
                        textDecoration: frente.isActive ? "none" : "line-through",
                      }}
                    >
                      {frente.name}
                    </span>
                    {!frente.isActive && (
                      <Badge
                        className="shrink-0"
                        bg="var(--status-cancelled-bg)"
                        color="var(--status-cancelled-text)"
                      >
                        Inativa
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {/* Editar */}
                    <IconButton onClick={() => startEditing(frente)} title="Editar" aria-label="Editar">
                      <Pencil size={13} />
                    </IconButton>
                    {/* Toggle ativo/inativo — hover vermelho quando ativo (desativar) */}
                    <IconButton
                      onClick={() => handleToggle(frente)}
                      title={frente.isActive ? "Desativar" : "Reativar"}
                      aria-label={frente.isActive ? "Desativar" : "Reativar"}
                      disabled={loadingId === frente.id}
                      className={frente.isActive ? "icon-btn--danger" : ""}
                    >
                      {frente.isActive ? <Power size={13} /> : <X size={13} />}
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </Card>
  );
}
