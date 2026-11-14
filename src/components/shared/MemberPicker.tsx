"use client";

type MemberItem = { id: string; name: string };

interface MemberPickerProps {
  members: MemberItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  required?: boolean;
}

export function MemberPicker({ members, value, onChange, required }: MemberPickerProps) {
  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {members.map((m) => {
        const active = value.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            className="px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              borderRadius: "var(--radius-full)",
              border: `1px solid ${active ? "var(--brand-primary)" : "var(--border-default)"}`,
              background: active ? "var(--brand-primary)" : "var(--bg-app)",
              color: active ? "white" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {m.name.split(" ")[0]}
          </button>
        );
      })}
      {required && value.length === 0 && (
        <span className="text-xs self-center" style={{ color: "var(--status-error-text)" }}>
          Selecione pelo menos um
        </span>
      )}
    </div>
  );
}
