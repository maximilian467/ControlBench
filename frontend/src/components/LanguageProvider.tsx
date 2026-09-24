import { useEffect, useMemo, useState, type ReactNode } from "react"

import { createFormatters } from "@/lib/format"
import { DEFAULT_LANGUAGE, I18nContext, LANGUAGES, type Language } from "@/lib/i18n"
import { MESSAGES } from "@/lib/messages"

const STORAGE_KEY = "controlbench.language"

// localStorage kann fehlen oder gesperrt sein (z. B. privates Fenster), dann gilt einfach die Standardsprache
function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.some((l) => l.value === value) ? (value as Language) : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

/** Stellt Sprache, Texte und Zahlenformate für die ganze App bereit und merkt sich die Wahl. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(storedLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // Ohne Speicher gilt die Wahl nur bis zum Neuladen
    }
  }, [language])

  const value = useMemo(() => {
    const locale = LANGUAGES.find((l) => l.value === language)!.locale
    return { language, setLanguage, t: MESSAGES[language], f: createFormatters(locale) }
  }, [language])

  return <I18nContext value={value}>{children}</I18nContext>
}
