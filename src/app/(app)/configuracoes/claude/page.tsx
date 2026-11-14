import type { Metadata } from "next";
import { Bot, ShieldCheck, ListChecks } from "lucide-react";
import { isMcpEnabled } from "@/lib/mcp/auth";
import { Alert } from "@/components/shared/Alert";
import { SectionCard } from "@/components/shared/SectionCard";

export const metadata: Metadata = {
  title: "Configurações: Conectar ao Claude | Sala de Growth",
};

// Lê env em runtime (MCP_ENABLED é o kill switch): nada de prerender estático.
export const dynamic = "force-dynamic";

// Página para QUEM USA a Sala: só o passo a passo de conectar. A configuração
// (client OAuth no Google, env vars no Heroku, conector na organização do Claude)
// fica no AGENTS.md, seção "MCP" — não é conteúdo de produto.

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="flex flex-col gap-4 list-none p-0 m-0" style={{ counterReset: "passo" }}>
      {children}
    </ol>
  );
}

function Step({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3" style={{ counterIncrement: "passo" }}>
      <span
        aria-hidden
        className="shrink-0 flex items-center justify-center rounded-full text-xs font-semibold before:content-[counter(passo)]"
        style={{
          width: 24,
          height: 24,
          background: "var(--accent-subtle)",
          color: "var(--brand-primary)",
        }}
      />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-sm font-medium m-0" style={{ color: "var(--text-primary)" }}>
          {title}
        </p>
        {children && (
          <div className="text-sm flex flex-col gap-2" style={{ color: "var(--text-secondary)" }}>
            {children}
          </div>
        )}
      </div>
    </li>
  );
}

export default function ConfiguracoesClaudePage() {
  const enabled = isMcpEnabled() && !!process.env.MCP_GOOGLE_CLIENT_ID;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {enabled ? (
        <Alert variant="success" title="Conexão ativa">
          O Claude já pode se conectar à Sala com o login do Google de cada pessoa.
        </Alert>
      ) : (
        <Alert variant="warning" title="A conexão ainda não está disponível">
          A conexão com o Claude ainda não foi ativada. O passo a passo abaixo vale para
          quando estiver.
        </Alert>
      )}

      <SectionCard icon={Bot} title="Conectar o Claude à Sala">
        <div className="flex flex-col gap-5">
          <p className="text-sm m-0" style={{ color: "var(--text-secondary)" }}>
            Conectado, você pode pedir ao Claude coisas como{" "}
            <em>&quot;quais experimentos meus estão atrasados?&quot;</em> ou{" "}
            <em>&quot;resuma o progresso dos OKRs deste quarter&quot;</em>. Nesta primeira
            versão ele <strong>só consulta</strong>: não cria nem altera nada.
          </p>

          <Steps>
            <Step title="Abra uma conversa nova no Claude">
              <p className="m-0">Pode ser pelo claude.ai ou pelo app de computador.</p>
            </Step>
            <Step title="Clique no “+” da caixa de mensagem → Conectores → “Sala de Growth” → “Vincular”">
              <p className="m-0">
                Se “Sala de Growth” não aparece na lista, peça a quem administra o Claude da sua
                organização para adicioná-lo.
              </p>
            </Step>
            <Step title="Entre com o Google">
              <p className="m-0">
                Use <strong>a mesma conta Google que você usa na Sala</strong> (o e-mail do seu
                cadastro). Se a conta não tiver acesso à Sala, a conexão é recusada.
              </p>
            </Step>
            <Step title="Teste">
              <p className="m-0">
                Na mesma conversa, pergunte:{" "}
                <em>&quot;Quais iniciativas estão em andamento neste quarter?&quot;</em> Na
                primeira vez, o Claude pede para você permitir o uso das ferramentas da Sala.
              </p>
            </Step>
          </Steps>
        </div>
      </SectionCard>

      <SectionCard icon={ListChecks} title="O que o Claude consegue fazer">
        <ul className="text-sm m-0 pl-5 flex flex-col gap-1" style={{ color: "var(--text-secondary)" }}>
          <li>Ver quarters, frentes e pessoas ativas do time.</li>
          <li>Listar e abrir iniciativas e experimentos (checkpoints e comentários incluídos).</li>
          <li>Listar objetivos e KRs com meta, valor atual e progresso.</li>
        </ul>
        <p className="text-sm mt-3 mb-0" style={{ color: "var(--text-secondary)" }}>
          <strong>Não faz</strong> (ainda): criar, editar, apagar, convidar ou mudar permissões.
          E-mails das pessoas nunca são enviados ao Claude.
        </p>
      </SectionCard>

      <SectionCard icon={ShieldCheck} title="Segurança e privacidade">
        <ul className="text-sm m-0 pl-5 flex flex-col gap-1" style={{ color: "var(--text-secondary)" }}>
          <li>O acesso é <strong>pessoal</strong>: o Claude age como você, com o seu perfil e as suas permissões.</li>
          <li>Desativar um membro na Sala corta o acesso dele ao Claude na hora.</li>
          <li>Toda consulta fica registrada (quem, qual ferramenta, quando).</li>
          <li>Os textos da Sala são tratados como dados, nunca como instruções para o Claude.</li>
          <li>A conexão pode ser desligada para todos de uma vez, se preciso.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
