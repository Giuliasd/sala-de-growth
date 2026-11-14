import { describe, expect, it } from "vitest";
import {
  aberturaDaSeguinte,
  horariosValidos,
  janelaDoRitual,
  semanaDoRitualAtual,
  HORARIOS_PADRAO,
  type VigenciaDoRitual,
} from "@/lib/date-utils";
import {
  anotarSemanaAberta,
  desfechoNaSemana,
  entraNaSemana,
  itensDaSemanaFechada,
  nosDaSemana,
  origemNaSemana,
  resumir,
  rotulosDoRegistro,
  type AnotacaoDoRegistro,
  type RegistroDaSemana,
} from "@/lib/registro-semanal";
import type { CheckpointItem, WeeklyItem } from "@/actions/weekly-activity";

// Semana de 19/10/2026 (segunda) a 25/10 (domingo). Fecha na sexta 23/10 às
// 14:59 de São Paulo = 17:59 UTC.
const SEG = new Date("2026-10-19T00:00:00Z");
const janela = janelaDoRitual(SEG);
const d = (iso: string) => new Date(iso);

describe("janelaDoRitual", () => {
  it("abre na sexta anterior às 15:00 e fecha na sexta às 15:00 (São Paulo)", () => {
    expect(janela.abre.toISOString()).toBe("2026-10-16T18:00:00.000Z");
    expect(janela.fecha.toISOString()).toBe("2026-10-23T18:00:00.000Z");
  });

  it("o planejado vai até o fim da segunda em São Paulo", () => {
    expect(janela.fimDoPlanejamento.toISOString()).toBe("2026-10-20T02:59:59.999Z");
  });
});

