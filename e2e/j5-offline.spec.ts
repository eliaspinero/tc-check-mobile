import { test, expect } from '@playwright/test';
import { NEEDS_RIG, UST_V90_INSTALL, deleteRepoIfPresent, placeProjectMissingUstV90, rigUp } from './helpers/rig';
import { openProject } from './helpers/session';

test('j5: offline with a missing pinned resource shows the unavailable state, not an error', async ({ page, context }) => {
  test.skip(!(await rigUp()), NEEDS_RIG);
  await deleteRepoIfPresent(UST_V90_INSTALL);
  await placeProjectMissingUstV90('qa.door43.org/checker1/needs_ust_v90');
  await context.route('https://git.door43.org/**', (route) => route.abort('internetdisconnected'));
  await openProject(page, context, 'needs_ust_v90');
  await expect(page.getByText("isn't on this device yet")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});
