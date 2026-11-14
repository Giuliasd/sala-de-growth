/**
 * Identidade da build que está rodando: versão do release, commit e instante do
 * build.
 *
 * Por que existe: "está no master" não significa "está no ar". Antes,
 * a única forma de saber qual código um ambiente
 * estava servindo era comparar SHA em `heroku releases`. Isto responde a mesma
 * pergunta de dentro do app.
 *
 * Os valores vêm de `process.env.NEXT_PUBLIC_APP_*`, definidos pelo `env` do
 * `next.config.ts` e **inlinados em tempo de build** — não são lidos em runtime
 * e não mudam sem um novo deploy. Isso é a propriedade que faz o número ser
 * confiável: ele descreve o slug, não o repositório.
 */

export interface BuildInfo {
  /** Versão semântica do release. Lida do campo `version` do package.json. */
  version: string;
  /** SHA curto (7) do commit que gerou o build. */
  commit: string;
  /** ISO 8601 do momento do build, ou `null` se não foi capturado. */
  builtAt: string | null;
}

/** Usado quando o valor não foi capturado no build (ex.: build sem git nem CI). */
export const UNKNOWN = "desconhecido";

/**
 * Encurta um SHA para 7 caracteres.
 *
 * Valida o formato antes de cortar: um valor não-hexadecimal aqui significa que
 * a var de build veio errada, e exibir os 7 primeiros caracteres de lixo passa
 * a falsa impressão de um commit real. Nesse caso é melhor admitir que não sabe.
 */
export function shortenCommit(sha: string | undefined | null): string {
  if (!sha) return UNKNOWN;
  const trimmed = sha.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(trimmed)) return UNKNOWN;
  return trimmed.slice(0, 7).toLowerCase();
}

/** Aceita só um ISO 8601 parseável; qualquer outra coisa vira `null`. */
export function normalizeBuiltAt(value: string | undefined | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Monta o `BuildInfo` a partir dos valores crus do build.
 *
 * Recebe os valores por parâmetro (em vez de ler `process.env` por dentro) para
 * ser testável: em teste as vars de build não existem, porque quem as define é
 * o `next.config.ts` e o vitest não passa por ele.
 */
export function resolveBuildInfo(raw: {
  version?: string;
  commit?: string;
  builtAt?: string;
}): BuildInfo {
  return {
    version: raw.version?.trim() || UNKNOWN,
    commit: shortenCommit(raw.commit),
    builtAt: normalizeBuiltAt(raw.builtAt),
  };
}

/** Rótulo curto para UI: `v1.2.0 · a1b2c3d`. Omite o que não se sabe. */
export function formatBuildLabel(info: BuildInfo): string {
  const version = info.version === UNKNOWN ? UNKNOWN : `v${info.version}`;
  if (info.commit === UNKNOWN) return version;
  return `${version} · ${info.commit}`;
}

/**
 * As referências a `process.env.NEXT_PUBLIC_*` precisam ser literais: o inline
 * de build é uma substituição textual, então desestruturar `process.env` ou
 * indexar com variável (`process.env[nome]`) não funciona.
 */
export const BUILD_INFO: BuildInfo = resolveBuildInfo({
  version: process.env.NEXT_PUBLIC_APP_VERSION,
  commit: process.env.NEXT_PUBLIC_APP_COMMIT,
  builtAt: process.env.NEXT_PUBLIC_APP_BUILT_AT,
});

/** Pronto para exibir na UI — `formatBuildLabel(BUILD_INFO)`. */
export const BUILD_LABEL: string = formatBuildLabel(BUILD_INFO);
