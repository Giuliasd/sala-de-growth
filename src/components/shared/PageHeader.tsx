interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1
          // Mesma receita do título do roadmap (que tem um PageHeader local em
          // RoadmapView): text-2xl font-bold, sem letter-spacing.
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h1>
        {description && (
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {description}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
