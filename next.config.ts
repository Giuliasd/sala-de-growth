import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import pkg from "./package.json";

/**
 * Identidade da build, congelada em tempo de build.
 *
 * Por que aqui e não em runtime: no Heroku o SHA do commit só existe durante o
 * build (`SOURCE_VERSION`) — o dyno que serve o app não recebe essa var. Ler
 * `process.env.SOURCE_VERSION` dentro de um Server Component devolve
 * `undefined`. A única janela em que o valor existe é esta, e o `env` do
 * next.config inlina o literal no bundle (build-time), então o número que o app
 * mostra é sempre o do slug que está rodando — não o do master.
 */
function resolveCommitSha(): string {
  // Heroku injeta SOURCE_VERSION no build de um `git push`; o GitHub Actions
  // usa GITHUB_SHA. Fora de CI/deploy nenhum dos dois existe.
  const fromEnv =
    process.env.SOURCE_VERSION ||
    process.env.HEROKU_SLUG_COMMIT ||
    process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;

  // Dev local: pergunta ao git. `stdio` silencia o stderr para não poluir a
  // saída do `next dev` quando o diretório não é um repo (ex.: build em Docker
  // a partir de um tarball).
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Headers de segurança estáticos aplicados em todas as rotas.
 *
 * A `Content-Security-Policy` NÃO é definida aqui — é gerada por request no
 * middleware (`src/middleware.ts`) com nonce. Em dev, fica sem CSP para o HMR
 * funcionar sem fricção.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Inlinado no bundle em tempo de build — ver `resolveCommitSha()` acima e
  // `src/lib/version.ts`, que é quem lê estes valores. Nada aqui é segredo: são
  // a versão do release, o SHA do commit e o instante do build.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_COMMIT: resolveCommitSha(),
    NEXT_PUBLIC_APP_BUILT_AT: new Date().toISOString(),
  },
  // Não emite source maps do browser em prod — evita expor o código-fonte
  // original (e comentários/lógica interna) a quem inspeciona o bundle.
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
