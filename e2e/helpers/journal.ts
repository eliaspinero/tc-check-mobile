// The journeys' project in the Rust translationCore 4's format (#48): the sample project as tC4's own seed
// makes it (dev-env/rig/src/seed_tc.rs, `npm run rig:seed`), and what the phone's decisions leave in it.
import { listPaths, placeRepo, readIngredient } from './rig';

/** The sample project in the new format, as the rig's seed places it. */
export const SAMPLE_TC = '_local_/_local_/sample_tc';

/** Copy the new-format sample project to `target`. */
export const placeTcProject = (target: string): Promise<void> => placeRepo(SAMPLE_TC, target);

/** The project's sealed packs (`ingredients/tc/changes/<sealer>/<yyyy-mm>/<pack>.ndjson`), by ingredient path. */
export const packsOf = async (repoPath: string): Promise<string[]> =>
  (await listPaths(repoPath)).filter((p) => p.startsWith('tc/changes/') && p.endsWith('.ndjson')).sort();

/** Every change line of the project's packs, as JSON: the line's text before its TAB and checksum (STORAGE.md §4.1). */
export const changesOf = async (repoPath: string): Promise<Array<Record<string, unknown>>> => {
  const out: Array<Record<string, unknown>> = [];
  for (const pack of await packsOf(repoPath)) {
    const [, ...lines] = (await readIngredient(repoPath, pack)).split('\n').filter(Boolean);
    for (const line of lines) out.push(JSON.parse(line.split('\t')[0]) as Record<string, unknown>);
  }
  return out;
};
