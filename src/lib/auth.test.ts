import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressão do incidente de logout em massa em produção.
 *
 * O callback `jwt` revalidava `isActive`/`role` no banco (hoje não consulta mais
 * — ver o primeiro describe abaixo). O Auth.js chama esse callback dentro de um try/catch que, em QUALQUER exceção,
 * trata o JWT como inválido e responde com `Set-Cookie` apagando o cookie de
 * sessão (@auth/core/lib/actions/session.js → `sessionStore.clean()`).
 *
 * Resultado antes do fix: um `timeout exceeded when trying to connect` do pool
 * do Postgres deslogava a pessoa de verdade — tinha que refazer o login pelo
 * Google. Estes testes fixam o contrato: erro de banco NUNCA pode escapar do
 * callback, e NUNCA pode virar `null` (que também limpa o cookie). Hoje a forma
 * mais segura de cumprir isso é o callback simplesmente não ir ao banco.
 */

// Captura o objeto de configuração passado para NextAuth() sem subir o
// framework — é dele que extraímos o callback jwt para chamar direto.
const captured: { config?: any } = {};

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    captured.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: () => ({ id: "google" }) }));
vi.mock("next-auth/providers/credentials", () => ({
  default: () => ({ id: "dev-bypass" }),
}));
vi.mock("./prisma", () => ({
  prisma: {
    teamMember: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
    invite: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  // Sem espera entre tentativas, para o teste não pagar o delay real.
  withDbRetry: async (fn: () => unknown) => {
    try {
      return await fn();
    } catch {
      return fn();
    }
  },
}));

type JwtCallback = (args: { token: Record<string, unknown> }) => Promise<unknown>;

async function loadJwtCallback(): Promise<{
  jwt: JwtCallback;
  findUnique: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  await import("./auth");
  const { prisma } = await import("./prisma");
  return {
    jwt: captured.config.callbacks.jwt as JwtCallback,
    findUnique: vi.mocked(prisma.teamMember.findUnique) as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * O callback jwt NÃO consulta o banco em leituras de sessão. A checagem de
 * isActive/role vive só em `getCurrentMember()` (lib/session.ts), que roda em
 * toda página e action. Antes havia uma revalidação "1x por minuto" aqui, mas
 * o carimbo dela nunca voltava ao cookie (o `auth()` de Server Component
 * descarta o Set-Cookie), então virava um SELECT extra em TODA leitura de
 * sessão. Este teste impede que ela volte sem querer.
 */
describe("auth — callback jwt em leituras de sessão", () => {
  it("não vai ao banco e devolve o token intacto", async () => {
    const { jwt, findUnique } = await loadJwtCallback();

    const token = { memberId: "member-1", memberRole: "COLABORADOR" };
    const result = await jwt({ token });

    expect(findUnique).not.toHaveBeenCalled();
    expect(result).toEqual({ memberId: "member-1", memberRole: "COLABORADOR" });
  });
});

/**
 * Mesma família do incidente acima, agora no callback `signIn`.
 *
 * O gate de login consulta o banco pra saber se o e-mail está cadastrado. Se essa
 * query estourar, a exceção escapa do callback e o Auth.js a converte em
 * `AccessDenied` — que a tela de login mostra como "Sua conta não possui acesso
 * autorizado". Ou seja: falha de infraestrutura acusando a conta da pessoa, o que
 * manda ela procurar a liderança em vez de simplesmente tentar de novo.
 *
 * Aconteceu em produção em 04/08/2026. Estes testes fixam o contrato: erro de
 * banco nunca pode virar `false` (que renderiza acesso negado) nem escapar.
 */
type SignInCallback = (args: {
  user: { email?: string | null };
  account?: { provider: string } | null;
  profile?: { email_verified?: boolean };
}) => Promise<boolean | string>;

async function loadSignInCallback() {
  vi.resetModules();
  const { DB_UNAVAILABLE_ERROR } = await import("./auth");
  const { prisma } = await import("./prisma");
  return {
    signIn: captured.config.callbacks.signIn as SignInCallback,
    teamMember: vi.mocked(prisma.teamMember.findUnique) as never as ReturnType<typeof vi.fn>,
    invite: vi.mocked(prisma.invite.findUnique) as never as ReturnType<typeof vi.fn>,
    DB_UNAVAILABLE_ERROR,
  };
}

const googleLogin = {
  user: { email: "fulano@example.com" },
  account: { provider: "google" },
  profile: { email_verified: true },
};

/**
 * Achado da auditoria de segurança (13/11/2026): o login usava o e-mail do
 * Google como chave sem checar `email_verified` — a porta do MCP checava.
 */
describe("auth — e-mail verificado no login Google", () => {
  it("e-mail não verificado é barrado antes de ir ao banco", async () => {
    const { signIn, teamMember } = await loadSignInCallback();
    teamMember.mockResolvedValue({ isActive: true } as never);

    await expect(
      signIn({ ...googleLogin, profile: { email_verified: false } }),
    ).resolves.toBe(false);
    await expect(signIn({ ...googleLogin, profile: {} })).resolves.toBe(false);
    expect(teamMember).not.toHaveBeenCalled();
  });

  it("vale também para o ADMIN_EMAIL", async () => {
    vi.stubEnv("ADMIN_EMAIL", "fulano@example.com");
    try {
      const { signIn } = await loadSignInCallback();
      await expect(
        signIn({ ...googleLogin, profile: { email_verified: false } }),
      ).resolves.toBe(false);
      await expect(signIn(googleLogin)).resolves.toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("auth — callback signIn sob falha do banco", () => {
  it("falha de conexão NÃO vira acesso negado: redireciona com código próprio", async () => {
    const { signIn, teamMember, DB_UNAVAILABLE_ERROR } = await loadSignInCallback();
    teamMember.mockRejectedValue(
      new Error("Connection terminated due to connection timeout") as never,
    );

    const result = await signIn(googleLogin);

    // O que NÃO pode acontecer: `false` renderiza "sua conta não possui acesso".
    expect(result).not.toBe(false);
    expect(typeof result).toBe("string");
    expect(result).toContain(DB_UNAVAILABLE_ERROR);
  });

  it("membro ativo entra (banco respondeu)", async () => {
    const { signIn, teamMember } = await loadSignInCallback();
    teamMember.mockResolvedValue({ isActive: true } as never);

    await expect(signIn(googleLogin)).resolves.toBe(true);
  });

  it("membro desativado é barrado — de verdade, não por falha de banco", async () => {
    const { signIn, teamMember } = await loadSignInCallback();
    teamMember.mockResolvedValue({ isActive: false } as never);

    await expect(signIn(googleLogin)).resolves.toBe(false);
  });

  it("conta nova com convite válido entra", async () => {
    const { signIn, teamMember, invite } = await loadSignInCallback();
    teamMember.mockResolvedValue(null as never);
    invite.mockResolvedValue({
      usedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    } as never);

    await expect(signIn(googleLogin)).resolves.toBe(true);
  });

  it("conta nova sem convite é barrada", async () => {
    const { signIn, teamMember, invite } = await loadSignInCallback();
    teamMember.mockResolvedValue(null as never);
    invite.mockResolvedValue(null as never);

    await expect(signIn(googleLogin)).resolves.toBe(false);
  });

  it("falha ao buscar o convite também não vira acesso negado", async () => {
    const { signIn, teamMember, invite, DB_UNAVAILABLE_ERROR } = await loadSignInCallback();
    teamMember.mockResolvedValue(null as never);
    invite.mockRejectedValue(new Error("timeout exceeded when trying to connect") as never);

    const result = await signIn(googleLogin);

    expect(result).not.toBe(false);
    expect(result).toContain(DB_UNAVAILABLE_ERROR);
  });
});

/**
 * O e-mail é a chave de login e é gravado em minúsculas. O Google devolve
 * minúsculo, mas um cadastro digitado como "Maria@Empresa.com" nunca casava e o
 * convite ficava pendente para sempre. O gate normaliza antes de consultar.
 */
describe("auth — e-mail normalizado no signIn", () => {
  it("consulta membro e convite com o e-mail em minúsculas", async () => {
    const { signIn, teamMember, invite } = await loadSignInCallback();
    teamMember.mockResolvedValue(null as never);
    invite.mockResolvedValue({
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    const result = await signIn({
      user: { email: "  Maria@Empresa.COM " },
      account: { provider: "google" },
      profile: { email_verified: true },
    });

    expect(result).toBe(true);
    expect(teamMember).toHaveBeenCalledWith({ where: { email: "maria@empresa.com" } });
    expect(invite).toHaveBeenCalledWith({ where: { email: "maria@empresa.com" } });
  });
});

/**
 * Achado da auditoria de segurança (13/11/2026): desativar quem tem o e-mail do
 * ADMIN_EMAIL não valia. `toggleMemberActive` apaga o e-mail do registro, então
 * no login seguinte o upsert não achava a linha e criava uma conta NOVA, ativa e
 * LIDERANCA — a pessoa voltava sozinha. Agora o ADMIN_EMAIL só cria conta para
 * subir/destravar a liderança (ninguém ativo nela) ou com convite válido.
 */
describe("auth — ADMIN_EMAIL no callback jwt", () => {
  const ADMIN = "admin@example.test";
  const adminLogin = {
    token: {} as Record<string, unknown>,
    user: { id: "google-sub-1", email: ADMIN, name: "Admin" },
    account: { provider: "google" },
  };

  async function loadAdminJwt() {
    vi.stubEnv("ADMIN_EMAIL", ADMIN);
    vi.resetModules();
    await import("./auth");
    const { prisma } = await import("./prisma");
    const p = vi.mocked(prisma, true) as any;
    // $transaction(fn) roda o callback com o próprio mock como `tx`.
    p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(p));
    p.teamMember.create.mockImplementation(async ({ data }: any) => ({ id: "novo", ...data }));
    return {
      jwt: captured.config.callbacks.jwt as (args: typeof adminLogin) => Promise<any>,
      p,
    };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("desativado (e-mail apagado) com liderança ativa no time: NÃO recria a conta", async () => {
    const { jwt, p } = await loadAdminJwt();
    p.teamMember.findUnique.mockResolvedValue(null);
    p.invite.findUnique.mockResolvedValue(null);
    p.teamMember.count.mockResolvedValue(2);

    const token = await jwt({ ...adminLogin, token: {} });

    expect(p.teamMember.create).not.toHaveBeenCalled();
    // Sem membro, o token não aponta para nenhum TeamMember: getCurrentMember() barra.
    expect(token.memberRole).toBe("VISITANTE");
    expect(token.memberId).toBe("google-sub-1");
  });

  it("time sem ninguém ativo na liderança: cria o admin (bootstrap/recuperação)", async () => {
    const { jwt, p } = await loadAdminJwt();
    p.teamMember.findUnique.mockResolvedValue(null);
    p.invite.findUnique.mockResolvedValue(null);
    p.teamMember.count.mockResolvedValue(0);

    const token = await jwt({ ...adminLogin, token: {} });

    expect(p.teamMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: ADMIN, role: "LIDERANCA", isActive: true }),
    });
    expect(token).toMatchObject({ memberId: "novo", memberRole: "LIDERANCA" });
  });

  it("reconvidado: cria a conta e consome o convite na mesma transação", async () => {
    const { jwt, p } = await loadAdminJwt();
    p.teamMember.findUnique.mockResolvedValue(null);
    p.invite.findUnique.mockResolvedValue({
      id: "conv-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    p.teamMember.count.mockResolvedValue(3);

    const token = await jwt({ ...adminLogin, token: {} });

    expect(p.$transaction).toHaveBeenCalled();
    expect(p.invite.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { usedAt: expect.any(Date) },
    });
    expect(token).toMatchObject({ memberId: "novo", memberRole: "LIDERANCA" });
  });

  it("convite vencido não conta como reconvite", async () => {
    const { jwt, p } = await loadAdminJwt();
    p.teamMember.findUnique.mockResolvedValue(null);
    p.invite.findUnique.mockResolvedValue({
      id: "conv-1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    p.teamMember.count.mockResolvedValue(1);

    await jwt({ ...adminLogin, token: {} });

    expect(p.teamMember.create).not.toHaveBeenCalled();
  });

  it("conta existente: promove a LIDERANCA sem mexer em isActive", async () => {
    const { jwt, p } = await loadAdminJwt();
    p.teamMember.findUnique.mockResolvedValue({ id: "m-1", role: "COLABORADOR", isActive: false });
    p.teamMember.update.mockResolvedValue({ id: "m-1", role: "LIDERANCA", isActive: false });

    await jwt({ ...adminLogin, token: {} });

    expect(p.teamMember.update).toHaveBeenCalledWith({
      where: { id: "m-1" },
      data: { role: "LIDERANCA" },
    });
    expect(p.teamMember.create).not.toHaveBeenCalled();
  });
});
