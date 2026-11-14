import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberRole } from "@/generated/prisma/enums";

// Mockamos as duas dependências externas do gate de permissão:
//   - ./auth   → auth() (sessão do NextAuth)
//   - ./prisma → SELECT do teamMember (fonte da verdade do role + isActive)
// Assim os testes exercitam SÓ a lógica de autorização de lib/session.ts,
// sem banco nem OAuth.
vi.mock("./auth", () => ({ auth: vi.fn() }));
vi.mock("./prisma", () => ({
  prisma: { teamMember: { findUnique: vi.fn() } },
  // Repassa direto: o retry em si é testado em prisma.test.ts. Aqui só não
  // queremos que o mock esconda a chamada real do gate.
  withDbRetry: (fn: () => unknown) => fn(),
}));

type Member = {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  isActive: boolean;
};

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-self",
    name: "Fulano",
    email: "fulano@example.com",
    role: MemberRole.COLABORADOR,
    isActive: true,
    ...overrides,
  };
}

// Carrega lib/session com um "usuário logado" (ou ninguém, se null).
// resetModules garante um wrapper cache() novo por teste — o cache() do React
// memoiza getCurrentMember dentro do "request", e sem isso um teste vazaria o
// membro pro próximo.
async function loadSession(logged: Member | null) {
  vi.resetModules();
  const { auth } = await import("./auth");
  const { prisma } = await import("./prisma");
  vi.mocked(auth).mockResolvedValue(
    (logged ? { user: { id: logged.id } } : null) as never,
  );
  vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(logged as never);
  return import("./session");
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("session — escalada de privilégio (M2)", () => {
  it("VISITANTE não pode editar (requireEditPermission)", async () => {
    const { requireEditPermission } = await loadSession(
      member({ role: MemberRole.VISITANTE }),
    );
    await expect(requireEditPermission()).rejects.toThrow(/Permissão negada/);
  });

  it("COLABORADOR pode editar (requireEditPermission)", async () => {
    const { requireEditPermission } = await loadSession(
      member({ role: MemberRole.COLABORADOR }),
    );
    await expect(requireEditPermission()).resolves.toMatchObject({
      role: MemberRole.COLABORADOR,
    });
  });

  it("COLABORADOR não pode agir como liderança (requireLeadershipPermission)", async () => {
    const { requireLeadershipPermission } = await loadSession(
      member({ role: MemberRole.COLABORADOR }),
    );
    await expect(requireLeadershipPermission()).rejects.toThrow(
      /Permissão negada/,
    );
  });

  it("VISITANTE não pode agir como liderança (requireLeadershipPermission)", async () => {
    const { requireLeadershipPermission } = await loadSession(
      member({ role: MemberRole.VISITANTE }),
    );
    await expect(requireLeadershipPermission()).rejects.toThrow(
      /Permissão negada/,
    );
  });

  it("LIDERANCA passa em ambos os gates", async () => {
    const { requireEditPermission, requireLeadershipPermission } =
      await loadSession(member({ role: MemberRole.LIDERANCA }));
    await expect(requireEditPermission()).resolves.toMatchObject({
      role: MemberRole.LIDERANCA,
    });
    await expect(requireLeadershipPermission()).resolves.toMatchObject({
      role: MemberRole.LIDERANCA,
    });
  });

  it("membro desativado é tratado como não autenticado — mesmo sendo LIDERANCA", async () => {
    const { requireEditPermission } = await loadSession(
      member({ role: MemberRole.LIDERANCA, isActive: false }),
    );
    await expect(requireEditPermission()).rejects.toThrow(/não autenticado/);
  });

  it("sem sessão → não autenticado", async () => {
    const { requireEditPermission } = await loadSession(null);
    await expect(requireEditPermission()).rejects.toThrow(/não autenticado/);
  });

  it("sessão válida mas membro inexistente no banco → não autenticado", async () => {
    // auth() devolve um user id, mas o SELECT não acha ninguém (conta removida).
    vi.resetModules();
    const { auth } = await import("./auth");
    const { prisma } = await import("./prisma");
    vi.mocked(auth).mockResolvedValue({ user: { id: "ghost" } } as never);
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null as never);
    const { requireEditPermission } = await import("./session");
    await expect(requireEditPermission()).rejects.toThrow(/não autenticado/);
  });
});

// Regressão do incidente de logout em produção: o layout de (app) decide entre
// "manda pro login", "avisa que a conta foi desativada" e "mostra erro" com base
// no TIPO da exceção. Se uma falha de banco chegar como erro de acesso, o
// usuário é deslogado e informado — falsamente — de que sua conta foi desativada.
describe("session — falha de banco não é revogação de acesso", () => {
  it("sem sessão → NotAuthenticatedError", async () => {
    const { getCurrentMember, NotAuthenticatedError } = await loadSession(null);
    await expect(getCurrentMember()).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it("membro desativado → AccessRevokedError", async () => {
    const { getCurrentMember, AccessRevokedError } = await loadSession(
      member({ isActive: false }),
    );
    await expect(getCurrentMember()).rejects.toBeInstanceOf(AccessRevokedError);
  });

  it("membro inexistente → AccessRevokedError", async () => {
    vi.resetModules();
    const { auth } = await import("./auth");
    const { prisma } = await import("./prisma");
    vi.mocked(auth).mockResolvedValue({ user: { id: "ghost" } } as never);
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null as never);
    const { getCurrentMember, AccessRevokedError } = await import("./session");
    await expect(getCurrentMember()).rejects.toBeInstanceOf(AccessRevokedError);
  });

  it("erro do Postgres PROPAGA — não vira erro de acesso", async () => {
    vi.resetModules();
    const { auth } = await import("./auth");
    const { prisma } = await import("./prisma");
    vi.mocked(auth).mockResolvedValue({ user: { id: "member-self" } } as never);
    vi.mocked(prisma.teamMember.findUnique).mockRejectedValue(
      new Error("timeout exceeded when trying to connect") as never,
    );
    const { getCurrentMember, AccessRevokedError, NotAuthenticatedError } =
      await import("./session");

    const err = await getCurrentMember().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AccessRevokedError);
    expect(err).not.toBeInstanceOf(NotAuthenticatedError);
    expect((err as Error).message).toMatch(/timeout exceeded/);
  });
});

