'use client';

import { useAccountPrefsStore } from '@/stores/useAccountPrefsStore';
import { translations, type TranslationKey } from './translations';

export function useTranslation() {
  const language = useAccountPrefsStore((s) => s.language);

  const t = (key: TranslationKey): string => {
    return translations[language]?.[key] ?? translations.en[key] ?? key;
  };

  return { t, language };
}
