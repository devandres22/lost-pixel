import fse from 'fs-extra';

import { checkDifferences } from './checkDifferences';
import { collect } from './collect';
import { createShots } from './createShots';
import {
  createShotsFolders,
  getEventData,
  isUpdateMode,
  parseHrtimeToSeconds,
  removeFilesInFolder,
  sendTelemetryData,
} from './utils';
import { config, configure } from './config';
import { sendResultToAPI } from './upload';
import { sendInitToAPI } from './sendInit';
import { log } from './log';

export const runner = async () => {
  const executionStart = process.hrtime();
  await configure();
  log('Successfully loaded the configuration!');
  try {
    if (config.setPendingStatusCheck && config.generateOnly) {
      await sendInitToAPI();
    }

    if (isUpdateMode()) {
      if (!config.generateOnly) {
        log(
          'Running lost-pixel in update mode requires the generateOnly option to be set to true',
        );
        process.exit(1);
      }

      log(
        'Running lost-pixel in update mode. Baseline screenshots will be updated',
      );
    }

    log('Creating shot folders');
    const createShotsStart = process.hrtime();
    createShotsFolders();

    log('Creating shots');
    const shotItems = await createShots();

    const createShotsStop = process.hrtime(createShotsStart);
    log(`Creating shots took ${parseHrtimeToSeconds(createShotsStop)} seconds`);

    if (config.generateOnly && shotItems.length === 0) {
      log(`Exiting process with nothing to compare.`);
      log(`Process took ${parseHrtimeToSeconds(createShotsStop)} seconds`);
      process.exit(1);
    }

    log('Checking differences');
    const checkDifferenceStart = process.hrtime();
    const { differenceCount, noBaselinesCount } = await checkDifferences(
      shotItems,
    );

    if (isUpdateMode()) {
      removeFilesInFolder(config.imagePathBaseline);
      fse.copySync(config.imagePathCurrent, config.imagePathBaseline);
    }

    if (
      (differenceCount > 0 || noBaselinesCount > 0) &&
      config.failOnDifference
    ) {
      log(
        `Exiting process with ${differenceCount} found differences & ${noBaselinesCount} baselines to update`,
      );
      process.exit(1);
    }

    const checkDifferenceStop = process.hrtime(checkDifferenceStart);
    log(
      `Checking differences took ${parseHrtimeToSeconds(
        checkDifferenceStop,
      )} seconds`,
    );

    const executionStop = process.hrtime(executionStart);

    log(`Lost Pixel run took ${parseHrtimeToSeconds(executionStop)} seconds`);

    if (
      config.generateOnly &&
      process.env.LOST_PIXEL_DISABLE_TELEMETRY !== '1'
    ) {
      sendTelemetryData({
        shotsNumber: shotItems.length,
        runDuration: Number(parseHrtimeToSeconds(executionStop)),
      });
    } else {
      const comparisons = await collect();
      await sendResultToAPI({
        success: true,
        comparisons,
        event: getEventData(config.eventFilePath),
        durations: {
          runDuration: Number(parseHrtimeToSeconds(executionStop)),
          differenceComparisonsDuration: Number(
            parseHrtimeToSeconds(checkDifferenceStop),
          ),
          shotsCreationDuration: Number(
            parseHrtimeToSeconds(checkDifferenceStop),
          ),
        },
      });
    }
  } catch (error: unknown) {
    const executionStop = process.hrtime(executionStart);
    if (config.generateOnly) {
      sendTelemetryData({
        runDuration: Number(parseHrtimeToSeconds(executionStop)),
        error,
      });
    }

    if (error instanceof Error) {
      log(error.message);
    } else {
      log(error);
    }

    if (!config.generateOnly) {
      await sendResultToAPI({
        success: false,
        event: getEventData(config.eventFilePath),
      });
    }

    process.exit(1);
  }
};
