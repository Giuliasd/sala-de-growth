<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Sala de Growth — Guia para agentes e contribuidores

Documento curto. Diz **só** o que muda em relação a um projeto Next.js padrão e o que costuma morder quem entra no projeto.

## Stack

- **Next.js 16** (App Router, Turbopack, RSC) + **React 19**
- **Prisma 7** com adapter `@prisma/adapter-pg` (Postgres)
- **NextAuth v5 beta** (provider Google, com bypass opcional para dev)
- **Tailwind v4** (PostCSS)
- **Zod v4** para validação de inputs em actions
- **TypeScript 5**, **Vitest** para testes

## Estrutura

```
src/
  app/               # App Router
    (app)/           # rotas autenticadas
    (auth)/login/    # tela de login
    api/auth/        # NextAuth handler
    api/mcp/         # servidor MCP (Claude conectado à Sala)
  actions/           # server actions (use server)
  components/        # componentes React (shared/, iniciativas/, experimentos/, okrs/, ...)
  lib/               # prisma, auth, session, okr (cálculos), utils
  generated/prisma/  # Prisma Client (gitignored, gerado por prisma generate)
prisma/
  schema.prisma
  migrations/        # uma pasta por migration, timestamp_<nome>
  seed.ts            # dados de demonstração (só banco local)
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe Next em http://localhost:3000 (Turbopack) |
| `npx prisma generate` | Regera o Prisma Client (rode toda vez que mexer em `schema.prisma`) |
| `npx prisma migrate dev --name <nome>` | Cria + aplica migration no dev local |
| `npx prisma migrate deploy` | Aplica migrations pendentes em produção |
| `npx prisma migrate status` | Mostra divergência entre histórico local e DB |
| `npx tsc --noEmit` | Checagem de tipos sem emitir build |
| `npx eslint` | Lint |
| `npm test` | Testes (Vitest) |
| `npm run seed` | Roda `prisma/seed.ts` (dados fictícios de demonstração) |

## Convenção de commits

Conventional Commits em **português**, mensagem na primeira linha curta:

```
feat: adiciona campo X em Y
fix: corrige Z quando W
perf: reduz consultas N+1 em /okrs
chore: atualiza dependências
docs: documenta convenção de migrations
```

## Pull Requests

- **Um PR = uma feature**. Sem PRs gigantes com várias features juntas.
- Antes de abrir: `tsc --noEmit`, `eslint` e `npm test` limpos (o CI roda os três).

## Prisma & migrations

1. Mude `prisma/schema.prisma`.
2. Rode `npx prisma migrate dev --name <nome_curto>` — cria a migration e aplica no dev.
3. **Commite o arquivo da migration junto com o código** que a consome. Nunca separado.
4. **Uma feature = uma migration** quando possível.
5. Em produção: `npx prisma migrate deploy`. Nunca `migrate dev` em produção.

## Auth & dev login bypass

Auth principal: **Google OAuth**. Contas novas entram por **convite** (qualquer domínio, papel definido no convite). O e-mail configurado em `ADMIN_EMAIL` (env var) é auto-promovido a `LIDERANCA` no login — sem a env var, ninguém é auto-promovido. Ele só **cria** conta nova se o time não tiver ninguém ativo na liderança ou se houver convite válido (`criarAdmin` em `lib/auth.ts`). O login Google exige `email_verified`.

**Dev bypass** (para não depender do OAuth em dev local):

```bash
# no seu .env
DEV_BYPASS_AUTH=true
```

Habilita um botão extra na tela de login. Só funciona se `NODE_ENV !== "production"` **e** o flag estiver setado. Em produção o código fica inerte mesmo com o flag.

## Seed

`npm run seed` cria um time fictício e dados de demonstração. **Só roda em banco local** — a decisão está em `src/lib/seed-guard.ts` (com testes). Há uma única exceção, para um ambiente de staging totalmente vazio, que exige confirmação explícita por variável de ambiente; qualquer outro banco remoto faz o script abortar sem escrever nada.

## MCP (Claude conectado à Sala)

`/api/mcp` é um servidor MCP (Streamable HTTP, sem sessão) para o time consultar a Sala pelo Claude. **Somente leitura.** O passo a passo para quem usa fica em Configurações → "Conectar ao Claude".

**Como a segurança funciona — não afrouxe sem entender:**

- **Login = Google do próprio membro.** O Claude manda `Authorization: Bearer <access token do Google>`; `lib/mcp/auth.ts` valida no `tokeninfo`, exige `aud` = `MCP_GOOGLE_CLIENT_ID` (sem isso, token de *qualquer outro app* Google valeria), e-mail verificado e **membro ativo**. Nunca cria conta. O token nunca é logado nem guardado em claro (cache por SHA-256); `isActive`/`role` são relidos do banco a cada chamada.
- **Cliente OAuth separado do login da Sala** (`MCP_GOOGLE_CLIENT_ID`): o segredo dele é entregue ao Claude. O servidor não guarda segredo nenhum.
- **Kill switch:** sem `MCP_ENABLED=true` a rota responde 503 e o discovery 404.
- **Rota pública no middleware, autenticada por dentro.** Só vale `Bearer` (cookie é ignorado); qualquer `Origin` é 403; corpo ≤ 256 KB; rate limit por membro; **lote JSON-RPC (array) é 400**.
- **Mesmas permissões das telas:** as ferramentas chamam as server actions existentes. `getCurrentMember()` devolve o membro do token quando está dentro de `runAsMcpMember` (`lib/mcp/member-context.ts`) — só a rota MCP, depois de autenticar, pode abrir esse contexto.
- **Nenhuma ferramenta devolve e-mail.** Textos de pessoas são cortados e o `instructions` do servidor os declara como dado, não instrução.
- **Ausências:** licença médica e maternidade saem só como "licença", e as observações da ausência nunca saem (`tipoDeAusencia` em `lib/mcp/tools-rotina.ts`).
- **Só leitura de verdade:** `ver_semana_fechada` **não** chama `fecharSemanasVencidas` — o leitor calcula o desfecho com a mesma regra.
- Ferramentas em `lib/mcp/tools.ts` e `lib/mcp/tools-rotina.ts`; utilitários comuns em `lib/mcp/kit.ts`.
- **Toda chamada vai para `McpAuditLog`** (membro, ferramenta, argumentos, ok/erro). Nunca grave token, headers nem o corpo cru.

**Nome e descrição de ferramenta são o que faz o Claude usá-la.** Nomeie como o time pergunta (`o_que_esta_travado`) e ponha na descrição as palavras que as pessoas usam.

**Como ativar:**

1. **Google Cloud** → Credenciais → crie um ID do cliente OAuth do tipo **Aplicativo da Web**, **separado** do login da Sala. URIs de redirecionamento: `https://claude.ai/api/mcp/auth_callback` e `https://claude.com/api/mcp/auth_callback`.
2. **Servidor:** defina `MCP_GOOGLE_CLIENT_ID=<id>` e `MCP_ENABLED=true` (o segredo **não** vai para o servidor). Conferir: `POST /api/mcp` sem token → 401 com `WWW-Authenticate`; `/.well-known/oauth-protected-resource` → 200.
3. **Claude:** adicione um conector personalizado com a URL `https://<seu-app>/api/mcp`, usando seu próprio cliente OAuth (ID e segredo).

