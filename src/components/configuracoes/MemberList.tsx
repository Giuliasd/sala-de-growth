"use client";

import { useState } from "react";
import { Users, Pencil, Power } from "lucide-react";
import { TeamMember } from "@/generated/prisma/client";
import { MemberRole } from "@/generated/prisma/enums";
import { updateTeamMember, toggleMemberActive } from "@/actions/team-members";
import { Button } from "@/components/shared/Button";
import { Avatar } from "@/components/shared/Avatar";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { Input } from "@/components/shared/Field";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { toast } from "@/components/shared/Toast";

const ROLE_LABELS: Record<MemberRole, string> = {
  VISITANTE: "Visitante",
  COLABORADOR: "Colaborador",
  LIDERANCA: "Liderança",
};

const ROLE_STYLES: Record<MemberRole, React.CSSProperties> = {
  VISITANTE: {
    background: "var(--bg-app)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
  },
  COLABORADOR: {
    background: "var(--accent-subtle)",
    color: "var(--brand-primary)",
    border: "1px solid var(--accent)",
  },
  LIDERANCA: {
    background: "var(--status-done-bg)",
    color: "var(--status-done-text)",
    border: "1px solid transparent",
  },
};

function RoleBadge({ role }: { role: MemberRole }) {
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 shrink-0"
      style={{ borderRadius: "var(--radius-full)", ...ROLE_STYLES[role] }}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function MemberList({
  members,
  currentUserId,
  currentUserRole,
}: {
  members: TeamMember[];
  currentUserId: string;
  currentUserRole: MemberRole;
}) {
  const isLideranca = currentUserRole === MemberRole.LIDERANCA;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingEmail, setEditingEmail] = useState("");
  const [editingRole, setEditingRole] = useState<MemberRole>(MemberRole.COLABORADOR);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<TeamMember | null>(null);

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    setLoadingId(id);
    const res = await updateTeamMember(id, {
      name: editingName,
      email: editingEmail,
      role: editingRole,
    });
    setLoadingId(null);
    if (res.success) {
      setEditingId(null);
      toast("Membro atualizado.");
    } else {
      toast(res.error, "error");
    }
  }

  async function doToggle(member: TeamMember) {
    setConfirmToggle(null);
    setLoadingId(member.id);
    const res = await toggleMemberActive(member.id);
    setLoadingId(null);
    if (res.success) {
      toast(member.isActive ? "Membro desativado." : "Membro reativado.");
    } else {
      toast(res.error, "error");
    }
  }

  function startEditing(member: TeamMember) {
    setEditingId(member.id);
    setEditingName(member.name);
    setEditingEmail(member.email ?? "");
    setEditingRole(member.role as MemberRole);
  }

  return (
    <>
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
              <Users size={18} style={{ color: "var(--brand-primary)" }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Membros do Time
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Quem tem acesso à plataforma
              </p>
            </div>
          </div>
        </div>

        {/* Member list */}
        {members.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum membro cadastrado" />
        ) : (
          <ul>
            {members.map((member, idx) => {
              const isEditing = editingId === member.id;
              const isCurrentUser = member.id === currentUserId;
              const isLast = idx === members.length - 1;

              if (isEditing) {
                return (
                  <li
                    key={member.id}
                    style={{
                      borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                      padding: "8px 0",
                    }}
                  >
                    <form
                      onSubmit={(e) => handleUpdate(e, member.id)}
                      className="p-3 rounded-xl space-y-3"
                      style={{
                        background: "var(--bg-app)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <div>
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
                        </div>
                        <div>
                          <label
                            className="block text-xs font-medium mb-1.5"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            E-mail
                          </label>
                          <Input
                            type="email"
                            value={editingEmail}
                            onChange={(e) => setEditingEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      {/* Role selector */}
                      <div>
                        <label
                          className="block text-xs font-medium mb-1.5"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Role
                        </label>
                        <div className="flex gap-2">
                          {(Object.values(MemberRole) as MemberRole[]).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setEditingRole(r)}
                              className="text-xs font-medium px-3 py-1.5 transition-colors"
                              style={{
                                borderRadius: "var(--radius-full)",
                                cursor: "pointer",
                                border: "1px solid",
                                ...(editingRole === r
                                  ? ROLE_STYLES[r]
                                  : {
                                      background: "var(--bg-surface)",
                                      color: "var(--text-muted)",
                                      borderColor: "var(--border-default)",
                                    }),
                              }}
                            >
                              {ROLE_LABELS[r]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={loadingId === member.id}
                        >
                          {loadingId === member.id ? "Salvando..." : "Salvar"}
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
                  key={member.id}
                  className="list-row flex items-center justify-between"
                  style={{
                    padding: "10px 8px",
                    borderRadius: "var(--radius-md)",
                    borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                    opacity: member.isActive ? 1 : 0.6,
                  }}
                >
                  {/* Avatar + Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={member.name} size={32} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-sm font-medium"
                          style={{
                            color: "var(--text-primary)",
                            textDecoration: member.isActive ? "none" : "line-through",
                          }}
                        >
                          {member.name}
                        </span>
                        {isCurrentUser && (
                          <Badge
                            className="shrink-0"
                            bg="var(--accent-subtle)"
                            color="var(--brand-primary)"
                            borderColor="var(--accent)"
                          >
                            Você
                          </Badge>
                        )}
                        <RoleBadge role={member.role as MemberRole} />
                        {!member.isActive && (
                          <Badge
                            className="shrink-0"
                            bg="var(--status-cancelled-bg)"
                            color="var(--status-cancelled-text)"
                          >
                            Inativo
                          </Badge>
                        )}
                      </div>
                      <p
                        className="text-xs truncate mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {member.email}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {/* Editar — só liderança */}
                    {isLideranca && (
                      <>
                        <IconButton onClick={() => startEditing(member)} title="Editar" aria-label="Editar">
                          <Pencil size={13} />
                        </IconButton>

                        {/* Toggle ativo/inativo — hover vermelho quando ativo (desativar) */}
                        <IconButton
                          onClick={() => {
                            if (isCurrentUser && member.isActive) return;
                            if (member.isActive) {
                              setConfirmToggle(member);
                            } else {
                              doToggle(member);
                            }
                          }}
                          title={
                            isCurrentUser && member.isActive
                              ? "Você não pode desativar a si mesmo"
                              : member.isActive
                              ? "Desativar"
                              : "Reativar"
                          }
                          aria-label={member.isActive ? "Desativar" : "Reativar"}
                          disabled={isCurrentUser && member.isActive}
                          className={member.isActive && !isCurrentUser ? "icon-btn--danger" : ""}
                        >
                          <Power size={13} />
                        </IconButton>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Confirm deactivate */}
      {confirmToggle && (
        <ConfirmDialog
          title="Desativar Membro"
          message={`Desativar ${confirmToggle.name}? A pessoa perde o acesso imediatamente, mas tudo que está no nome dela (iniciativas, experimentos, comentários, histórico) permanece na Sala de Growth. Dá para reativar depois.`}
          confirmLabel="Desativar"
          variant="danger"
          onConfirm={() => doToggle(confirmToggle)}
          onCancel={() => setConfirmToggle(null)}
        />
      )}
    </>
  );
}
