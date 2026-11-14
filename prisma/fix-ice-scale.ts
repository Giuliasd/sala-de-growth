import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { calculateICEScore, getICEAction } from '../src/lib/ice';

/**
 * Correção pontual: experimentos antigos foram gravados com I/C/E na escala 1–10
 * (seeds anteriores), mas a escala oficial do app é 1–5 (formulários, validação
 * em src/actions/experimentos.ts e faixas de ICE em src/lib/ice.ts).
 * Com scores > 5 no banco, "Salvar Alterações" falhava com o erro Zod
 * "Too big: expected number to be <=5".
 *
 * Este script reescala QUALQUER experimento com algum score fora de 1–5 para a
 * faixa 1–5 (divide por 2 e arredonda, com piso 1) e recalcula iceScore/iceAction
 * pela mesma régua do app. É idempotente: rodar de novo não altera nada, pois já
 * estará tudo dentro de 1–5.
 *
 * Obs.: um banco novo (`npm run seed`) já nasce com valores curados 1–5; este
 * script é só para consertar bancos que já tinham dados na escala antiga.
 *
 * Rodar:  npm run fix:ice-scale
 */

// 1–10 → 1–5, com piso 1 (nunca zera um score existente).
function reescala(v: number): number {
  if (v >= 1 && v <= 5) return v; // já na escala nova
  return Math.min(5, Math.max(1, Math.round(v / 2)));
}

async function main() {
  const forasDeFaixa = await prisma.experimento.findMany({
    where: {
      OR: [
        { impactScore: { gt: 5 } },
        { confidenceScore: { gt: 5 } },
        { effortScore: { gt: 5 } },
      ],
    },
    select: {
      id: true,
      name: true,
      impactScore: true,
      confidenceScore: true,
      effortScore: true,
    },
  });

  if (forasDeFaixa.length === 0) {
    console.log('✅ Nenhum experimento fora da escala 1–5. Nada a corrigir.');
    return;
  }

  console.log(`🔧 Reescalando ${forasDeFaixa.length} experimento(s) para 1–5...`);

  for (const exp of forasDeFaixa) {
    const impactScore = reescala(exp.impactScore);
    const confidenceScore = reescala(exp.confidenceScore);
    const effortScore = reescala(exp.effortScore);
    const iceScore = calculateICEScore(impactScore, confidenceScore, effortScore);
    const iceAction = getICEAction(iceScore);

    await prisma.experimento.update({
      where: { id: exp.id },
      data: { impactScore, confidenceScore, effortScore, iceScore, iceAction },
    });

    console.log(
      `  • ${exp.name}: ` +
        `I${exp.impactScore}/C${exp.confidenceScore}/E${exp.effortScore} → ` +
        `I${impactScore}/C${confidenceScore}/E${effortScore} (ICE ${iceScore} · ${iceAction})`,
    );
  }

  console.log('✅ Pronto.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // O pool do app (keepAlive, sem idle timeout) mantém o processo vivo
    // mesmo após o $disconnect — encerra explicitamente.
    process.exit(process.exitCode ?? 0);
  });