A URL pública vem de `AUTH_URL` (ou `NEXTAUTH_URL`) — nunca do header `Host`.

Testar sem o claude.ai: `MCP_TOKEN=<access token do Google para o client do MCP> node scripts/mcp-smoke.mjs <url>`.

## Deploy

O projeto inclui um `Procfile` e `scripts/release.sh` para Heroku: a cada release, `prisma migrate deploy` roda com retry antes de a versão subir. Em outras plataformas, o essencial é: `npm run build` (já roda `prisma generate`), `npx prisma migrate deploy` antes de iniciar e `npm start`.

A versão exibida no rodapé da sidebar e em `GET /api/version` é **congelada em tempo de build** (`next.config.ts` captura, `src/lib/version.ts` lê).

## Validação antes de commitar

```bash
npx prisma generate
npx tsc --noEmit
npx eslint
npm test
```

## Pontos de atenção do app

- **`Iniciativa` vs `Experimento`** são entidades paralelas (com `convert` entre elas). Mudar uma quase sempre exige mudar a outra. Vale `git grep` para conferir.
- **`Checkpoint`** também é duplicado (`InitiativeCheckpoint` + `ExperimentoCheckpoint`). As actions (`initiative-checkpoints.ts` e `experimento-checkpoints.ts`) são a mesma lógica com nomes trocados, e o teste `checkpoints-paridade.test.ts` exige que continuem iguais: mudou um, mude o outro.
- **Componentes em `components/shared/`** são reutilizados em ambas — modifique com cuidado.
- **Cards de item de atividade**: use `components/shared/ActivityItemCard`. A página `/design-system` (dev) documenta a anatomia.
- **Tooltips**: use `components/shared/CursorTooltip`. Não use o `title` nativo do navegador. Rótulo de uma linha: `IconButton` já converte o próprio `title`; em outros elementos use `data-tooltip="…"`. `data-tooltip` não dá nome acessível: botão só com ícone leva também `aria-label`.
- **Atraso e risco têm uma cor só:** texto usa `--status-late-text`; dentro de pill/barra com fundo `--peach-soft`, `--peach-strong`. Erro (validação, falha, excluir) é outra coisa e segue em `--status-error-*`. Ver "Atraso e risco" no `/design-system`.
- **Tabelas: toda coluna alinha à esquerda — título e conteúdo.** Única exceção: a coluna de ações sem título, colada à direita.
- **Pills de filtro**: use `components/shared/FilterPill`. Muda só a cor, nunca a caixa.
- **Confirmações e erros**: use `components/shared/ConfirmDialog`. Nunca `confirm()`/`alert()` nativos.
- **Dropdown de edição de tag**: use `components/shared/TagSelect`. Nunca `<select>` nativo sobreposto.
- **Detalhe de iniciativa/experimento fora das telas próprias**: abre o popup `components/shared/DetailModal` (iframe `?modal=1`). O iframe depende de `frame-ancestors 'self'` na CSP (middleware).
- **Responsável é N:N, não um campo.** `Iniciativa`, `Experimento` e os checkpoints têm `members TeamMember[]`. Filtrar por pessoa é `members: { some: { id: { in: ids } } }`; gravar é `members: { set: [...] }`; `updateMany` **não** escreve relação, então edição em massa vira um `update` por item dentro de `$transaction`. Nas visões agrupadas por pessoa um item aparece sob **cada** responsável.
- **Exibir responsáveis:** use `components/shared/MemberChips` ou os helpers `formatMemberNames`/`formatMemberFirstNames`. Nunca renderize só `members[0]`.
- **Permissões:** `requireEditPermission()` em `lib/session.ts` é o gate padrão das mutations; para edição restrita aos responsáveis, `requireOwnershipPermission()`. Exceção: **lançar valor num KR** só pede `requireEditPermission`, e o histórico marca quando quem lançou não é responsável.
- **Visibilidade (decisões de produto):** objetivos são editáveis por qualquer não-visitante; ausências na web mostram tipo e observações a todo o time (o MCP esconde os dois); o histórico do item mostra a todos quem fez cada mudança.
- **Remoção de membro é sempre soft** (`isActive: false`). Nunca delete um `TeamMember`. O corte de acesso é imediato: `getCurrentMember()` rejeita inativos e o JWT é invalidado na revalidação periódica.
- **Marco com checkpoints necessários:** checkpoint de categoria `MARCO` tem `requisitos` (N:N com o próprio model). Progresso e "em risco" vêm de `progressoDoMarco` (`lib/checkpoint-marco.ts`); a interface usa `components/shared/CheckpointMarco`.
- **Registro da semana (Weekly de Rituais):** o model `RegistroSemanal` guarda cada checkpoint que passou pela semana. A semana fecha, por padrão, na sexta às 14:59 (São Paulo); a liderança muda dia e hora em Configurações → Rituais (model `HorarioDoRitual`). Regras puras em `lib/registro-semanal.ts`, banco em `lib/registro-semanal-db.ts`.
  - **Toda action nova que mexe em checkpoint chama `antesDeMexerNoItem(kind, itemId)` ANTES de gravar** (e `marcarExcluidos` depois de excluir, `contarRemarcacoes` quando muda o prazo).
  - **Semana fechada não se edita, e quem garante é o servidor:** cheque `semanaFechadaParaEdicao(weekStart)` antes de gravar.
  - **Todo cálculo de semana passa as vigências:** `janelaDoRitual(weekStart, vigencias)` e `semanaDoRitualAtual(agora, vigencias)`, com `lerVigenciasDoRitual()`. Nunca escreva "14:59" fixo na tela.
  - **"Excluído por" é só da liderança** na Weekly.
