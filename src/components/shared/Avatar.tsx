"use client";

const PALETTE = [
  "#4A9D7F",
  "#E07856",
  "#F4C744",
  "#2B5A7A",
  "#8B3A4A",
  "#5C6B6B",
  "#7A3A5A",
  "#2D5A3D",
  "#8B5A2B",
  "#165A53",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

interface AvatarProps {
  name: string;
  size?: number;
}

export function Avatar({ name, size = 32 }: AvatarProps) {
  const bg = PALETTE[hashName(name) % PALETTE.length];
  const fontSize = Math.round(size * 0.375);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-full)",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize,
          fontWeight: 600,
          color: "white",
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        {initials(name)}
      </span>
    </div>
  );
}
