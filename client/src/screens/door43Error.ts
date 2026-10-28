import { Door43ApiError } from '../door43/door43Api';
import { t } from '../i18n';

/** What a checker reads when a Door43 call fails: no internet and a refused sign-in in their language;
 * any other answer is Door43's own message, which only Door43 can word. */
export const door43ErrorText = (e: unknown, signingIn = false): string => {
  if (e instanceof Door43ApiError && e.status === 0) return t('door43Unreachable');
  if (signingIn && e instanceof Door43ApiError && (e.status === 401 || e.status === 403)) return t('wrongCredentials');
  const message = (e as Error)?.message ?? String(e);
  return /[.!?]$/.test(message) ? message : `${message}.`;
};
