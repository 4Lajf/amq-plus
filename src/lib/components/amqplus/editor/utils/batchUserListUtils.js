/**
 * Utility functions for Batch User List node operations.
 * Handles importing multiple user lists and combining their songs.
 *
 * @module batchUserListUtils
 */

import { importUserList } from './songListUtils.js';

/**
 * Import anime lists from multiple users and combine their songs.
 * Songs from all users are combined, and duplicate songs have their metadata merged.
 *
 * @param {Array<{platform: string, username: string, selectedLists: Object}>} userEntries - Array of user entry objects
 * @param {boolean} [forceRefresh=false] - Whether to bypass cache
 * @param {Function} [onProgress] - Optional callback for progress updates
 * @returns {Promise<{combinedSongsList: Array, userResults: Array, totalAnimeCount: number, totalSongCount: number}>}
 * @throws {Error} If import fails
 */
export async function importBatchUserLists(userEntries, forceRefresh = false, onProgress = null) {
	if (!userEntries || userEntries.length === 0) {
		throw new Error('No user entries provided');
	}

	// Filter out entries without usernames
	const validEntries = userEntries.filter((entry) => entry.username?.trim());

	if (validEntries.length === 0) {
		throw new Error('No valid user entries with usernames');
	}

	const userResults = [];
	const allSongs = [];
	let totalAnimeCount = 0;

	// Import each user's list sequentially
	for (let i = 0; i < validEntries.length; i++) {
		const entry = validEntries[i];

		try {
			// Report progress to caller
			if (onProgress) {
				onProgress({
					currentUser: i + 1,
					totalUsers: validEntries.length,
					username: entry.username,
					platform: entry.platform,
					status: 'importing'
				});
			}

			const result = await importUserList(
				/** @type {'anilist' | 'mal'} */(entry.platform),
				entry.username,
				entry.selectedLists,
				forceRefresh,
				null // Don't pass through ETA progress for individual users
			);

			// Store result for this user
			userResults.push({
				username: entry.username,
				platform: entry.platform,
				success: true,
				animeCount: result.animeList?.length || 0,
				songCount: result.songsList?.length || 0,
				cacheInfo: result.cacheInfo
			});

			totalAnimeCount += result.animeList?.length || 0;

			// Add all songs from this user to the combined list
			if (result.songsList && result.songsList.length > 0) {
				allSongs.push(...result.songsList);
			}
		} catch (error) {
			console.error(`Error importing list for ${entry.username}:`, error);
			userResults.push({
				username: entry.username,
				platform: entry.platform,
				success: false,
				error: error.message,
				animeCount: 0,
				songCount: 0
			});
		}
	}

	// Clear progress indicator
	if (onProgress) {
		onProgress({
			currentUser: validEntries.length,
			totalUsers: validEntries.length,
			status: 'complete'
		});
	}

	// Merge metadata for duplicate songs
	const combinedSongsList = mergeSongMetadata(allSongs);

	return {
		combinedSongsList,
		userResults,
		totalAnimeCount,
		totalSongCount: combinedSongsList.length
	};
}

/**
 * Merge metadata for duplicate songs.
 * Songs with the same MAL ID and song name are considered duplicates.
 * Personal metadata (sourceAnime) is combined into arrays.
 *
 * @param {Array} songs - Array of song objects
 * @returns {Array} Songs with merged metadata for duplicates
 */
export function mergeSongMetadata(songs) {
	if (!songs || songs.length === 0) {
		return [];
	}

	// Group songs by unique identifier (MAL ID + song name)
	const songGroups = new Map();

	for (const song of songs) {
		const malId = song.malId || song.linked_ids?.myanimelist;
		const songName = song.songName || song.name || '';
		const key = `${malId}|${songName}`;

		if (!songGroups.has(key)) {
			songGroups.set(key, []);
		}
		songGroups.get(key).push(song);
	}

	// Merge duplicates
	const mergedSongs = [];

	for (const [key, groupSongs] of songGroups.entries()) {
		if (groupSongs.length === 1) {
			// No duplicates, keep as is
			mergedSongs.push(groupSongs[0]);
		} else {
			// Merge duplicate songs
			const baseSong = { ...groupSongs[0] };

			// Collect all sourceAnime data
			const sourceAnimeList = [];
			for (const song of groupSongs) {
				if (song.sourceAnime) {
					// If sourceAnime is already an array, spread it
					if (Array.isArray(song.sourceAnime)) {
						sourceAnimeList.push(...song.sourceAnime);
					} else {
						sourceAnimeList.push(song.sourceAnime);
					}
				}
			}

			// Update the base song with merged sourceAnime
			if (sourceAnimeList.length > 0) {
				baseSong.sourceAnime = sourceAnimeList;
			}

			// Add a flag to indicate this is a merged song
			baseSong.mergedFrom = groupSongs.length;

			mergedSongs.push(baseSong);
		}
	}

	return mergedSongs;
}

