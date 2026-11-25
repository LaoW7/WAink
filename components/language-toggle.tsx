"use client";

import { Languages } from "lucide-react";
import { translations, type Locale } from "@/lib/i18n";

export function LanguageToggle({
  locale, onToggle,
}: {
  locale: Locale;
  onToggle: () => void;
}) {
  const t = translations[locale];
  return (
    <button
      type="button"
      className="button settings-button language-toggle"
      onClick={onToggle}
      title={t.switchLanguageTitle}
      aria-label={t.switchLanguageTitle}
    >
      <Languages size={17} aria-hidden />
      <span>{t.switchToLanguage}</span>
    </button>
  );
}