describe("session — isolamento por ownership / cross-tenant (M1)", () => {
  it("COLABORADOR NÃO edita item de outro responsável", async () => {
    const { requireOwnershipPermission } = await loadSession(
      member({ id: "member-self", role: MemberRole.COLABORADOR }),
    );
    await expect(
      requireOwnershipPermission(["member-outro"]),
    ).rejects.toThrow(/sob sua responsabilidade/);
  });

  it("COLABORADOR edita item sob sua responsabilidade", async () => {
    const { requireOwnershipPermission } = await loadSession(
      member({ id: "member-self", role: MemberRole.COLABORADOR }),
    );
    await expect(
      requireOwnershipPermission(["member-self"]),
    ).resolves.toMatchObject({ id: "member-self" });
  });

  it("COLABORADOR edita item sem responsável definido (owners nulos)", async () => {
    const { requireOwnershipPermission } = await loadSession(
      member({ id: "member-self", role: MemberRole.COLABORADOR }),
    );
    await expect(
      requireOwnershipPermission([null, undefined]),
    ).resolves.toMatchObject({ id: "member-self" });
  });

  it("COLABORADOR edita item em que é UM dos vários responsáveis", async () => {
    const { requireOwnershipPermission } = await loadSession(
      member({ id: "member-self", role: MemberRole.COLABORADOR }),
    );
    await expect(
      requireOwnershipPermission(["member-outro", "member-self"]),
    ).resolves.toMatchObject({ id: "member-self" });
  });

  it("LIDERANCA edita qualquer item, mesmo de outro responsável", async () => {
    const { requireOwnershipPermission } = await loadSession(
      member({ id: "chefe", role: MemberRole.LIDERANCA }),
    );
    await expect(
      requireOwnershipPermission(["member-outro"]),
    ).resolves.toMatchObject({ role: MemberRole.LIDERANCA });
  });

  it("VISITANTE não edita nem o próprio item (bloqueado antes do ownership)", async () => {
    const { requireOwnershipPermission } = await loadSession(
      member({ id: "member-self", role: MemberRole.VISITANTE }),
    );
    await expect(
      requireOwnershipPermission(["member-self"]),
    ).rejects.toThrow(/Permissão negada/);
  });
});

// A edição em massa de checkpoints precisa AVALIAR vários itens para nomear os
// que barraram, em vez de abortar no primeiro. Por isso a regra virou o predicado
// `hasOwnershipAccess`, que `requireOwnershipPermission` também usa.
//
// O teste que importa é o último: se o predicado divergir do gate que lança, a
// edição em massa passaria a permitir (ou negar) coisa diferente da edição
// individual — exatamente o tipo de brecha que a massa não deve abrir.
describe("session — hasOwnershipAccess (base da edição em massa)", () => {
  const CASES: { nome: string; role: MemberRole; owners: Array<string | null | undefined>; esperado: boolean }[] = [
    { nome: "COLABORADOR / item de outro", role: MemberRole.COLABORADOR, owners: ["member-outro"], esperado: false },
    { nome: "COLABORADOR / item próprio", role: MemberRole.COLABORADOR, owners: ["member-self"], esperado: true },
    { nome: "COLABORADOR / sem responsável", role: MemberRole.COLABORADOR, owners: [null, undefined], esperado: true },
    { nome: "COLABORADOR / um de vários responsáveis", role: MemberRole.COLABORADOR, owners: ["member-outro", "member-self"], esperado: true },
    { nome: "COLABORADOR / dono da iniciativa é outro e checkpoint sem responsável", role: MemberRole.COLABORADOR, owners: ["member-outro", null], esperado: false },
    { nome: "LIDERANCA / item de outro", role: MemberRole.LIDERANCA, owners: ["member-outro"], esperado: true },
  ];

  for (const c of CASES) {
    it(`${c.nome} → ${c.esperado}`, async () => {
      const { hasOwnershipAccess } = await loadSession(null);
      expect(hasOwnershipAccess({ id: "member-self", role: c.role }, c.owners)).toBe(c.esperado);
    });
  }

  it("NÃO é o gate de VISITANTE — quem barra visitante é requireEditPermission", async () => {
    // Documenta o contrato: o predicado responde só "é dono?". As actions em massa
    // chamam requireEditPermission() antes; usar só o predicado deixaria visitante passar.
    const { hasOwnershipAccess } = await loadSession(null);
    expect(
      hasOwnershipAccess({ id: "member-self", role: MemberRole.VISITANTE }, ["member-self"]),
    ).toBe(true);
  });

  it("concorda com requireOwnershipPermission em todos os casos", async () => {
    for (const c of CASES) {
      const { hasOwnershipAccess, requireOwnershipPermission } = await loadSession(
        member({ id: "member-self", role: c.role }),
      );
      const predicado = hasOwnershipAccess({ id: "member-self", role: c.role }, c.owners);
      const gatePassou = await requireOwnershipPermission(c.owners).then(
        () => true,
        () => false,
      );
      expect(predicado, `divergência em: ${c.nome}`).toBe(gatePassou);
    }
  });
});
