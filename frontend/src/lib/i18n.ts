import { createContext, useContext } from "react"

import type { Formatters } from "@/lib/format"
import type { Messages } from "@/lib/messages"

export type Language = "en" | "de"

export const LANGUAGES: { value: Language; label: string; locale: string }[] = [
  { value: "en", label: "EN", locale: "en-US" },
  { value: "de", label: "DE", locale: "de-DE" },
]

export const DEFAULT_LANGUAGE: Language = "en"

export type I18n = {
  language: Language
  setLanguage: (language: Language) => void
  /** Texte der Oberfläche in der aktuellen Sprache */
  t: Messages
  /** Zahlenformate der aktuellen Sprache */
  f: Formatters
}

export const I18nContext = createContext<I18n | null>(null)

/** Sprache, Texte und Zahlenformate. Funktioniert nur innerhalb von <LanguageProvider>. */
export function useI18n(): I18n {
  const i18n = useContext(I18nContext)
  if (i18n === null) throw new Error("useI18n must be used inside <LanguageProvider>")
  return i18n
}
