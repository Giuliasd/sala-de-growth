# Política de segurança

## Como reportar uma vulnerabilidade

Se você encontrou uma vulnerabilidade de segurança neste projeto, **não abra uma
issue pública**. Use o recurso de reporte privado do GitHub:

1. Vá até a aba **Security** do repositório.
2. Clique em **Report a vulnerability**.
3. Descreva o problema, como reproduzir e o impacto que você enxerga.

Vamos confirmar o recebimento e manter você informado sobre a correção.

## Boas práticas para quem for usar o projeto

- Nunca faça commit do arquivo `.env`. Use o `.env.example` como modelo.
- Gere um `AUTH_SECRET` forte (por exemplo, `openssl rand -base64 32`).
- Mantenha `DEV_BYPASS_AUTH` desligado fora do ambiente local.
- Só ative o servidor MCP (`MCP_ENABLED=true`) depois de configurar o
  `MCP_GOOGLE_CLIENT_ID`.
