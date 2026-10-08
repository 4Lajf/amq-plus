const MODES = new Set(['auto', 'manual']);
const MANUAL_PERCENTAGES = [
	['dueSongPercentage', 70],
	['newSongPercentage', 30],
	['revisionSongPercentage', 0]
];
const MANUAL_COUNTS = ['dueCount', 'newCount', 'revisionCount'];

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteInteger(value) {
	return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Validate the connector-facing session controls before a generation job is
 * created. Legacy shelf fields are intentionally ignored for compatibility.
 *
 * @param {Record<string, unknown>} params
 * @returns {string|null} A user-facing validation error, or null.
 */
export function validateSessionStartParams(params) {
	const sessionLength = params.sessionLength ?? 20;
	const mode = params.mode ?? 'auto';

	if (!isFiniteInteger(sessionLength) || sessionLength < 1 || sessionLength > 100) {
		return 'Session length must be a whole number between 1 and 100';
	}
	if (typeof mode !== 'string' || !MODES.has(mode)) {
		return 'Mode must be auto or manual';
	}

	const duePercentage = params.dueSongPercentage ?? 70;
	if (
		typeof duePercentage !== 'number' ||
		!Number.isFinite(duePercentage) ||
		duePercentage < 0 ||
		duePercentage > 100
	) {
		return 'Due song percentage must be between 0 and 100';
	}

	if (mode !== 'manual') return null;

	const usesCounts = MANUAL_COUNTS.some((field) => params[field] != null);
	if (usesCounts) {
		let total = 0;
		for (const field of MANUAL_COUNTS) {
			const value = params[field] ?? 0;
			if (!isFiniteInteger(value) || value < 0) {
				return 'Manual song counts must be non-negative whole numbers';
			}
			total += value;
		}
		if (total > sessionLength) {
			return 'Manual song counts cannot exceed the session length';
		}
		return null;
	}

	let totalPercentage = 0;
	for (const [field, fallback] of MANUAL_PERCENTAGES) {
		const value = params[field] ?? fallback;
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
			return 'Manual song percentages must each be between 0 and 100';
		}
		totalPercentage += value;
	}
	if (totalPercentage > 100) {
		return 'Manual song percentages cannot add up to more than 100';
	}

	return null;
}
