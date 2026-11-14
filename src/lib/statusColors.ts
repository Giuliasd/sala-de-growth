import { getStatusMeta, familyBorder } from "@/lib/statusConfig";

/**
 * Cor da "fita" (borda de acento) por tipo + status/tipo de ausência.
 * Iniciativa/experimento derivam da fonte única (statusConfig); ausência tem
 * suas próprias cores (o "status" aqui é o tipo: FERIAS, LICENCA_MEDICA, ...).
 */
export function getStatusAccentColor(
  type: "iniciativa" | "experimento" | "ausencia",
  status: string
): string {
  if (type === "ausencia") {
    switch (status) {
      case "FERIAS":              return "var(--sky)";
      case "LICENCA_MEDICA":      return "var(--blush)";
      case "LICENCA_MATERNIDADE": return "var(--blush)";
      case "DAY_OFF":             return "var(--peach)";
      case "OUTROS":              return "var(--border-subtle)";
      default:                    return "var(--border-subtle)";
    }
  }

  return familyBorder(getStatusMeta(type, status).family);
}
