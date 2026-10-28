import { en, type Strings } from './en';
import { es } from './es';

export type Locale = 'en' | 'es';

/** The phone's language: Spanish when its first language is a Spanish one, English otherwise. */
export const locale: Locale = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase().startsWith('es') ? 'es' : 'en';

document.documentElement.lang = locale;

const STRINGS: Record<Locale, Strings> = { en, es };

/** A text in the phone's language, with `{name}` filled from `vars`. */
export const t = (key: keyof Strings, vars: Record<string, string | number> = {}): string =>
  STRINGS[locale][key].replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
