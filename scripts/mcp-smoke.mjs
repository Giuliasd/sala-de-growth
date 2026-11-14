#!/usr/bin/env node
/**
 * Smoke test do MCP da Sala: roda o protocolo de verdade contra um servidor
 * (local ou staging) com um access token do Google e confere as defesas.
 *
 *   MCP_TOKEN=ya29.... node scripts/mcp-smoke.mjs [url]
 *
 * `url` padrão: http://localhost:3000/api/mcp. O token vem de variável de
 * ambiente (não de argumento) para não ficar no histórico do shell. Nada é
 * escrito no servidor: só ferramentas de leitura são chamadas.
 */

import http from "node:http";
import https from "node:https";

// node:http(s) em vez de fetch: o fetch embutido derruba o Node 24 no Windows ao encerrar.
function post(target, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) }, agent: false }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

const url = process.argv[2] || "http://localhost:3000/api/mcp";
const token = process.env.MCP_TOKEN;
if (!token) {
  console.error("Defina MCP_TOKEN (access token do Google). Ex.: MCP_TOKEN=ya29... node scripts/mcp-smoke.mjs");
  process.exit(2);
}

const HINTS = {
  401: "Token recusado: o `aud` não bate com MCP_GOOGLE_CLIENT_ID do servidor, ou o token expirou (dura ~1h).",
  403: "Token válido, mas o e-mail não é de um membro ativo neste banco.",
  503: "MCP desligado (MCP_ENABLED), sem MCP_GOOGLE_CLIENT_ID, ou o Google não respondeu ao tokeninfo.",
  429: "Rate limit.",
};

let nextId = 1;
let failures = 0;

async function rpc(method, params, { notification = false } = {}) {
  const res = await post(
    url,
    {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    JSON.stringify({
      jsonrpc: "2.0",
      ...(notification ? {} : { id: nextId++ }),
      method,
      params,
    })
  );
  const text = res.text;
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* corpo não-JSON */
  }
  return { status: res.status, body, text };
}

function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

function toolText(r) {
  return r.body?.result?.content?.[0]?.text ?? "";
}

async function callTool(name, args = {}) {
  const r = await rpc("tools/call", { name, arguments: args });
  const text = toolText(r);
  const ok = r.status === 200 && !r.body?.result?.isError && !r.body?.error;
  check(`tools/call ${name}`, ok, ok ? `${text.length} caracteres` : text || r.body?.error?.message || `HTTP ${r.status}`);
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) check(`${name}: sem e-mail na saída`, false, "apareceu algo parecido com e-mail");
  return ok ? JSON.parse(text) : null;
}

console.log(`Servidor: ${url}\n`);

const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "mcp-smoke", version: "1.0.0" },
});
if (!check("initialize (login com o Google + membro ativo)", init.status === 200, HINTS[init.status] || `HTTP ${init.status}`)) {
  console.log("\nParando: sem autenticação não há o que testar.");
  process.exit(1);
}
await rpc("notifications/initialized", {}, { notification: true });

const list = await rpc("tools/list", {});
const tools = (list.body?.result?.tools ?? []).map((t) => t.name);
check("tools/list", list.status === 200 && tools.length > 0, tools.join(", "));
check(
  "todas as ferramentas são somente leitura",
  (list.body?.result?.tools ?? []).every((t) => t.annotations?.readOnlyHint === true)
);

const ctx = await callTool("contexto_da_sala");
if (ctx) check("contexto_da_sala devolve o seu usuário", !!ctx.voce?.id, ctx.voce ? `${ctx.voce.nome} (${ctx.voce.papel})` : "");

const iniciativas = await callTool("listar_iniciativas");
if (iniciativas?.iniciativas?.[0]) await callTool("ver_iniciativa", { id: iniciativas.iniciativas[0].id });
else console.log("SKIP  ver_iniciativa — nenhuma iniciativa no quarter ativo");

const experimentos = await callTool("listar_experimentos");
if (experimentos?.experimentos?.[0]) await callTool("ver_experimento", { id: experimentos.experimentos[0].id });
else console.log("SKIP  ver_experimento — nenhum experimento no quarter ativo");

await callTool("listar_okrs");

// Defesa: entrada inválida precisa ser recusada pelo schema, não executada.
const bad = await rpc("tools/call", { name: "ver_iniciativa", arguments: { id: "1; DROP TABLE" } });
check("entrada inválida é recusada", bad.body?.result?.isError === true || !!bad.body?.error);

console.log(failures === 0 ? "\nTudo certo." : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