describe("semanaDoRitualAtual", () => {
  it("sexta 14:59 ainda é a semana; 15:00 já é a seguinte", () => {
    expect(semanaDoRitualAtual(d("2026-10-23T17:59:00Z")).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(semanaDoRitualAtual(d("2026-10-23T18:00:00Z")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("sábado e domingo já são da semana seguinte", () => {
    expect(semanaDoRitualAtual(d("2026-10-25T15:00:00Z")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

describe("horários configurados", () => {
  // A partir da semana de 19/10: fecha quinta 17:29, planejado até terça 12:00.
  const vigencias: VigenciaDoRitual[] = [
    {
      vigenteDesde: SEG,
      fechamentoDia: 4,
      fechamentoMinuto: 17 * 60 + 29,
      planejamentoDia: 2,
      planejamentoMinuto: 12 * 60,
    },
  ];

  it("a semana usa os horários que valem nela", () => {
    const j = janelaDoRitual(SEG, vigencias);
    expect(j.fecha.toISOString()).toBe("2026-10-22T20:30:00.000Z"); // quinta 17:30 SP
    expect(j.fimDoPlanejamento.toISOString()).toBe("2026-10-20T15:00:59.999Z"); // terça 12:00:59 SP
  });

  it("a abertura é o fechamento da semana anterior, com os horários de lá", () => {
    // A semana de 12/10 ainda é do padrão: fechou sexta 14:59.
    expect(janelaDoRitual(SEG, vigencias).abre.toISOString()).toBe("2026-10-16T18:00:00.000Z");
    // A de 26/10 abre no fechamento novo da de 19/10.
    expect(janelaDoRitual(d("2026-10-26T00:00:00Z"), vigencias).abre.toISOString()).toBe(
      "2026-10-22T20:30:00.000Z"
    );
  });

  it("semanas antes da vigência seguem o padrão", () => {
    expect(janelaDoRitual(d("2026-10-12T00:00:00Z"), vigencias).fecha.toISOString()).toBe(
      "2026-10-16T18:00:00.000Z"
    );
  });

  it("a semana vira no fechamento configurado", () => {
    expect(semanaDoRitualAtual(d("2026-10-22T20:29:00Z"), vigencias).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(semanaDoRitualAtual(d("2026-10-22T20:30:00Z"), vigencias).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("fechar domingo 23:59 abre a seguinte na segunda 00:00", () => {
    const domingo: VigenciaDoRitual[] = [{ ...vigencias[0], fechamentoDia: 7, fechamentoMinuto: 23 * 60 + 59 }];
    expect(janelaDoRitual(SEG, domingo).fecha.toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(semanaDoRitualAtual(d("2026-10-26T02:59:00Z"), domingo).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(aberturaDaSeguinte({ ...HORARIOS_PADRAO, fechamentoDia: 7, fechamentoMinuto: 23 * 60 + 59 })).toEqual({
      dia: 1,
      minuto: 0,
    });
  });

  it("o planejado precisa terminar antes do fechamento", () => {
    expect(horariosValidos(HORARIOS_PADRAO)).toBe(true);
    expect(horariosValidos({ ...HORARIOS_PADRAO, planejamentoDia: 5, planejamentoMinuto: 14 * 60 + 59 })).toBe(false);
    expect(horariosValidos({ ...HORARIOS_PADRAO, fechamentoDia: 8 })).toBe(false);
  });
});

const cp = (extra: Partial<CheckpointItem> = {}): CheckpointItem => ({
  id: "c", name: "c", description: null, startDate: null, dueDate: d("2026-10-21T00:00:00Z"),
  isCompleted: false, completedAt: null, categoria: null, members: [], tags: [],
  inProgress: false, children: [], ...extra,
});

describe("entraNaSemana", () => {
  it("prazo na semana, atrasado pendente e em andamento entram", () => {
    expect(entraNaSemana(cp(), janela)).toBe(true);
    expect(entraNaSemana(cp({ dueDate: d("2026-10-01T00:00:00Z") }), janela)).toBe(true);
    expect(entraNaSemana(cp({ startDate: d("2026-10-05T00:00:00Z"), dueDate: d("2026-11-06T00:00:00Z") }), janela)).toBe(true);
  });

  // A semana fecha na reunião de sexta: concluir no sábado é trabalho da
  // semana seguinte.
  it("concluído pela janela do ritual, não pelo calendário", () => {
    const sabado = cp({ dueDate: d("2026-10-10T00:00:00Z"), isCompleted: true, completedAt: d("2026-10-17T15:00:00Z") });
    expect(entraNaSemana(sabado, janela)).toBe(true);
    const sextaDepoisDaReuniao = cp({ dueDate: d("2026-10-10T00:00:00Z"), isCompleted: true, completedAt: d("2026-10-23T18:30:00Z") });
    expect(entraNaSemana(sextaDepoisDaReuniao, janela)).toBe(false);
  });

  it("concluído antes da semana abrir e com prazo fora dela não entra", () => {
    expect(
      entraNaSemana(cp({ dueDate: d("2026-10-10T00:00:00Z"), isCompleted: true, completedAt: d("2026-10-12T12:00:00Z") }), janela)
    ).toBe(false);
  });
});

describe("origemNaSemana", () => {
  const antigo = { createdAt: d("2026-10-01T00:00:00Z"), updatedAt: d("2026-10-01T00:00:00Z") };

  it("registrado até o fim da segunda é planejado", () => {
    expect(origemNaSemana(d("2026-10-20T02:00:00Z"), { createdAt: d("2026-10-19T20:00:00Z"), updatedAt: d("2026-10-19T20:00:00Z") }, janela)).toBe("PLANEJADO");
  });

  it("depois da segunda: criado ou mexido depois entrou; o que já estava, planejado", () => {
    const quarta = d("2026-10-21T15:00:00Z");
    expect(origemNaSemana(quarta, antigo, janela)).toBe("PLANEJADO");
    expect(origemNaSemana(quarta, { createdAt: d("2026-10-21T12:00:00Z"), updatedAt: d("2026-10-21T12:00:00Z") }, janela)).toBe("ENTROU");
    expect(origemNaSemana(quarta, { ...antigo, updatedAt: d("2026-10-21T12:00:00Z") }, janela)).toBe("ENTROU");
  });
});

describe("desfechoNaSemana", () => {
  const reg = { prazoAoEntrar: d("2026-10-22T00:00:00Z"), excluidoEm: null };

  it("excluído: checkpoint sumiu ou tem data de exclusão", () => {
    expect(desfechoNaSemana(null, reg, janela)).toBe("EXCLUIDO");
  });

  it("concluído até a sexta 14:59; depois disso a semana fechou com ele aberto", () => {
    expect(desfechoNaSemana(cp({ isCompleted: true, completedAt: d("2026-10-23T17:00:00Z") }), reg, janela)).toBe("CONCLUIDO");
    expect(desfechoNaSemana(cp({ isCompleted: true, completedAt: d("2026-10-23T19:00:00Z") }), reg, janela)).toBe("ABERTO");
  });

  it("prazo empurrado para depois da semana é remarcado", () => {
    expect(desfechoNaSemana(cp({ dueDate: d("2026-10-27T00:00:00Z") }), reg, janela)).toBe("REMARCADO");
  });

  it("entrou com prazo depois da semana: em andamento, não remarcado", () => {
    expect(
      desfechoNaSemana(cp({ dueDate: d("2026-11-06T00:00:00Z") }), { ...reg, prazoAoEntrar: d("2026-11-06T00:00:00Z") }, janela)
    ).toBe("EM_ANDAMENTO");
  });
});

describe("nosDaSemana", () => {
  it("só os nós da semana, com caminho e responsável herdado", () => {
    const arvore = [
      cp({
        id: "pai", name: "Pai", dueDate: d("2026-11-30T00:00:00Z"), members: [{ id: "camila", name: "Camila" }],
        children: [cp({ id: "filho", name: "Filho" })],
      }),
    ];
    const nos = nosDaSemana({ members: [{ id: "rafa" }] }, arvore, janela);
    expect(nos.map((n) => n.cp.id)).toEqual(["filho"]);
    expect(nos[0].caminho).toBe("Pai");
    expect(nos[0].responsaveisIds).toEqual(["camila"]);
  });
});

function registro(extra: Partial<RegistroDaSemana> = {}): RegistroDaSemana {
  return {
    id: "r1", checkpointId: "c1", kind: "iniciativa", itemId: "I", origem: "PLANEJADO",
    registradoEm: d("2026-10-19T12:00:00Z"), nome: "Publicar landings", caminho: null, categoria: null,
    prazoAoEntrar: d("2026-10-22T00:00:00Z"), prazo: d("2026-10-22T00:00:00Z"), inicio: null, concluidoEm: null,
    responsaveisIds: ["bruno"], tags: [], itemNome: "Landing", itemStatus: "EM_ANDAMENTO",
    frente: { id: "f", name: "Aquisição" }, remarcacoes: 0, excluidoEm: null, excluidoPor: null,
    desfecho: "ABERTO", atual: null, ...extra,
  };
}
const item = (checkpoints: CheckpointItem[]): WeeklyItem => ({
  id: "I", name: "Landing", status: "EM_ANDAMENTO", priority: null, launchDate: null, launchThisWeek: false,
  launchNextWeek: false, analysisDate: null, analysisThisWeek: false, analysisNextWeek: false,
  checkpoints, frente: { id: "f", name: "Aquisição" }, members: [{ id: "bruno", name: "Bruno" }],
});
const nomes = new Map([["bruno", "Bruno Teixeira"]]);

describe("anotarSemanaAberta", () => {
  it("anota quem está na lista viva", () => {
    const r = anotarSemanaAberta({ iniciativas: [item([cp({ id: "c1" })])], experimentos: [] }, [registro()], nomes);
    expect(r.iniciativas[0].checkpoints[0].registro?.fantasma).toBe(false);
  });

  // O coração da mudança: remarcar tirava o checkpoint da semana sem rastro.
  it("quem saiu da lista volta como linha do registro, no próprio item", () => {
    const remarcado = registro({
      desfecho: "REMARCADO",
      atual: { startDate: null, dueDate: d("2026-10-27T00:00:00Z"), isCompleted: false, completedAt: null },
    });
    const r = anotarSemanaAberta({ iniciativas: [item([])], experimentos: [] }, [remarcado], nomes);
    const linha = r.iniciativas[0].checkpoints[0];
    expect(linha.registro?.fantasma).toBe(true);
    expect(linha.registro?.prazo.toISOString()).toBe("2026-10-27T00:00:00.000Z");
    expect(linha.members).toEqual([{ id: "bruno", name: "Bruno Teixeira" }]);
  });

  it("item que saiu inteiro da Weekly volta montado pelo registro", () => {
    const r = anotarSemanaAberta({ iniciativas: [], experimentos: [] }, [registro({ desfecho: "EXCLUIDO", checkpointId: null })], nomes);
    expect(r.iniciativas).toHaveLength(1);
    expect(r.iniciativas[0].name).toBe("Landing");
    expect(r.iniciativas[0].checkpoints[0].id).toBe("registro-r1");
  });
});

describe("itensDaSemanaFechada", () => {
  // A Weekly ordena por tag; a foto da semana fechada precisa das tags para
  // sair na mesma ordem da semana viva.
  it("a foto leva as tags da cópia", () => {
    const qa = { id: "t1", name: "QA", color: "sage" };
    const r = itensDaSemanaFechada([registro({ desfecho: "ABERTO", tags: [qa] })], nomes);
    expect(r.iniciativas[0].checkpoints[0].tags).toEqual([qa]);
  });

  it("tudo vem da foto: o concluído com a data do fechamento", () => {
    const r = itensDaSemanaFechada(
      [registro({ desfecho: "CONCLUIDO", concluidoEm: d("2026-10-21T15:00:00Z") })],
      nomes
    );
    const linha = r.iniciativas[0].checkpoints[0];
    expect(linha.isCompleted).toBe(true);
    expect(linha.registro?.fechada).toBe(true);
  });
});

function anot(extra: Partial<AnotacaoDoRegistro>): AnotacaoDoRegistro {
  return {
    desfecho: "ABERTO", origem: "PLANEJADO", registradoEm: d("2026-10-19T12:00:00Z"),
    prazoAoEntrar: d("2026-10-22T00:00:00Z"), prazo: d("2026-10-22T00:00:00Z"), remarcacoes: 0,
    excluidoEm: null, excluidoPor: null, concluidoEm: null, caminho: null, fantasma: false, fechada: false,
    ...extra,
  };
}

describe("resumir", () => {
  it("conta pelo desfecho; em andamento fica fora do total", () => {
    const r = resumir([
      anot({ desfecho: "CONCLUIDO" }),
      anot({ desfecho: "REMARCADO" }),
      anot({ desfecho: "EXCLUIDO", origem: "ENTROU" }),
      anot({ desfecho: "EM_ANDAMENTO" }),
    ]);
    expect(r).toEqual({ total: 3, concluidos: 1, remarcados: 1, abertos: 0, excluidos: 1, entraram: 1 });
  });

  it("sem registro, sem resumo", () => {
    expect(resumir([])).toBeNull();
  });
});

describe("rotulosDoRegistro", () => {
  const textos = (a: AnotacaoDoRegistro) => rotulosDoRegistro(a, SEG).map((r) => r.texto);

  it("remarcado diz de onde para onde, e a vez quando repete", () => {
    expect(
      textos(anot({ desfecho: "REMARCADO", prazo: d("2026-10-27T00:00:00Z"), remarcacoes: 2 }))
    ).toEqual(["remarcado · 22/10 → 27/10 · 2ª vez"]);
  });

  it("atrasado que veio da semana passada, e o que entrou no meio da semana", () => {
    expect(textos(anot({ prazoAoEntrar: d("2026-10-14T00:00:00Z") }))).toEqual(["veio da semana passada"]);
    expect(textos(anot({ origem: "ENTROU", registradoEm: d("2026-10-21T15:00:00Z") }))).toEqual(["entrou qua 21"]);
  });

  // Só a liderança recebe o nome — para os demais ele nem sai do servidor.
  it("excluído mostra quem excluiu só quando o nome veio", () => {
    const base = anot({ desfecho: "EXCLUIDO", excluidoEm: d("2026-10-22T15:00:00Z") });
    expect(textos(base)).toEqual(["excluído qui 22"]);
    expect(textos({ ...base, excluidoPor: "Bruno Teixeira" })).toEqual(["excluído qui 22 · por Bruno"]);
  });

  it("na semana fechada, o aberto diz que ficou aberto", () => {
    expect(textos(anot({ fechada: true }))).toEqual(["ficou aberto"]);
  });
});

describe("rotulosDoRegistro — atraso antigo", () => {
  it("atraso de antes da semana passada não ganha pill: a data em vermelho já diz", () => {
    expect(rotulosDoRegistro(anot({ prazoAoEntrar: d("2026-09-18T00:00:00Z") }), SEG)).toEqual([]);
  });
});
