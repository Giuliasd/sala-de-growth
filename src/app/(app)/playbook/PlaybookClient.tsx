"use client";

import Link from "next/link";
import { ExternalLink, BookOpen, Circle } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { IconTile } from "@/components/shared/IconTile";
import { AVAILABLE_ICONS, IconName } from "@/lib/icons";

interface PlaybookLinkData {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  iconName: string;
  sectionId?: string | null;
}

type Section = { id: string; name: string };

// Rotação de cor dos chips de ícone usando as famílias do design system
// (par -soft/-strong lê bem nos dois temas — nada de hexes fora da paleta).
const TILE_FAMILIES = [
  { bg: "var(--accent-subtle)", color: "var(--brand-primary)" },
  { bg: "var(--peach-soft)", color: "var(--peach-strong)" },
  { bg: "var(--sky-soft)", color: "var(--sky-strong)" },
  { bg: "var(--sage-soft)", color: "var(--sage-strong)" },
  { bg: "var(--blush-soft)", color: "var(--blush-strong)" },
  { bg: "var(--butter-soft)", color: "var(--butter-strong)" },
];

function LinkCard({ link, colorIdx }: { link: PlaybookLinkData; colorIdx: number }) {
  const Icon = AVAILABLE_ICONS[link.iconName as IconName] || AVAILABLE_ICONS.Link2;
  const tile = TILE_FAMILIES[colorIdx % TILE_FAMILIES.length];

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block h-full"
    >
      <Card interactive className="h-full flex flex-col" padding={24}>
        <div className="flex items-start justify-between mb-4">
          <IconTile icon={Icon} bg={tile.bg} color={tile.color} size={44} radius={12} iconSize={22} />
          <ExternalLink
            size={16}
            strokeWidth={2}
            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 u-transition"
            style={{ color: "var(--text-muted)" }}
          />
        </div>

        <div className="mt-auto">
          <h3 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            {link.title}
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {link.subtitle}
          </p>
        </div>
      </Card>
    </a>
  );
}

export function PlaybookClient({
  initialLinks,
  sections = [],
}: {
  initialLinks: PlaybookLinkData[];
  sections?: Section[];
}) {
  // Playbook vazio: passo a passo de preenchimento pra todos os usuários,
  // no mesmo formato do onboarding do dashboard (OnboardingNotice).
  if (initialLinks.length === 0) {
    const steps: { label: string; description: string; href?: string; linkLabel?: string }[] = [
      {
        label: "Abrir a área de gestão do playbook",
        description: "Qualquer pessoa do time pode gerenciar os links em",
        href: "/configuracoes/playbook",
        linkLabel: "Configurações → Playbook",
      },
      {
        label: "Criar as seções (opcional)",
        description:
          "Grupos pra organizar os links — ex.: Documentos, Ferramentas, Dashboards.",
      },
      {
        label: "Adicionar os links",
        description:
          "Cada link tem título, descrição, ícone e URL, e aparece aqui como um card pra todo o time.",
      },
    ];

    return (
      <Card padding="24px" style={{ borderRadius: "var(--radius-lg)" }}>
        <div className="flex items-start gap-3 mb-4">
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent-subtle)" }}
          >
            <BookOpen size={20} style={{ color: "var(--brand-primary)" }} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Monte o playbook do time
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Ainda não há links cadastrados. O playbook reúne as ferramentas e os
              documentos essenciais do time — assim que os primeiros links entrarem,
              esta página vira o acesso rápido de todo mundo.
            </p>
          </div>
        </div>

        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-3">
              <Circle size={18} className="shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }} />
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {step.label}
                </p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {step.description}
                  {step.href && (
                    <>
                      {" "}
                      <Link
                        href={step.href}
                        className="font-medium hover:opacity-80"
                        style={{ color: "var(--brand-primary)" }}
                      >
                        {step.linkLabel}
                      </Link>
                      .
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    );
  }

  // Índice global de cor para manter a variedade entre os cards.
  let colorIdx = 0;
  const renderGrid = (linksToRender: PlaybookLinkData[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {linksToRender.map((link) => <LinkCard key={link.id} link={link} colorIdx={colorIdx++} />)}
    </div>
  );

  // Sem nenhuma seção: layout simples (comportamento anterior).
  if (sections.length === 0) {
    return renderGrid(initialLinks);
  }

  const groups: { id: string | null; name: string; links: PlaybookLinkData[] }[] = [
    ...sections.map((s) => ({ id: s.id, name: s.name, links: initialLinks.filter((l) => l.sectionId === s.id) })),
    { id: null, name: "Outros", links: initialLinks.filter((l) => !l.sectionId) },
  ].filter((g) => g.links.length > 0);

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.id ?? "none"} className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {group.name}
            </h2>
            <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
          </div>
          {renderGrid(group.links)}
        </section>
      ))}
    </div>
  );
}
