// Primitivo de esqueleto (loading state). Bloco cinza com pulse, usado em
// fallbacks de <Suspense> e em loading.tsx.
export function Block({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={style}
    />
  );
}
