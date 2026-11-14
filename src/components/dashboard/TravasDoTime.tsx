import Link from "next/link";
import { Users } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { CardHeader } from "@/components/shared/CardHeader";
import { Avatar } from "@/components/shared/Avatar";
import { Badge } from "@/components/shared/Badge";
import { AusenciaTypeBadge } from "@/components/shared/AusenciaTypeBadge";
import { familyBg, familyBorder, familyStrong, type StatusFamily } from "@/lib/statusConfig";

export type LinhaDoTime = {
  id: string;
  name: string;
  /** Tipo da ausência que cruza a semana, ou null. */
  ausencia: string | null;
  atrasados: number;
  /** Vencem de hoje até domingo. */
  semana: number;
  semProximoPasso: number;
  krsParados: number;
  /** Dashboard filtrado nessa pessoa. */
  href: string;
};

const COLUNAS: { chave: keyof Pick<LinhaDoTime, "atrasados" | "semana" | "semProximoPasso" | "krsParados">; rotulo: string; familia: StatusFamily }[] = [
  { chave: "atrasados", rotulo: "Atrasados", familia: "peach" },
  { chave: "semana", rotulo: "Vencem esta semana", familia: "sky" },
  { chave: "semProximoPasso", rotulo: "Sem próximo passo", familia: "neutral" },
  { chave: "krsParados", rotulo: "KRs sem atualização", familia: "butter" },
];

/**
 * A visão da liderança em "Todos": uma linha por pessoa com o que está
 * travando. É a pergunta da liderança no dia a dia — não "o que eu faço", mas
 * "onde eu preciso puxar alguém".
 *
 * Item com mais de um responsável conta para cada um (como na Weekly), então
 * a soma das linhas passa do total do time — é proposital.
 */
export function TravasDoTime({
  linhas,
  totalAtrasados,
}: {
  linhas: LinhaDoTime[];
  /** Atrasados distintos do time (sem contar duas vezes o item dividido). */
  totalAtrasados: number;
}) {
  return (
    <Card padding={0} className="overflow-hidden" style={{ borderRadius: "var(--radius-lg)" }}>
      <div style={{ padding: "28px 28px 20px" }}>
        <CardHeader
          icon={Users}
          title="Onde o time está travando"
          badge={totalAtrasados > 0 ? `${totalAtrasados} ${totalAtrasados === 1 ? "atrasado" : "atrasados"}` : undefined}
          subtitle="Item com mais de um responsável conta para cada um deles"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr
              style={{
                background: "var(--bg-app)",
                borderTop: "1px solid var(--border-subtle)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <th
                scope="col"
                className="text-left text-xs font-medium py-3 pr-4"
                style={{ color: "var(--text-muted)", paddingLeft: 28 }}
              >
                Pessoa
              </th>
              {COLUNAS.map((c) => (
                <th
                  key={c.chave}
                  scope="col"
                  className="text-left text-xs font-medium px-4 py-3 whitespace-nowrap"
                  style={{ color: "var(--text-muted)" }}
                >
                  {c.rotulo}
                </th>
              ))}
              <th scope="col" className="py-3" style={{ paddingRight: 28 }}>
                <span className="sr-only">Abrir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr
                key={l.id}
                style={{
                  borderBottom: i === linhas.length - 1 ? "none" : "1px solid var(--border-subtle)",
                }}
              >
                <th scope="row" className="text-left py-3 pr-4" style={{ paddingLeft: 28 }}>
                  <span className="inline-flex items-center gap-2.5">
                    <Avatar name={l.name} size={28} />
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {l.name}
                    </span>
                    {l.ausencia && <AusenciaTypeBadge type={l.ausencia} />}
                  </span>
                </th>
                {COLUNAS.map((c) => {
                  const n = l[c.chave];
                  return (
                    // Título e conteúdo à esquerda, como em toda tabela do produto
                    // (ver /design-system, "Tabelas").
                    <td key={c.chave} className="text-left px-4 py-3">
                      {n > 0 ? (
                        <Badge
                          bg={familyBg(c.familia)}
                          color={familyStrong(c.familia)}
                          borderColor={familyBorder(c.familia)}
                          className="font-mono tabular-nums"
                        >
                          {n}
                        </Badge>
                      ) : (
                        <span className="text-xs font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                          0
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="text-right py-3" style={{ paddingRight: 28 }}>
                  <Link
                    href={l.href}
                    className="text-xs font-medium whitespace-nowrap transition-colors hover:opacity-80"
                    style={{ color: "var(--brand-primary)" }}
                  >
                    Ver dashboard
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
