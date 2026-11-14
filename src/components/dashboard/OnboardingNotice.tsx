import Link from "next/link";
import { CheckCircle2, Circle, Hourglass, Sparkles } from "lucide-react";
import { getWorkspaceSetupStatus } from "@/actions/onboarding";
import { MemberRole } from "@/generated/prisma/enums";
import { Card } from "@/components/shared/Card";

// Onboarding do dashboard enquanto a sala não está preparada:
// - LIDERANCA vê o checklist de primeiros passos (cada item some ao concluir).
// - COLABORADOR/VISITANTE vê um aviso de que a liderança está preenchendo a sala.
// Quando o setup termina, o componente não renderiza nada.
export async function OnboardingNotice({ role }: { role: MemberRole }) {
  const status = await getWorkspaceSetupStatus();

  if (role === MemberRole.LIDERANCA) {
    if (status.isComplete) return null;

    const steps = [
      {
        done: status.hasQuarter,
        label: "Criar o quarter",
        description: "Defina o trimestre de trabalho ativo.",
        href: "/configuracoes/quarters",
        linkLabel: "Configurações → Quarters",
      },
      {
        done: status.hasFrente,
        label: "Cadastrar as frentes",
        description: "As áreas de atuação do time (ex.: Aquisição, Retenção).",
        href: "/configuracoes/frentes",
        linkLabel: "Configurações → Frentes",
      },
      {
        done: status.hasOKR,
        label: "Definir os OKRs do quarter",
        description: "As metas que iniciativas e experimentos vão perseguir.",
        href: "/okrs",
        linkLabel: "OKRs",
      },
      {
        done: status.hasPlanejamento,
        label: "Planejar iniciativas e experimentos",
        description: "O trabalho do quarter, com responsáveis e datas.",
        href: "/iniciativas",
        linkLabel: "Iniciativas",
      },
      {
        done: status.hasTeam,
        label: "Convidar o time",
        description: "Cada pessoa entra com o Google usando o link do convite.",
        href: "/configuracoes/membros",
        linkLabel: "Configurações → Membros",
      },
    ];

    return (
      <Card padding="24px" style={{ borderRadius: "var(--radius-lg)" }}>
        <div className="flex items-start gap-3 mb-4">
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent-subtle)" }}
          >
            <Sparkles size={20} style={{ color: "var(--brand-primary)" }} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Comece por aqui
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Prepare a Sala de Growth antes de liberar para o time. Este guia some
              quando todos os passos estiverem concluídos.
            </p>
          </div>
        </div>

        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-3">
              {step.done ? (
                <CheckCircle2
                  size={18}
                  className="shrink-0 mt-0.5"
                  style={{ color: "var(--status-done-text)" }}
                />
              ) : (
                <Circle
                  size={18}
                  className="shrink-0 mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                />
              )}
              <div className="min-w-0">
                <p
                  className="text-sm font-medium"
                  style={{
                    color: step.done ? "var(--text-muted)" : "var(--text-primary)",
                    textDecoration: step.done ? "line-through" : "none",
                  }}
                >
                  {step.label}
                </p>
                {!step.done && (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {step.description}{" "}
                    <Link
                      href={step.href}
                      className="font-medium hover:opacity-80"
                      style={{ color: "var(--brand-primary)" }}
                    >
                      {step.linkLabel}
                    </Link>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    );
  }

  // COLABORADOR / VISITANTE
  if (status.hasConteudo) return null;

  return (
    <Card padding="24px" style={{ borderRadius: "var(--radius-lg)" }}>
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent-subtle)" }}
        >
          <Hourglass size={20} style={{ color: "var(--brand-primary)" }} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            A Sala de Growth está sendo preparada
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            A liderança ainda está preenchendo o quarter, os OKRs e o planejamento de
            iniciativas e experimentos. Assim que o conteúdo estiver no ar, o seu
            dashboard passa a mostrar as atividades do time — você não precisa
            configurar nada por aqui.
          </p>
        </div>
      </div>
    </Card>
  );
}
