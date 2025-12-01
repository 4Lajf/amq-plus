/**
 * Configuration for all setting types in the node editor.
 * Defines form field types, labels, sizes, and constraints for each setting.
 * Used by the NodeEditDialog to render appropriate form controls.
 *
 * @module settingsConfig
 */

/**
 * Setting configuration object.
 * @typedef {Object} SettingConfig
 * @property {string} type - Form field type (select, number, checkboxes, complex-*, etc.)
 * @property {string} label - Display label for the setting
 * @property {'small' | 'medium' | 'large'} size - Form field size
 * @property {number} [min] - Minimum value (for number types)
 * @property {number} [max] - Maximum value (for number types)
 * @property {boolean} [allowRandom] - Whether random values are allowed
 * @property {Array<{value: *, label: string}> | Array<{key: string, label: string, default: boolean}>} [options] - Options for select types or checkboxes
 */

/**
 * Configuration map for all available settings.
 * Keys are setting IDs, values are SettingConfig objects.
 * @type {Object.<string, SettingConfig>}
 */
export const settingConfigs = {
	'sample-point': {
		type: 'sample-point-with-static',
		label: 'Sample Point (%)',
		size: 'large',
		min: 0,
		max: 100
	},
	'songs-and-types': {
		type: 'complex-songs-and-types',
		label: 'Songs & Types Selection',
		size: 'large'
	},

	'anime-type': {
		type: 'complex-anime-type',
		label: 'Anime Types',
		size: 'large'
	},
	'song-difficulty': {
		type: 'complex-song-difficulty',
		label: 'Song Difficulty',
		size: 'large'
	},
	'player-score': {
		type: 'complex-score-range',
		label: 'Player Score',
		size: 'large',
		min: 1,
		max: 10
	},
	'anime-score': {
		type: 'complex-score-range',
		label: 'Anime Score',
		size: 'large',
		min: 2,
		max: 10
	},
	vintage: {
		type: 'complex-vintage',
		label: 'Vintage',
		size: 'large'
	},
	'song-categories': {
		type: 'complex-song-categories',
		label: 'Song Categories',
		size: 'large'
	},
	genres: {
		type: 'complex-genres-tags',
		label: 'Genres',
		size: 'large'
	},
	tags: {
		type: 'complex-genres-tags',
		label: 'Tags',
		size: 'large'
	},
	'song-list': {
		type: 'complex-song-list',
		label: 'Song List',
		size: 'large'
	},
	'source-selector': {
		type: 'complex-source-selector',
		label: 'Source Selector',
		size: 'medium'
	}
};
