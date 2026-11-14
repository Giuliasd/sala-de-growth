"use client";

import { useState, useTransition } from "react";
import { MessageCircle, Trash2, Send, AlertCircle } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { Card } from "@/components/shared/Card";
import { Badge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { IconButton } from "@/components/shared/IconButton";
import { MentionTextarea } from "@/components/shared/MentionTextarea";
import { InlineTextArea } from "@/components/shared/InlineEdit";
import { TextoComLinks } from "@/components/shared/TextoComLinks";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  createInitiativeComment,
  deleteInitiativeComment,
  updateInitiativeComment,
} from "@/actions/initiative-comments";
import { formatRelativeTime } from "@/lib/date-utils";
import { acaoSegura } from "@/lib/acao-segura";

interface Member {
  id: string;
  name: string;
  email?: string;
}

interface Comment {
  id: string;
  content: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  member: Member;
}

function wasEdited(createdAt: Date | string, updatedAt: Date | string): boolean {
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  return updated - created > 2000; // mais de 2 s de diferença = foi editado
}

interface CommentSectionProps {
  initiativeId: string;
  comments: Comment[];
  currentMemberId: string;
  /** Quem pode ser mencionado com @ (gente ativa do time). */
  membros: { id: string; name: string }[];
}

// ── Single comment with inline-edit support ───────────────────────────────────

function CommentItem({
  comment,
  isOwn,
  onDelete,
}: {
  comment: Comment;
  isOwn: boolean;
  onDelete: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = (content: string) => {
    if (!content.trim() || content.trim() === comment.content) return;
    startTransition(async () => {
      setSaveError(null);
      const res = await updateInitiativeComment({
        commentId: comment.id,
        content: content.trim(),
      });
      if (!res.success) setSaveError(res.error);
    });
  };

  return (
    <div className={`flex gap-3 group ${isPending ? "opacity-60" : ""}`}>
      <Avatar name={comment.member.name} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-ink">{comment.member.name}</span>
            <span className="text-[10px] text-ink-soft">
              {formatRelativeTime(comment.createdAt)}
            </span>
            {wasEdited(comment.createdAt, comment.updatedAt) && (
              <Badge bg="var(--color-cream)" color="var(--text-muted)" borderColor="var(--border-subtle)">
                Editado
              </Badge>
            )}
          </div>
          {isOwn && (
            <IconButton
              onClick={() => onDelete(comment.id)}
              className="icon-btn--danger opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
              title="Deletar comentário"
              aria-label="Deletar comentário"
            >
              <Trash2 size={14} />
            </IconButton>
          )}
        </div>

        {isOwn ? (
          <div className="mt-1">
            <InlineTextArea
              value={comment.content}
              onSave={handleSave}
              isPending={isPending}
              displayClassName="text-sm text-ink"
              inputClassName="text-sm border border-line rounded-lg px-3 py-2 bg-paper text-ink focus:outline-none focus:border-forest resize-none w-full"
              placeholder="Editar comentário..."
              emptyLabel=""
              rows={3}
              hint="Ctrl+Enter para salvar"
              linkify
            />
          </div>
        ) : (
          <TextoComLinks texto={comment.content} className="text-sm text-ink mt-1 leading-relaxed wrap-anywhere" />
        )}

        {saveError && (
          <p className="text-xs mt-1 font-medium" style={{ color: "var(--status-error-text)" }}>
            {saveError}
          </p>
        )}

        <div className="mt-3 border-b border-line" />
      </div>
    </div>
  );
}

// ── Section container ─────────────────────────────────────────────────────────

export function CommentSection({
  initiativeId,
  comments,
  currentMemberId,
  membros,
}: CommentSectionProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || loading) return;

    setErrorMsg(null);
    setLoading(true);
    const res = await acaoSegura(createInitiativeComment({
      initiativeId,
      content: content.trim(),
    }));
    setLoading(false);

    if (res.success) {
      setContent("");
    } else {
      setErrorMsg(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    const res = await deleteInitiativeComment(id);
    if (!res.success) setErrorMsg(res.error);
  }

  return (
    <Card padding={24} className="space-y-6 h-full">
      <div className="flex items-center gap-2">
        <MessageCircle size={20} className="text-forest" />
        <h3 className="text-base font-bold text-ink">
          Comentários ({comments.length})
        </h3>
      </div>

      <div className="space-y-6">
        {comments.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Nenhum comentário ainda. Comece a conversa!"
          />
        ) : (
          <div className="space-y-6">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                isOwn={currentMemberId === comment.member.id}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="pt-2">
        <div className="relative group">
          <MentionTextarea
            placeholder="Escreva um comentário... (@ para mencionar alguém)"
            className="min-h-[100px] resize-none"
            style={{ paddingRight: 52 }}
            value={content}
            onValueChange={setContent}
            membros={membros}
          />
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="absolute bottom-3 right-3 bg-forest text-cream p-2 rounded-lg hover:bg-forest-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-cream/30 border-t-cream rounded-full animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        {errorMsg && (
          <div className="flex items-center gap-2 mt-2 text-xs font-medium" style={{ color: "var(--status-error-text)" }}>
            <AlertCircle size={14} />
            {errorMsg}
          </div>
        )}
      </form>

      {deleteTarget && (
        <ConfirmDialog
          title="Excluir comentário"
          message="Excluir este comentário? Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </Card>
  );
}
