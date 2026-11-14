# Como contribuir

Obrigada pelo interesse na Sala de Growth! Toda ajuda é bem-vinda: relatar um
bug, sugerir uma melhoria, corrigir um texto ou enviar código.

Ao participar, você concorda em seguir o nosso
[Código de Conduta](CODE_OF_CONDUCT.md).

## Relatar um bug ou sugerir uma melhoria

Abra uma [issue](../../issues/new/choose) usando um dos modelos:

- **Relatar um bug** — algo não funciona como deveria.
- **Sugerir uma melhoria** — uma ideia de funcionalidade ou ajuste.

Antes de abrir, dê uma olhada se já não existe uma issue parecida.

> **Encontrou uma falha de segurança?** Não abra uma issue pública. Siga o
> [`SECURITY.md`](SECURITY.md).

## Enviar código

1. **Para mudanças grandes, abra uma issue antes** e combine o caminho. Isso
   evita trabalho perdido.
2. Faça um **fork** do repositório e crie uma branch a partir da `main`:
   - `feat/<nome>` para funcionalidade nova
   - `fix/<nome>` para correção de bug
   - `docs/<nome>` só para documentação
   - `chore/<nome>` para configuração, dependências e ferramentas
3. Rode o projeto localmente seguindo o [README](README.md#como-rodar-localmente).
4. Faça a mudança. As convenções do código (componentes compartilhados,
   migrations, permissões, regras que costumam pegar quem chega agora) estão no
   [`AGENTS.md`](AGENTS.md) — vale a leitura antes de mexer.
5. Antes de abrir o Pull Request, rode:

   ```bash
   npx tsc --noEmit
   npx eslint
   npm test
   ```

   O CI roda os mesmos três comandos, e o PR só pode ser mesclado com eles
   passando.
6. Abra o **Pull Request** para a `main`, explicando **o que** mudou e **por quê**.
   Se ele resolve uma issue, escreva `Closes #<número>` na descrição.

### Mensagens de commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em
português, com a primeira linha curta:

```
feat: adiciona filtro por frente no roadmap
fix: corrige o prazo exibido na Weekly
docs: explica como configurar o login com Google
```

### Mudanças no banco

Mudou o `prisma/schema.prisma`? Crie a migration com
`npx prisma migrate dev --name <nome_curto>` e **commite a migration junto** com
o código que a usa.

## Revisão

A revisão é feita no tempo disponível, sem prazo garantido. Podemos pedir
ajustes antes de mesclar — é parte normal do processo.

## Licença

Ao contribuir, você concorda que a sua contribuição será distribuída sob a
mesma licença do projeto, a [AGPL-3.0](LICENSE).
