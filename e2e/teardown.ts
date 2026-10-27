// The rig shares translationCore 4's state (dev-env/README.md), so the journeys remove what they leave
// on it: the Door43-shaped project copies they place, and the en_ust versions they install.
import { RIG_URL, deleteRepoIfPresent, listLocal, rigUp } from './helpers/rig';

const LEFT_BY_JOURNEYS = [/^qa\.door43\.org\/checker1\//, /^_local_\/_sideloaded_\/unfoldingword--en_ust(--[0-9a-f]{12})?$/];

export default async function teardown(): Promise<void> {
  if (!(await rigUp())) return;
  for (const repo of await listLocal()) if (LEFT_BY_JOURNEYS.some((re) => re.test(repo))) await deleteRepoIfPresent(repo);
  console.log(`teardown: removed the journeys' repos from the rig at ${RIG_URL}`);
}
