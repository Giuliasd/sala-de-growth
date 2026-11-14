# Sala de Growth

Plataforma para gestão de time de Growth: iniciativas, experimentos, OKRs e a
rotina semanal do time num só lugar.

> **English summary:** Sala de Growth is a web app for managing a Growth team:
> initiatives, experiments (with ICE prioritization), OKRs, a roadmap and the
> team's weekly rituals. Built with Next.js 16, React 19, Prisma 7 and
> PostgreSQL, with Google sign-in. The interface and docs are in Brazilian
> Portuguese. See "Como rodar localmente" below for setup — the commands are
> the same in any language. Licensed under the AGPL-3.0.

## Status do projeto

O projeto está **em uso e é mantido ativamente**. Ele ainda evolui rápido:
novas versões podem trazer mudanças no banco (migrations) ou no comportamento —
leia as notas de cada atualização antes de subir para a sua instalação.
Issues com bugs, dúvidas e
sugestões são bem-vindas. Pull requests também, mas a revisão é feita no tempo
disponível, sem prazo garantido — para mudanças grandes, abra uma issue antes
para combinarmos o caminho.

## O que dá para fazer

- **Iniciativas e experimentos** — com checkpoints, marcos, responsáveis,
  priorização (ICE) e visões de lista, kanban, calendário e Gantt.
- **OKRs** — objetivos e resultados-chave por quarter, com histórico de
  atualizações.
- **Roadmap e calendário** — o que sai em cada mês e as datas-chave.
- **Rituais** — a Weekly do time, com o registro de como cada semana fechou.
- **Ausências** — férias e licenças, com aviso de conflito com prazos.
- **Relatórios, playbook e notificações.**
- **Integração com o Claude (opcional)** — um servidor MCP, somente leitura,
  para consultar a Sala pelo Claude.

## Capturas de tela

> As telas abaixo usam os dados fictícios do `npm run seed`.

**Dashboard** — o que precisa de você na semana e o progresso dos OKRs.

![Dashboard](docs/screenshots/dashboard.png)

**Experimentos** — kanban organizado pela ação sugerida pelo ICE Score.

![Experimentos em kanban](docs/screenshots/experimentos.png)

**OKRs** — objetivos e KRs do quarter, com ritmo esperado e histórico.

![OKRs](docs/screenshots/okrs.png)

**Roadmap** — iniciativas, experimentos e ausências por pessoa ao longo do quarter.

![Roadmap](docs/screenshots/roadmap.png)

## Tecnologias

Next.js 16 (App Router) · React 19 · Prisma 7 + PostgreSQL · NextAuth v5
(login com Google) · Tailwind CSS v4 · TypeScript · Vitest

## Como rodar localmente

### Pré-requisitos

- **Node.js 20** ou mais novo
- **PostgreSQL** — o jeito mais fácil é o Docker (há um `docker-compose.yml`
  pronto)

### Passo a passo

```bash
# 1. Instale as dependências
npm install

# 2. Crie o arquivo de ambiente a partir do modelo
cp .env.example .env

# 3. Suba o banco (Postgres 16 em localhost:5432, usuário e senha "postgres")
docker compose up -d

# 4. Crie as tabelas e gere o Prisma Client
npx prisma migrate deploy
npx prisma generate

# 5. (Opcional) Popule com dados fictícios de demonstração
npm run seed

# 6. Rode o app
npm run dev
```

Abra http://localhost:3000.

> Se usar o banco do `docker-compose.yml`, ajuste o `DATABASE_URL` do `.env`
> para `postgresql://postgres:postgres@localhost:5432/sala_de_growth`.

### Entrar sem configurar o Google

Para testar localmente sem criar credenciais OAuth, coloque no `.env`:

```bash
DEV_BYPASS_AUTH=true
ADMIN_EMAIL="voce@seu.dominio"
```

A tela de login passa a mostrar o botão **"Entrar como admin (dev)"**. Isso só
funciona fora de produção: com `NODE_ENV=production` o botão nunca aparece.

## Variáveis de ambiente

Todas estão no [`.env.example`](.env.example).

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `DATABASE_URL` | Sim | Conexão com o PostgreSQL |
| `AUTH_SECRET` | Sim | Chave das sessões. Gere com `openssl rand -base64 32` |
| `AUTH_URL` | Sim | URL pública do app (em dev, `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | Sim* | Login com Google |
| `GOOGLE_CLIENT_SECRET` | Sim* | Login com Google |
| `ADMIN_EMAIL` | Não | E-mail promovido a liderança no login — use para criar o primeiro acesso |
| `DEV_BYPASS_AUTH` | Não | `true` libera o login de dev (só fora de produção) |
| `MCP_ENABLED` | Não | `true` liga o servidor MCP em `/api/mcp` |
| `MCP_GOOGLE_CLIENT_ID` | Não | Cliente OAuth do Google exclusivo para o MCP |

\* Dispensáveis em desenvolvimento se você usar o `DEV_BYPASS_AUTH`.

### Configurando o login com Google

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um
   **ID do cliente OAuth** do tipo **Aplicativo da Web**.
2. Em "URIs de redirecionamento autorizados", adicione
   `http://localhost:3000/api/auth/callback/google` (e a URL de produção,
   quando houver).
3. Copie o ID e o segredo para `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

O acesso é por **convite**: a pessoa em `ADMIN_EMAIL` entra primeiro e convida
o restante do time em Configurações.

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm test` | Testes (Vitest) |
| `npx tsc --noEmit` | Checagem de tipos |
| `npx eslint` | Lint |
| `npx prisma migrate dev --name <nome>` | Cria uma migration nova |
| `npm run seed` | Dados de demonstração (só em banco local) |

## Deploy

O projeto já vem com `Procfile` e `scripts/release.sh` para o **Heroku**: a
cada release, as migrations são aplicadas antes da versão nova subir.

Em outra plataforma, o essencial é:

1. Definir as variáveis de ambiente acima.
2. `npm run build`
3. `npx prisma migrate deploy` antes de iniciar.
4. `npm start`

## Contribuindo

O [`AGENTS.md`](AGENTS.md) explica as convenções do projeto (commits, migrations,
componentes compartilhados e regras que costumam pegar quem chega agora). Antes
de abrir um PR, rode `npx tsc --noEmit`, `npx eslint` e `npm test`.

Encontrou uma falha de segurança? Veja o [`SECURITY.md`](SECURITY.md).

## Licença

Copyright (C) 2026 Giulia Dias

Este projeto é software livre, distribuído sob a
[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). Em resumo: você
pode usar, estudar, modificar e redistribuir o código, inclusive para fins
comerciais. Em troca, se você distribuir uma versão modificada **ou
disponibilizá-la para outras pessoas usarem pela internet**, precisa publicar o
código-fonte dessa versão sob a mesma licença.

O texto completo e oficial está no arquivo [`LICENSE`](LICENSE).
