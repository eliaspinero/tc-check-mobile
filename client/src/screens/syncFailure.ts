import type { TcSyncResult } from '../project/ProjectSource';
import type { Strings } from '../i18n/en';
import { t } from '../i18n';

type Failure = Extract<TcSyncResult, { synced: false }>['failure'];

// The Rust tC4's sync refusals and blocks (tc-api `SyncRefusal`, `SyncBlock`), each in the checker's language.
const REASON: Record<string, keyof Strings> = {
  offline: 'syncOffline',
  notSignedIn: 'syncNotSignedIn',
  authFailed: 'syncAuthFailed',
  noWriteAccess: 'syncNoWriteAccess',
  refRejected: 'syncRefRejected',
  busy: 'syncBusy',
  remoteMissing: 'syncRemoteMissing',
  unreachable: 'syncUnreachable',
  readOnly: 'syncReadOnly',
  io: 'syncIo',
  notShared: 'syncNotShared',
  projectMismatch: 'syncProjectMismatch',
  needsNewerApp: 'syncNeedsNewerApp',
  tc4TeamRepository: 'syncTc4TeamRepository',
};

/** What a checker reads when a sync stops; after intake it also says that the teammates' work that came in is kept. */
export const syncFailureText = (failure: Failure): string => {
  const reason = t('syncFailed', { reason: t(REASON[failure.value.type] ?? 'syncIo') });
  return failure.type === 'afterIntake' ? `${reason} ${t('syncKept')}` : reason;
};
