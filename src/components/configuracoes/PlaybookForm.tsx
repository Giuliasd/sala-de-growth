"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Modal";
import { Field, Input } from "@/components/shared/Field";
import { Dropdown } from "@/components/shared/Dropdown";
import { IconButton } from "@/components/shared/IconButton";
import { createPlaybookLink, updatePlaybookLink } from "@/actions/playbook";
import { AVAILABLE_ICONS, IconName } from "@/lib/icons";

type Section = { id: string; name: string };

interface PlaybookFormProps {
  link?: any;
  sections?: Section[];
  onClose: () => void;
}

const ICONS = Object.keys(AVAILABLE_ICONS) as IconName[];

export function PlaybookForm({ link, sections = [], onClose }: PlaybookFormProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: link?.title || "",
    subtitle: link?.subtitle || "",
    url: link?.url || "",
    iconName: link?.iconName || "Link2",
    sectionId: link?.sectionId || "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    const action = link ? updatePlaybookLink.bind(null, link.id) : createPlaybookLink;
    const res = await action(formData);

    if (res.success) {
      onClose();
    } else {
      setError(res.error);
      setIsPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} maxWidth={512} labelledBy="playbook-form-title">
      <div className="flex items-center justify-between mb-6">
        <h2 id="playbook-form-title" className="text-lg font-bold text-ink">
          {link ? "Editar Link" : "Novo Link"}
        </h2>
        <IconButton boxSize={32} onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </IconButton>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Título">
          <Input
            required
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Ex: Figma"
          />
        </Field>
        <Field label="Subtítulo">
          <Input
            required
            type="text"
            value={formData.subtitle}
            onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
            placeholder="Ex: Designs e protótipos"
          />
        </Field>
        <Field label="URL">
          <Input
            required
            type="url"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            placeholder="https://..."
          />
        </Field>

        <Field label="Seção">
          <Dropdown
            value={formData.sectionId}
            options={[
              { value: "", label: "Sem seção" },
              ...sections.map((s) => ({ value: s.id, label: s.name })),
            ]}
            onChange={(v) => setFormData({ ...formData, sectionId: v })}
            fullWidth
          />
        </Field>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Ícone
          </label>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 p-2 border border-line rounded-md bg-app max-h-48 overflow-y-auto">
            {ICONS.map((iconKey) => {
              const IconComp = AVAILABLE_ICONS[iconKey];
              const isSelected = formData.iconName === iconKey;
              return (
                <button
                  key={iconKey}
                  type="button"
                  onClick={() => setFormData({ ...formData, iconName: iconKey })}
                  className={`flex items-center justify-center p-2 rounded-md transition-colors ${isSelected ? 'bg-forest text-white' : 'text-ink-soft hover:bg-surface hover:text-ink'}`}
                  aria-label={iconKey} data-tooltip={iconKey}
                >
                  <IconComp size={20} />
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="text-sm font-medium" style={{ color: "var(--status-error-text)" }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? <Loader2 size={16} className="animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
