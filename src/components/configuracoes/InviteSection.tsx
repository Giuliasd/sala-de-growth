"use client";

import { useState } from "react";
import { Mail, Copy, Trash2, CheckCircle2, Plus, X } from "lucide-react";
import { MemberRole } from "@/generated/prisma/enums";
import { createInvite, revokeInvite } from "@/actions/invites";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { Input } from "@/components/shared/Field";
import { toast } from "@/components/shared/Toast";
import { acaoSegura } from "@/lib/acao-segura";

const ROLE_LABELS: Record<MemberRole, string> = {
  VISITANTE: "Visitante",
  COLABORADOR: "Colaborador",
  LIDERANCA: "Liderança",
};

type PendingInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdBy: { name: string };
};

export function InviteSection({ pendingInvites }: { pendingInvites: PendingInvite[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>(MemberRole.COLABORADOR);
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await acaoSegura(createInvite({ email, role }));
    setLoading(false);
    if (res.success) {
      setGeneratedUrl(res.data.inviteUrl);
      setEmail("");
      setRole(MemberRole.COLABORADOR);
    } else {
      toast(res.error, "error");
    }
  }

  async function handleRevoke(id: string, inviteEmail: string) {
    setRevokingId(id);
    const res = await revokeInvite(id);
    setRevokingId(null);
    if (res.success) {
      toast(`Convite para ${inviteEmail} revogado.`);
    } else {
      toast(res.error, "error");
    }
  }

  async function handleCopy() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetForm() {
    setIsAdding(false);
    setGeneratedUrl(null);
    setEmail("");
    setRole(MemberRole.COLABORADOR);
  }

  return (
    <>
      <Card padding="24px 28px">
        {/* Header */}
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
              <Mail size={18} style={{ color: "var(--brand-primary)" }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Convidar Membros
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Gere links de acesso para novos integrantes
              </p>
            </div>
          </div>
          {!isAdding && !generatedUrl && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAdding(true)}
            >
              <Plus size={14} />
              Novo Convite
            </Button>
          )}
        </div>

        {/* Create form */}
        {isAdding && !generatedUrl && (
          <form
            onSubmit={handleCreate}
            className="mb-4 p-4 rounded-xl space-y-3"
            style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
          >
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                E-mail do convidado
              </label>
              <Input
                autoFocus
                type="email"
                placeholder="nome@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Cargo inicial
              </label>
              <div className="flex gap-2 flex-wrap">
                {(Object.values(MemberRole) as MemberRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className="text-xs font-medium px-3 py-1.5 transition-colors"
                    style={{
                      borderRadius: "var(--radius-full)",
                      cursor: "pointer",
                      border: `1px solid ${role === r ? "var(--brand-primary)" : "var(--border-default)"}`,
                      background: role === r ? "var(--brand-primary)" : "var(--bg-surface)",
                      color: role === r ? "white" : "var(--text-secondary)",
                    }}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={loading}>
                {loading ? "Gerando..." : "Gerar link"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {/* Generated link */}
        {generatedUrl && (
          <div
            className="mb-4 p-4 rounded-xl space-y-3"
            style={{ background: "var(--bg-app)", border: "1px solid var(--border-subtle)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Link de convite gerado
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={generatedUrl}
                className="flex-1 text-xs font-mono"
                style={{ color: "var(--text-secondary)" }}
              />
              <button
                onClick={handleCopy}
                data-tooltip="Copiar link"
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors shrink-0"
                style={{
                  background: copied ? "var(--status-done-bg)" : "var(--accent-subtle)",
                  color: copied ? "var(--status-done-text)" : "var(--brand-primary)",
                  border: "1px solid transparent",
                }}
              >
                {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Compartilhe este link com o convidado. Válido por 7 dias.
            </p>
            <Button variant="secondary" size="sm" onClick={resetForm}>
              <X size={13} />
              Fechar
            </Button>
          </div>
        )}

        {/* Pending invites list */}
        {pendingInvites.length === 0 && !isAdding && !generatedUrl ? (
          <EmptyState icon={Mail} title="Nenhum convite pendente" />
        ) : pendingInvites.length > 0 ? (
          <div>
            <p className="text-xs font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
              Convites pendentes
            </p>
            <ul>
              {pendingInvites.map((invite, idx) => {
                const isLast = idx === pendingInvites.length - 1;
                return (
                  <li
                    key={invite.id}
                    className="flex items-center justify-between py-2.5 px-2"
                    style={{
                      borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {invite.email}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {ROLE_LABELS[invite.role as MemberRole]} · Expira{" "}
                        {new Date(invite.expiresAt).toLocaleDateString("pt-BR")} · por {invite.createdBy.name}
                      </p>
                    </div>
                    <IconButton
                      onClick={() => handleRevoke(invite.id, invite.email)}
                      disabled={revokingId === invite.id}
                      title="Revogar convite"
                      aria-label="Revogar convite"
                      className="icon-btn--danger ml-3"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Card>
    </>
  );
}
