import { createHash } from 'node:crypto';
import { FSRSVersion } from 'ts-fsrs';
import schedulerSource from './fsrs-service.js?raw';
import dayBoundarySource from '../../utils/day-boundary.js?raw';

// Fail closed after an engine change; add a retained engine before supporting
// historical fingerprints. Never silently replay with a different algorithm.
export const REPLAY_VERSION = 'amq-fsrs-20260924-v1';
export const REPLAY_FINGERPRINT = createHash('sha256')
  .update(`${FSRSVersion}\n${schedulerSource}\n${dayBoundarySource}`).digest('hex');
export const replayOptions = allowSameDayReviews => ({
  version: REPLAY_VERSION, fingerprint: REPLAY_FINGERPRINT,
  allowSameDayReviews: allowSameDayReviews !== false
});