/**
 * Validate batch user list configuration.
 *
 * @param {Object} config - Batch user list configuration
 * @param {Array} config.userEntries - Array of user entries
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateBatchUserListConfig(config) {
	if (!config || !config.userEntries) {
		return {
			valid: false,
			error: 'User entries are required'
		};
	}

	if (!Array.isArray(config.userEntries)) {
		return {
			valid: false,
			error: 'User entries must be an array'
		};
	}

	if (config.userEntries.length === 0) {
		return {
			valid: false,
			error: 'At least one user entry is required'
		};
	}

	// Check if at least one entry has a valid username
	const validEntries = config.userEntries.filter((entry) => entry.username?.trim());

	if (validEntries.length === 0) {
		return {
			valid: false,
			error: 'At least one user entry must have a valid username'
		};
	}

	// Normalize per-user percentages to proper object format
	for (const entry of config.userEntries) {
		if (entry.songPercentage !== null && entry.songPercentage !== undefined) {
			if (typeof entry.songPercentage === 'number') {
				// Convert plain number to proper object format
				entry.songPercentage = {
					value: entry.songPercentage,
					random: false,
					min: 0,
					max: 100
				};
			} else if (typeof entry.songPercentage === 'object') {
				// Ensure object has all required properties
				if (entry.songPercentage.random === undefined) {
					entry.songPercentage.random = false;
				}
				if (entry.songPercentage.min === undefined) {
					entry.songPercentage.min = 0;
				}
				if (entry.songPercentage.max === undefined) {
					entry.songPercentage.max = 100;
				}
			}
		}
	}

	// Normalize node-level percentage to proper object format
	if (config.songPercentage !== null && config.songPercentage !== undefined) {
		if (typeof config.songPercentage === 'number') {
			// Convert plain number to proper object format
			config.songPercentage = {
				value: config.songPercentage,
				random: false,
				min: 0,
				max: 100
			};
		} else if (typeof config.songPercentage === 'object') {
			// Ensure object has all required properties
			if (config.songPercentage.random === undefined) {
				config.songPercentage.random = false;
			}
			if (config.songPercentage.min === undefined) {
				config.songPercentage.min = 0;
			}
			if (config.songPercentage.max === undefined) {
				config.songPercentage.max = 100;
			}
		}
	}

	// Validate per-user percentages (always validate if set, regardless of node-level percentage)
	const entries = [];
	let hasAnyPercentage = false;

	for (let i = 0; i < config.userEntries.length; i++) {
		const entry = config.userEntries[i];
		if (!entry.songPercentage) continue;

		hasAnyPercentage = true;
		const isRandom = entry.songPercentage.random === true;

		if (isRandom) {
			const min = entry.songPercentage.min ?? 0;
			const max = entry.songPercentage.max ?? 100;

			if (min < 0 || max > 100 || min > max) {
				return {
					valid: false,
					error: `Invalid range for user ${i + 1}: min must be <= max, and both must be 0-100`
				};
			}

			entries.push({ min, max, isRange: true });
		} else {
			const value = entry.songPercentage.value;
			if (value !== null && value !== undefined) {
				if (value < 0 || value > 100) {
					return {
						valid: false,
						error: `Invalid percentage for user ${i + 1}: must be 0-100`
					};
				}
				entries.push({ value, isRange: false });
			}
		}
	}

	// If any per-user percentage is set, validate they sum to 100% within this node
	if (hasAnyPercentage) {
		const staticSum = entries.filter((e) => !e.isRange).reduce((sum, e) => sum + e.value, 0);
		const rangeMins = entries.filter((e) => e.isRange).map((e) => e.min);
		const rangeMaxs = entries.filter((e) => e.isRange).map((e) => e.max);
		const minSum = rangeMins.reduce((sum, min) => sum + min, 0);
		const maxSum = rangeMaxs.reduce((sum, max) => sum + max, 0);

		if (entries.every((e) => !e.isRange)) {
			// All static values - must sum to exactly 100%
			if (Math.abs(staticSum - 100) > 0.01) {
				return {
					valid: false,
					error: `Per-user percentages must sum to 100% within this node (currently ${staticSum.toFixed(1)}%)`
				};
			}
		} else if (entries.every((e) => e.isRange)) {
			// All ranges - must allow for 100%
			if (minSum > 100 || maxSum < 100) {
				return {
					valid: false,
					error: `Per-user ranges must allow for a total of 100% (min sum: ${minSum}%, max sum: ${maxSum}%)`
				};
			}
		} else {
			// Mixed static and ranges - combined must allow for 100%
			const totalMinPossible = staticSum + minSum;
			const totalMaxPossible = staticSum + maxSum;
			if (totalMinPossible > 100 || totalMaxPossible < 100) {
				return {
					valid: false,
					error: `Per-user percentages must allow for 100% (range: ${totalMinPossible.toFixed(1)}% - ${totalMaxPossible.toFixed(1)}%)`
				};
			}
		}
	}

	return {
		valid: true,
		error: null
	};
}
