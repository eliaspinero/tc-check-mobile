// What the check screen reads once per (project, book): the source panes, the target book,
// the target's text direction, and where the tW articles live.
import type { CheckingEngine, DerivedBook, ResourcesFile } from '../engine/CheckingEngine';
import type { ProjectSource } from '../project/ProjectSource';
import { installedPathOf } from '../resources/installPins';

export interface Pane {
  /** ULT, UST, or the pin's id in upper case. */
  label: string;
  book: DerivedBook | null;
}

export interface CheckContext {
  panes: Pane[];
  target: DerivedBook;
  dir: 'ltr' | 'rtl';
  /** The installed tw resource of the rung that resolved the list (tW only). */
  twPath: string | null;
}

const labelOf = (pin: { id?: string; repoPath: string }): string => {
  const name = pin.repoPath.split('/').pop() ?? '';
  if (/_ult$|_glt$/.test(name)) return 'ULT';
  if (/_ust$|_gst$/.test(name)) return 'UST';
  return (pin.id ?? name).toUpperCase();
};

/** The project's direction: `checking/settings.json` textDirection (tC4 §5.4), else the metadata language's scriptDirection. */
const directionOf = async (repoPath: string, source: ProjectSource): Promise<'ltr' | 'rtl'> => {
  try {
    const settings = JSON.parse(await source.readText(repoPath, 'checking/settings.json')) as { textDirection?: string };
    if (settings.textDirection === 'rtl' || settings.textDirection === 'ltr') return settings.textDirection;
  } catch {
    // no settings file: fall through to the metadata
  }
  const meta = (await source.readMetadata(repoPath)) as { languages?: Array<{ scriptDirection?: string }> };
  return meta.languages?.[0]?.scriptDirection === 'rtl' ? 'rtl' : 'ltr';
};

export const loadCheckContext = async (
  repoPath: string,
  book: string,
  rung: 'primary' | 'fallback' | null,
  source: ProjectSource,
  engine: CheckingEngine,
): Promise<CheckContext> => {
  const BOOK = book.toUpperCase();
  const resources = (await source.readResources(repoPath)) as ResourcesFile;
  const local = await source.listLocal();
  const panes = await Promise.all(
    (resources.extraScripture ?? []).map(async (pin): Promise<Pane> => {
      const path = await installedPathOf(pin, local, source);
      if (!path) return { label: labelOf(pin), book: null };
      try {
        return { label: labelOf(pin), book: engine.parseBook(await source.readText(path, `${BOOK}.usfm`)) };
      } catch {
        return { label: labelOf(pin), book: null };
      }
    }),
  );
  const twPin = rung ? resources.languageSets[rung]?.translationWords : undefined;
  return {
    panes,
    target: engine.parseBook(await source.readText(repoPath, `${BOOK}.usfm`)),
    dir: await directionOf(repoPath, source),
    twPath: twPin ? await installedPathOf(twPin, local, source) : null,
  };
};
