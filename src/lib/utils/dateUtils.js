/**
 * Date and time utility functions for the AMQ+ Editor
 */

/**
 * Get the current season based on the current month
 * @returns {string} Current season ('Winter', 'Spring', 'Summer', or 'Fall')
 */
export function getCurrentSeason() {
	const now = new Date();
	const month = now.getMonth(); // 0-11

	if (month >= 0 && month <= 2) return 'Winter';
	if (month >= 3 && month <= 5) return 'Spring';
	if (month >= 6 && month <= 8) return 'Summer';
	if (month >= 9 && month <= 11) return 'Fall';
}

/**
 * Get the current year
 * @returns {number} Current year
 */
export function getCurrentYear() {
	return new Date().getFullYear();
}
