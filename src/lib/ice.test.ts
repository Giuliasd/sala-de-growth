import { describe, expect, it } from "vitest";
import { ICE_RANGES, calculateICEScore, getICEAction } from "./ice";

describe("ICE", () => {
  it("score = I × C ÷ E, com uma casa; esforço 0 não divide", () => {
    expect(calculateICEScore(3, 4, 2)).toBe(6);
    expect(calculateICEScore(2, 2, 3)).toBe(1.3);
    expect(calculateICEScore(5, 5, 0)).toBe(0);
  });

  it("faixas: as bordas caem na faixa de cima", () => {
    expect(getICEAction(4)).toBe("EXECUTAR_AGORA");
    expect(getICEAction(3.99)).toBe("EM_SEGUIDA");
    expect(getICEAction(3)).toBe("EM_SEGUIDA");
    expect(getICEAction(2)).toBe("BACKLOG");
    expect(getICEAction(1.99)).toBe("ARQUIVAR");
  });

  it("a explicação das faixas cobre as quatro ações, na ordem da mais forte", () => {
    expect(ICE_RANGES.map((r) => r.action)).toEqual(["EXECUTAR_AGORA", "EM_SEGUIDA", "BACKLOG", "ARQUIVAR"]);
  });
});
