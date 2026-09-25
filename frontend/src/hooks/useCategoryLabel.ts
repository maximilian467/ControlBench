import { useI18n } from "@/lib/i18n"

/** Anzeigename einer Kategorie: vorgeschlagene Kategorien übersetzt, eigene unverändert, null = "ohne Kategorie" */
export function useCategoryLabel() {
  const { t } = useI18n()
  return (key: string | null) => (key === null ? t.noCategory : (t.categoryNames[key] ?? key))
}
