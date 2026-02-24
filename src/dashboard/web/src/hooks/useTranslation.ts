import { useSyncExternalStore } from 'react'
import { t, onLocaleChange, getLocale, type Locale } from '../i18n'

function subscribe(callback: () => void): () => void {
  return onLocaleChange(callback)
}

function getSnapshot(): Locale {
  return getLocale()
}

export function useTranslation() {
  // Re-render when locale changes
  useSyncExternalStore(subscribe, getSnapshot)
  return { t }
}
