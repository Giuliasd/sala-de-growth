import {
  cloneElement,
  forwardRef,
  InputHTMLAttributes,
  isValidElement,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useId,
} from "react";

// Campos de formulário padronizados. O estilo (foco, erro, desabilitado,
// placeholder) vive na classe `.field` em globals.css — sem onFocus/onBlur em JS.

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input ref={ref} className={`field ${className}`.trim()} {...props} />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea ref={ref} className={`field ${className}`.trim()} {...props} />
  )
);
Textarea.displayName = "Textarea";

/**
 * @deprecated Não use em tela nova. O menu do <select> nativo é desenhado pelo
 * sistema operacional (fundo branco, azul do Windows) e quebra o tema — use
 * `Dropdown` (ou `TagSelect`, quando o gatilho é um pill).
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, ...props }, ref) => (
    <select ref={ref} className={`field ${className}`.trim()} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

// Só campos nativos (ou os wrappers acima) recebem id/aria automaticamente.
// Componentes customizados (Dropdown, MemberPicker…) têm o próprio contrato de
// props e não podem ganhar `id`/`aria-*` sem saber o que fazem com eles.
function ehCampoNativo(child: ReactNode): child is ReactElement<Record<string, unknown>> {
  if (!isValidElement(child)) return false;
  const t = child.type;
  return t === Input || t === Textarea || t === Select || t === "input" || t === "textarea" || t === "select";
}

// Wrapper com rótulo, dica e erro padronizados. O rótulo é ligado ao campo
// (clicar no rótulo foca o campo; leitor de tela anuncia o nome) e a dica/erro
// ficam associadas por aria-describedby — antes só quem passava `htmlFor` à mão
// tinha isso, e eram 2 dos ~60 usos.
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const autoId = useId();
  const descId = `${autoId}-desc`;
  const nativo = ehCampoNativo(children);
  const campoId = htmlFor ?? (nativo ? (children.props.id as string | undefined) ?? autoId : undefined);
  const temDescricao = Boolean(error || hint);

  const campo = nativo
    ? cloneElement(children, {
        id: campoId,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        "aria-describedby":
          [children.props["aria-describedby"] as string | undefined, temDescricao ? descId : undefined]
            .filter(Boolean)
            .join(" ") || undefined,
      })
    : children;

  return (
    <div>
      {label && (
        <label
          htmlFor={campoId}
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </label>
      )}
      {campo}
      {hint && !error && (
        <p id={descId} className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
      {error && (
        <p id={descId} role="alert" className="text-xs mt-1" style={{ color: "var(--status-error-text)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
