import { Browser, firefox } from 'playwright';
import { mapLimit } from 'async';
import { log } from '../utils';
import { shotConcurrency } from '../constants';
import { waitForNetworkRequests } from './utils';

export type ShotItem = {
  id: string;
  url: string;
  filePath: string;
};

const takeScreenShot = async (browser: Browser, shotItem: ShotItem) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(shotItem.url);

  try {
    await page.waitForLoadState('load', {
      timeout: 30_000,
    });
  } catch (e) {
    log(`Timeout while waiting for page load state: ${shotItem.url}`);
  }

  try {
    await waitForNetworkRequests({ page, timeout: 30_000 });
  } catch (e) {
    log(`Timeout while waiting for all network requests: ${shotItem.url}`);
  }

  await page.screenshot({
    path: shotItem.filePath,
    fullPage: true,
    animations: 'disabled',
  });

  await context.close();
};

export const takeScreenShots = async (shotItems: ShotItem[]) => {
  const browser = await firefox.launch();
  const total = shotItems.length;

  await mapLimit<[number, ShotItem], void>(
    shotItems.entries(),
    shotConcurrency,
    async (item: [number, ShotItem]) => {
      const [index, shotItem] = item;
      const progress = `${index + 1}/${total}`;

      log(`[${progress}] Taking screenshot of '${shotItem.id}'`);

      const startTime = performance.now();
      await takeScreenShot(browser, shotItem);
      const endTime = performance.now();
      const elapsedTime = Number((endTime - startTime) / 1000).toFixed(3);

      log(
        `[${progress}] Screenshot of '${shotItem.id}' taken and saved to '${shotItem.filePath}' in ${elapsedTime}s`,
      );
    },
  );

  await browser.close();
};