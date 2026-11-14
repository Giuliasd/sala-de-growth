import { dividirEmLinks } from "@/lib/linkify";

/**
 * Os trechos de um texto com os links já como <a> (ver lib/linkify). Sem
 * envoltório: serve para quem já tem o próprio parágrafo (ex.: o texto editável
 * do InlineTextArea).
 *
 * O link abre em outra aba, e nem o clique nem o Enter sobem para o elemento de
 * fora — a linha do checkpoint e o comentário editável reagem a clique/teclado,
 * e abrir o link não pode entrar em modo de edição.
 */
export function TrechosComLinks({ texto }: { texto: string }) {
  return (
    <>
      {dividirEmLinks(texto).map((trecho, i) =>
        trecho.tipo === "link" ? (
          <a
            key={i}
            href={trecho.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="underline underline-offset-2 hover:opacity-80"
            style={{ color: "var(--brand-primary)" }}
          >
            {trecho.texto}
          </a>
        ) : (
          <span key={i}>{trecho.texto}</span>
        )
      )}
    </>
  );
}

/**
 * Texto corrido em que os links viram hiperlink sozinhos (ver lib/linkify).
 * Quebras de linha são preservadas.
 */
export function TextoComLinks({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`.trim()}>
      <TrechosComLinks texto={texto} />
    </p>
  );
}
