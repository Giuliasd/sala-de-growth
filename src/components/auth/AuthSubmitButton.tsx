"use client"

import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"

/**
 * Botão de submit para os forms de auth (login/logout). Lê o estado do form pai
 * via useFormStatus: enquanto a server action está pendente, desabilita e troca
 * o conteúdo por um spinner + rótulo — evita clique duplo e dá feedback.
 */
export function AuthSubmitButton({
  children,
  pendingLabel,
  className = "",
  style,
}: {
  children: React.ReactNode
  pendingLabel: string
  className?: string
  style?: React.CSSProperties
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`btn u-pressable w-full ${className}`.trim()}
      style={style}
    >
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}
