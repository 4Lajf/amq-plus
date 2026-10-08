/**
 * In-process store for async training session start jobs.
 *
 * Cloudflare's origin timeout is 100s; building a large song pool (cold
 * Pixeldrain + filters) can exceed that. Session start returns 202 + jobId
 * immediately and the connector polls until the job is ready.
 *
 * Process-local on purpose: amqplus.moe runs a single Node adapter instance.
 * Jobs are discarded on restart; the client just starts again.
 *
 * @module lib/server/training/session-jobs
 */

/** @typedef {'pending' | 'ready' | 'error'} JobStatus */

/**
 * @typedef {Object} SessionJob
 * @property {string} id
 * @property {string} userId
 * @property {JobStatus} status
 * @property {string|null} message
 * @property {Object|null} result - Session payload when ready
 * @property {string|null} error
 * @property {number|null} errorStatus
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** @type {Map<string, SessionJob>} */
const jobs = new Map();

const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 500;

/**
 * Concurrent pending jobs allowed per user.
 *
 * The old synchronous start naturally rate-limited button-mashing: the request
 * blocked, so a second click queued behind the first. Returning 202 removed
 * that, and 3shine's ~200 clicks in a day would now be ~200 concurrent
 * large-pool generations. Two in flight covers a legitimate retry.
 */
const MAX_PENDING_JOBS_PER_USER = 2;

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
  if (jobs.size <= MAX_JOBS) return;
  // Drop oldest first if we somehow pile up.
  const ordered = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
  for (const job of ordered.slice(0, jobs.size - MAX_JOBS)) {
    jobs.delete(job.id);
  }
}

/**
 * Pending jobs a user currently has in flight.
 *
 * @param {string} userId
 * @returns {SessionJob[]}
 */
export function getPendingJobsForUser(userId) {
  pruneJobs();
  return [...jobs.values()].filter((job) => job.userId === userId && job.status === 'pending');
}

/**
 * @param {string} userId
 * @returns {SessionJob}
 * @throws {Error} When the user already has MAX_PENDING_JOBS_PER_USER in flight
 */
export function createSessionJob(userId) {
  pruneJobs();

  const pending = getPendingJobsForUser(userId);
  if (pending.length >= MAX_PENDING_JOBS_PER_USER) {
    const err = new Error(
      'A training session is already being generated. Wait for it to finish before starting another.'
    );
    // @ts-ignore - carried through to the HTTP response
    err.status = 429;
    // @ts-ignore
    err.existingJobId = pending[0].id;
    throw err;
  }

  const id = crypto.randomUUID();
  /** @type {SessionJob} */
  const job = {
    id,
    userId,
    status: 'pending',
    message: 'Queued…',
    result: null,
    error: null,
    errorStatus: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  jobs.set(id, job);
  return job;
}

/**
 * @param {string} jobId
 * @returns {SessionJob|undefined}
 */
export function getSessionJob(jobId) {
  pruneJobs();
  return jobs.get(jobId);
}

/**
 * @param {string} jobId
 * @param {string} message
 */
export function setSessionJobMessage(jobId, message) {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'pending') return;
  job.message = message;
  job.updatedAt = Date.now();
}

/**
 * @param {string} jobId
 * @param {Object} result
 */
export function completeSessionJob(jobId, result) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'ready';
  job.message = 'Ready';
  job.result = result;
  job.updatedAt = Date.now();
}

/**
 * @param {string} jobId
 * @param {string} error
 * @param {number} [errorStatus=500]
 */
export function failSessionJob(jobId, error, errorStatus = 500) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'error';
  job.message = null;
  job.error = error;
  job.errorStatus = errorStatus;
  job.updatedAt = Date.now();
}

/** @returns {void} Test helper */
export function resetSessionJobsForTests() {
  jobs.clear();
}
