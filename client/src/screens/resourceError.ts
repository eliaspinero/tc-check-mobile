import { DownloadFailed, DownloadStopped } from '../resources/installPins';
import { t } from '../i18n';

/** Why a resource did not install, in the checker's language: no internet, not on Door43, not the pinned
 * version, or any other failure. The raw detail stays the error's own message, shown below it for support. */
export const resourceErrorText = (e: unknown): string => {
  if (e instanceof DownloadStopped) return t('door43Unreachable');
  if (e instanceof DownloadFailed) return t(e.reason === 'notFound' ? 'resourceNotOnDoor43' : 'resourceMismatch');
  return t('resourceInstallFailed');
};
