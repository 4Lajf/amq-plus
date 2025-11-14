/**
 * Default node settings configurations for AMQ+ Editor.
 * This file contains all the default values and settings for each node type.
 *
 * @module defaultNodeSettings
 */

import { getCurrentSeason, getCurrentYear } from './dateUtils.js';

/**
 * Route configuration for Router node.
 * @typedef {Object} Route
 * @property {string} id - Unique route identifier
 * @property {string} name - Display name for the route
 * @property {number} percentage - Weight/percentage for this route
 * @property {boolean} enabled - Whether this route is enabled
 */

/**
 * Router settings configuration.
 * @typedef {Object} RouterSettings
 * @property {Route[]} routes - Available routes
 * @property {'random' | 'weighted'} selectionMode - Route selection algorithm
 */

/**
 * Range-based value configuration (e.g., for guess time).
 * @typedef {Object} RangeValue
 * @property {boolean} useRange - Whether to use a range or static value
 * @property {number} staticValue - Static value when useRange is false
 * @property {number} min - Minimum value in range
 * @property {number} max - Maximum value in range
 */

/**
 * Sample point configuration.
 * @typedef {Object} SamplePointValue
 * @property {boolean} useRange - Whether to use start/end range
 * @property {number} start - Start percentage (0-100)
 * @property {number} end - End percentage (0-100)
 * @property {number} staticValue - Static value when not using range
 */

/**
 * Playback speed configuration.
 * @typedef {Object} PlaybackSpeedValue
 * @property {'static' | 'random'} mode - Speed selection mode
 * @property {number} staticValue - Static speed value
 * @property {number[]} randomValues - Array of possible random values
 */

/**
 * Basic setting field configuration.
 * @typedef {Object} BasicSettingField
 * @property {*} value - The setting value (varies by type)
 * @property {string} label - Display label
 * @property {'range' | 'complex' | 'boolean'} type - Field type
 * @property {number} [min] - Minimum value (for range type)
 * @property {number} [max] - Maximum value (for range type)
 */

/**
 * Basic Settings configuration.
 * @typedef {Object} BasicSettings
 * @property {BasicSettingField} guessTime - Guess time configuration
 * @property {BasicSettingField} extraGuessTime - Extra guess time configuration
 * @property {BasicSettingField} samplePoint - Sample point configuration
 * @property {BasicSettingField} playbackSpeed - Playback speed configuration
 * @property {BasicSettingField} duplicateShows - Duplicate shows toggle
 */

/**
 * Song type configuration (for openings/endings/inserts).
 * @typedef {Object} SongTypeConfig
 * @property {boolean} enabled - Whether this type is enabled
 * @property {number} count - Song count
 * @property {number} percentage - Percentage allocation
 * @property {boolean} random - Whether to use random range
 * @property {number} percentageMin - Minimum percentage
 * @property {number} percentageMax - Maximum percentage
 * @property {number} countMin - Minimum count
 * @property {number} countMax - Maximum count
 */

/**
 * Song selection configuration (for random/watched).
 * @typedef {Object} SongSelectionConfig
 * @property {boolean} enabled - Whether this selection is enabled
 * @property {number} count - Song count
 * @property {number} percentage - Percentage allocation
 * @property {boolean} random - Whether to use random range
 * @property {number} percentageMin - Minimum percentage
 * @property {number} percentageMax - Maximum percentage
 * @property {number} countMin - Minimum count
 * @property {number} countMax - Maximum count
 */

/**
 * Songs and types filter settings.
 * @typedef {Object} SongsAndTypesSettings
 * @property {'count' | 'percentage'} mode - Allocation mode
 * @property {{value: number, random: boolean, min: number, max: number}} songCount - Total song count
 * @property {Object} songTypes - Song type distribution
 * @property {SongTypeConfig} songTypes.openings - Opening songs
 * @property {SongTypeConfig} songTypes.endings - Ending songs
 * @property {SongTypeConfig} songTypes.inserts - Insert songs
 * @property {Object} songSelection - Song selection criteria
 * @property {SongSelectionConfig} songSelection.random - Random selection
 * @property {SongSelectionConfig} songSelection.watched - Watched selection
 */

/**
 * Vintage (year/season) configuration.
 * @typedef {Object} VintageConfig
 * @property {string} season - Season name ('Winter', 'Spring', 'Summer', 'Fall')
 * @property {number} year - Year number
 */

/**
 * Vintage range configuration.
 * @typedef {Object} VintageRangeConfig
 * @property {VintageConfig} from - Start vintage
 * @property {VintageConfig} to - End vintage
 * @property {number} percentage - Percentage allocation
 * @property {number} count - Song count
 * @property {boolean} useAdvanced - Whether to use advanced settings
 */

/**
 * Vintage filter settings.
 * @typedef {Object} VintageSettings
 * @property {VintageRangeConfig[]} ranges - Year/season ranges
 * @property {'percentage' | 'count'} mode - Allocation mode
 */

/**
 * Difficulty configuration for song difficulty filter.
 * @typedef {Object} DifficultyConfig
 * @property {boolean} enabled - Whether this difficulty is enabled
 * @property {number} countValue - Count value
 * @property {number} percentageValue - Percentage value
 * @property {boolean} randomRange - Whether to use random range
 * @property {number} minCount - Minimum count
 * @property {number} maxCount - Maximum count
 * @property {number} minPercentage - Minimum percentage
 * @property {number} maxPercentage - Maximum percentage
 */

/**
 * Song difficulty filter settings.
 * @typedef {Object} SongDifficultySettings
 * @property {'basic' | 'advanced'} viewMode - View mode
 * @property {'percentage' | 'count'} mode - Allocation mode
 * @property {DifficultyConfig} easy - Easy difficulty
 * @property {DifficultyConfig} medium - Medium difficulty
 * @property {DifficultyConfig} hard - Hard difficulty
 * @property {Array<{min: number, max: number, percentage: number, count: number}>} ranges - Custom difficulty ranges
 */

/**
 * Score range filter settings (used for player score and anime score).
 * @typedef {Object} ScoreRangeSettings
 * @property {number} min - Minimum score
 * @property {number} max - Maximum score
 * @property {'range' | 'percentage'} mode - Selection mode
 * @property {'count' | 'percentage'} perScoreMode - Per-score allocation mode
 * @property {Object.<string, number>} percentages - Score-specific percentages
 * @property {number[]} disallowed - Disallowed scores
 */

/**
 * Anime type configuration for advanced mode.
 * @typedef {Object} AnimeTypeItemConfig
 * @property {boolean} enabled - Whether this type is enabled
 * @property {boolean} random - Whether to use random range
 * @property {number} min - Minimum percentage
 * @property {number} max - Maximum percentage
 * @property {number} percentageValue - Percentage value
 * @property {number} percentageMin - Minimum percentage
 * @property {number} percentageMax - Maximum percentage
 * @property {number} countValue - Count value
 * @property {number} countMin - Minimum count
 * @property {number} countMax - Maximum count
 */

/**
 * Anime type filter settings.
 * @typedef {Object} AnimeTypeSettings
 * @property {boolean} tv - Include TV shows (simple mode)
 * @property {boolean} movie - Include movies (simple mode)
 * @property {boolean} ova - Include OVAs (simple mode)
 * @property {boolean} ona - Include ONAs (simple mode)
 * @property {boolean} special - Include specials (simple mode)
 * @property {boolean} rebroadcast - Include rebroadcasts
 * @property {boolean} dubbed - Include dubbed anime
 * @property {'simple' | 'advanced'} viewMode - View mode
 * @property {'percentage' | 'count'} mode - Allocation mode (advanced)
 * @property {Object} advanced - Advanced mode settings
 * @property {AnimeTypeItemConfig} advanced.tv - TV configuration
 * @property {AnimeTypeItemConfig} advanced.movie - Movie configuration
 * @property {AnimeTypeItemConfig} advanced.ova - OVA configuration
 * @property {AnimeTypeItemConfig} advanced.ona - ONA configuration
 * @property {AnimeTypeItemConfig} advanced.special - Special configuration
 */

/**
 * Song category item configuration.
 * @typedef {Object} SongCategoryItemConfig
 * @property {boolean} enabled - Whether this category is enabled
 * @property {boolean} random - Whether to use random range
 * @property {number} min - Minimum percentage
 * @property {number} max - Maximum percentage
 * @property {number} percentageValue - Percentage value
 * @property {number} percentageMin - Minimum percentage
 * @property {number} percentageMax - Maximum percentage
 * @property {number} countValue - Count value
 * @property {number} countMin - Minimum count
 * @property {number} countMax - Maximum count
 */

/**
 * Song categories filter settings.
 * @typedef {Object} SongCategoriesSettings
 * @property {Object} openings - Opening song categories (simple mode)
 * @property {boolean} openings.standard - Include standard songs
 * @property {boolean} openings.instrumental - Include instrumental songs
 * @property {boolean} openings.chanting - Include chanting songs
 * @property {boolean} openings.character - Include character songs
 * @property {Object} endings - Ending song categories (simple mode)
 * @property {boolean} endings.standard - Include standard songs
 * @property {boolean} endings.instrumental - Include instrumental songs
 * @property {boolean} endings.chanting - Include chanting songs
 * @property {boolean} endings.character - Include character songs
 * @property {Object} inserts - Insert song categories (simple mode)
 * @property {boolean} inserts.standard - Include standard songs
 * @property {boolean} inserts.instrumental - Include instrumental songs
 * @property {boolean} inserts.chanting - Include chanting songs
 * @property {boolean} inserts.character - Include character songs
 * @property {'simple' | 'advanced'} viewMode - View mode
 * @property {'percentage' | 'count'} mode - Allocation mode
 * @property {Object} advanced - Advanced mode settings
 * @property {Object} advanced.openings - Opening categories configuration
 * @property {SongCategoryItemConfig} advanced.openings.standard - Standard configuration
 * @property {SongCategoryItemConfig} advanced.openings.instrumental - Instrumental configuration
 * @property {SongCategoryItemConfig} advanced.openings.chanting - Chanting configuration
 * @property {SongCategoryItemConfig} advanced.openings.character - Character configuration
 * @property {Object} advanced.endings - Ending categories configuration
 * @property {SongCategoryItemConfig} advanced.endings.standard - Standard configuration
 * @property {SongCategoryItemConfig} advanced.endings.instrumental - Instrumental configuration
 * @property {SongCategoryItemConfig} advanced.endings.chanting - Chanting configuration
 * @property {SongCategoryItemConfig} advanced.endings.character - Character configuration
 * @property {Object} advanced.inserts - Insert categories configuration
 * @property {SongCategoryItemConfig} advanced.inserts.standard - Standard configuration
 * @property {SongCategoryItemConfig} advanced.inserts.instrumental - Instrumental configuration
 * @property {SongCategoryItemConfig} advanced.inserts.chanting - Chanting configuration
 * @property {SongCategoryItemConfig} advanced.inserts.character - Character configuration
 */

/**
 * Genres/Tags filter settings (basic mode).
 * @typedef {Object} GenresTagsSettings
 * @property {'basic' | 'advanced'} viewMode - View mode
 * @property {'percentage' | 'count'} mode - Allocation mode (advanced)
 * @property {string[]} included - Included items (basic mode)
 * @property {string[]} excluded - Excluded items (basic mode)
 * @property {string[]} optional - Optional items (basic mode)
 * @property {Object.<string, {enabled: boolean, percentageValue: number, countValue: number}>} advanced - Advanced mode settings
 */

/**
 * Selection modifier settings.
 * @typedef {Object} SelectionModifierSettings
 * @property {number} minSelection - Minimum selections
 * @property {number} maxSelection - Maximum selections
 */

/**
 * Number of songs settings.
 * @typedef {Object} NumberOfSongsSettings
 * @property {boolean} useRange - Whether to use a range
 * @property {number} staticValue - Static song count
 * @property {number} min - Minimum count (if range)
 * @property {number} max - Maximum count (if range)
 */

/**
 * User list import selected lists configuration.
 * @typedef {Object} SelectedListsConfig
 * @property {boolean} completed - Include completed anime
 * @property {boolean} watching - Include watching anime
 * @property {boolean} planning - Include planning anime
 * @property {boolean} on_hold - Include on-hold anime
 * @property {boolean} dropped - Include dropped anime
 */

/**
 * User list import configuration.
 * @typedef {Object} UserListImportConfig
 * @property {'anilist' | 'mal'} platform - Platform to import from
 * @property {string} username - Username to import
 * @property {SelectedListsConfig} selectedLists - List types to import
 */

/**
 * Provider import configuration.
 * @typedef {Object} ProviderImportConfig
 * @property {'amq-export' | 'joseph-song-ui' | 'blissfullyoshi-ranked' | 'kempanator-answer-stats'} providerType - Provider type
 * @property {*} fileData - Raw file data
 * @property {*} processedData - Processed song data
 */

/** @typedef {import('../../../../../types/types.js').SongPercentageConfig} SongPercentageConfig */

/**
 * Song List node settings.
 * @typedef {Object} SongListSettings
 * @property {'masterlist' | 'user-lists' | 'saved-lists' | 'provider'} mode - Song source mode
 * @property {boolean} useEntirePool - If true, bypass all filters for this list's songs
 * @property {UserListImportConfig} userListImport - User list import configuration (for user-lists mode)
 * @property {string|null} selectedListId - Selected list ID (for saved-lists mode, exactly one)
 * @property {string|null} selectedListName - Name of the selected list (for display)
 * @property {ProviderImportConfig} providerImport - Provider import configuration (for provider mode)
 * @property {SongPercentageConfig|null} songPercentage - Song percentage configuration (null = not using percentages)
 */

/**
 * Batch user list entry configuration.
 * @typedef {Object} BatchUserListEntry
 * @property {string} id - Unique identifier for this user entry
 * @property {'anilist' | 'mal'} platform - Platform to import from
 * @property {string} username - Username to import
 * @property {SelectedListsConfig} selectedLists - List types to import
 * @property {SongPercentageConfig|null} songPercentage - Song percentage configuration (null = not using percentages)
 */

/**
 * Batch User List node settings.
 * @typedef {Object} BatchUserListSettings
 * @property {'manual' | 'live'} [mode] - Mode: 'manual' (configure here) or 'live' (sync from AMQ)
 * @property {boolean} useEntirePool - If true, bypass all filters for this list's songs
 * @property {BatchUserListEntry[]} userEntries - Array of user import configurations
 * @property {SongPercentageConfig|null} [songPercentage] - Node-level percentage (applies to all users combined, null = not using node-level percentage)
 * @property {'default' | 'many-lists' | 'few-lists'} [songSelectionMode] - How to prioritize songs during selection (default: 'default')
 */

/**
 * Default settings for Router node.
 * Controls route selection and weighting.
 * @type {RouterSettings}
 */
export const ROUTER_DEFAULT_SETTINGS = {
	routes: [{ id: 'route-1', name: 'Route 1', percentage: 100, enabled: true }],
	selectionMode: 'random' // 'random' or 'weighted'
};

/**
 * Default settings for Basic Settings node.
 * Contains all core AMQ lobby configuration options.
 * @type {BasicSettings}
 */
export const BASIC_SETTINGS_DEFAULT_SETTINGS = {
	guessTime: {
		value: { useRange: false, staticValue: 20, min: 15, max: 25 },
		label: 'Guess Time',
		type: 'range',
		min: 1,
		max: 60
	},
	extraGuessTime: {
		value: { useRange: false, staticValue: 0, min: 5, max: 15 },
		label: 'Extra Guess Time',
		type: 'range',
		min: 0,
		max: 15
	},

	samplePoint: {
		value: { useRange: true, start: 0, end: 100, staticValue: 20 },
		label: 'Sample Point',
		type: 'complex'
	},
	playbackSpeed: {
		value: { mode: 'static', staticValue: 1.0, randomValues: [1.0] },
		label: 'Playback Speed',
		type: 'complex'
	},
	duplicateShows: {
		value: true,
		label: 'Duplicate Shows',
		type: 'boolean'
	}
};

/**
 * Default settings for Songs & Types filter node.
 * Controls song type distribution (openings/endings/inserts) and selection criteria.
 * @type {SongsAndTypesSettings}
 */
export const SONGS_AND_TYPES_DEFAULT_SETTINGS = {
	mode: 'count',
	songCount: {
		value: 20,
		random: false,
		min: 15,
		max: 25
	},
	songTypes: {
		openings: {
			enabled: true,
			count: 10,
			percentage: 50,
			random: true,
			percentageMin: 40,
			percentageMax: 60,
			countMin: 0,
			countMax: 20
		},
		endings: {
			enabled: true,
			count: 10,
			percentage: 50,
			random: true,
			percentageMin: 40,
			percentageMax: 60,
			countMin: 0,
			countMax: 20
		},
		inserts: {
			enabled: false,
			count: 0,
			percentage: 0,
			random: false,
			percentageMin: 0,
			percentageMax: 10,
			countMin: 0,
			countMax: 5
		}
	},
	songSelection: {
		random: {
			enabled: true,
			count: 0,
			percentage: 0,
			random: false,
			percentageMin: 25,
			percentageMax: 75,
			countMin: 5,
			countMax: 15
		},
		watched: {
			enabled: true,
			count: 20,
			percentage: 50,
			random: false,
			percentageMin: 25,
			percentageMax: 75,
			countMin: 5,
			countMax: 15
		}
	}
};

/**
 * Default settings for Vintage filter node.
 * Filters songs by anime release year and season.
 * @type {VintageSettings}
 */
export const VINTAGE_DEFAULT_SETTINGS = {
	ranges: [
		{
			from: { season: 'Winter', year: 1944 },
			to: { season: getCurrentSeason(), year: getCurrentYear() },
			percentage: 100,
			count: 20,
			useAdvanced: false
		}
	],
	mode: 'percentage'
};

/**
 * Default settings for Song Difficulty filter node.
 * Filters songs by difficulty rating (easy/medium/hard or custom ranges).
 * @type {SongDifficultySettings}
 */
export const SONG_DIFFICULTY_DEFAULT_SETTINGS = {
	viewMode: 'basic',
	mode: 'count', // 'percentage' | 'count'
	easy: {
		enabled: true,
		countValue: 5,
		percentageValue: 25,
		randomRange: true,
		minCount: 0,
		maxCount: 20,
		minPercentage: 25,
		maxPercentage: 40
	},
	medium: {
		enabled: true,
		countValue: 10,
		percentageValue: 50,
		randomRange: true,
		minCount: 0,
		maxCount: 20,
		minPercentage: 25,
		maxPercentage: 40
	},
	hard: {
		enabled: true,
		countValue: 5,
		percentageValue: 25,
		randomRange: true,
		minCount: 0,
		maxCount: 20,
		minPercentage: 25,
		maxPercentage: 40
	},
	ranges: []
};

/**
 * Default settings for Player Score filter node.
 * Filters songs by player score requirements.
 * @type {ScoreRangeSettings}
 */
export const PLAYER_SCORE_DEFAULT_SETTINGS = {
	min: 1,
	max: 10,
	mode: 'range',
	perScoreMode: 'count',
	percentages: {},
	disallowed: []
};

/**
 * Default settings for Anime Score filter node.
 * Filters songs by anime rating/score.
 * @type {ScoreRangeSettings}
 */
export const ANIME_SCORE_DEFAULT_SETTINGS = {
	min: 2,
	max: 10,
	mode: 'range',
	perScoreMode: 'count',
	percentages: {},
	disallowed: []
};

/**
 * Default settings for Anime Type filter node.
 * Filters songs by anime format (TV, Movie, OVA, etc.).
 * @type {AnimeTypeSettings}
 */
export const ANIME_TYPE_DEFAULT_SETTINGS = {
	tv: true,
	movie: true,
	ova: true,
	ona: true,
	special: true,
	rebroadcast: false,
	dubbed: false,
	viewMode: 'simple', // 'simple' | 'advanced'
	mode: 'count', // 'percentage' | 'count'
	advanced: {
		tv: {
			enabled: true,
			random: false,
			min: 10,
			max: 40,
			percentageValue: 20,
			percentageMin: 10,
			percentageMax: 40,
			countValue: 4,
			countMin: 2,
			countMax: 10
		},
		movie: {
			enabled: true,
			random: false,
			min: 10,
			max: 40,
			percentageValue: 20,
			percentageMin: 10,
			percentageMax: 40,
			countValue: 4,
			countMin: 2,
			countMax: 10
		},
		ova: {
			enabled: true,
			random: false,
			min: 10,
			max: 40,
			percentageValue: 20,
			percentageMin: 10,
			percentageMax: 40,
			countValue: 4,
			countMin: 2,
			countMax: 10
		},
		ona: {
			enabled: true,
			random: false,
			min: 10,
			max: 40,
			percentageValue: 20,
			percentageMin: 10,
			percentageMax: 40,
			countValue: 4,
			countMin: 2,
			countMax: 10
		},
		special: {
			enabled: true,
			random: false,
			min: 10,
			max: 40,
			percentageValue: 20,
			percentageMin: 10,
			percentageMax: 40,
			countValue: 4,
			countMin: 2,
			countMax: 10
		}
	}
};

/**
 * Default settings for Song Categories filter node.
 * Filters by song categories (Standard, Instrumental, Chanting, Character).
 * @type {SongCategoriesSettings}
 */
export const SONG_CATEGORIES_DEFAULT_SETTINGS = {
	openings: { standard: true, instrumental: true, chanting: true, character: true },
	endings: { standard: true, instrumental: true, chanting: true, character: true },
	inserts: { standard: true, instrumental: true, chanting: true, character: true },
	viewMode: 'simple', // 'simple' | 'advanced'
	mode: 'count', // 'percentage' | 'count'
	advanced: {
		openings: {
			standard: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 9,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 2,
				countMin: 1,
				countMax: 4
			},
			instrumental: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 9,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 2,
				countMin: 1,
				countMax: 4
			},
			chanting: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 9,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 2,
				countMin: 1,
				countMax: 4
			},
			character: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 9,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 2,
				countMin: 1,
				countMax: 4
			}
		},
		endings: {
			standard: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 8,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 2,
				countMin: 1,
				countMax: 4
			},
			instrumental: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 8,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 2,
				countMin: 1,
				countMax: 4
			},
			chanting: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 8,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 2,
				countMin: 1,
				countMax: 4
			},
			character: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 8,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 2,
				countMin: 1,
				countMax: 4
			}
		},
		inserts: {
			standard: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 8,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 1,
				countMin: 1,
				countMax: 4
			},
			instrumental: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 8,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 1,
				countMin: 1,
				countMax: 4
			},
			chanting: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 8,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 1,
				countMin: 1,
				countMax: 4
			},
			character: {
				enabled: true,
				random: false,
				min: 5,
				max: 20,
				percentageValue: 8,
				percentageMin: 5,
				percentageMax: 20,
				countValue: 1,
				countMin: 1,
				countMax: 4
			}
		}
	}
};

/**
 * Default settings for Genres filter node.
 * Filters songs by anime genres with include/exclude/optional logic.
 * @type {GenresTagsSettings}
 */
export const GENRES_DEFAULT_SETTINGS = {
	viewMode: 'basic', // 'basic' | 'advanced'
	mode: 'count', // for advanced: 'percentage' | 'count'
	included: [], // list of genre strings
	excluded: [], // list of genre strings
	optional: [], // list of genre strings
	advanced: {
		// genreKey: { enabled: true, percentageValue: 0, countValue: 0 }
	}
};

/**
 * Default settings for Tags filter node.
 * Filters songs by anime tags with include/exclude/optional logic.
 * @type {GenresTagsSettings}
 */
export const TAGS_DEFAULT_SETTINGS = {
	viewMode: 'basic',
	mode: 'count',
	included: [],
	excluded: [],
	optional: [],
	advanced: {
		// tagKey: { enabled: true, percentageValue: 0, countValue: 0 }
	}
};

/**
 * Default settings for Selection Modifier node.
 * Limits how many instances of a node type are considered during export.
 * @type {SelectionModifierSettings}
 */
export const SELECTION_MODIFIER_DEFAULT_SETTINGS = {
	minSelection: 1,
	maxSelection: 1
};

/**
 * Default settings for Number of Songs node.
 * Determines the final song count for the lobby.
 * @type {NumberOfSongsSettings}
 */
export const NUMBER_OF_SONGS_DEFAULT_SETTINGS = {
	useRange: false,
	staticValue: 20,
	min: 15,
	max: 25
};

/**
 * Default settings for Song List node.
 * Controls base song pool selection (entire database, user lists, public lists, or provider imports).
 * @type {SongListSettings}
 */
export const SONG_LIST_DEFAULT_SETTINGS = {
	mode: 'masterlist', // 'masterlist' | 'user-lists' | 'saved-lists' | 'provider'
	useEntirePool: false, // Bypass all filters

	// For user-lists mode
	userListImport: {
		platform: 'anilist', // 'anilist' | 'mal'
		username: '',
		selectedLists: {
			completed: true,
			watching: true,
			planning: false,
			on_hold: false,
			dropped: false
		}
	},

	// For saved-lists mode
	selectedListId: null, // Single list ID (exactly one)
	selectedListName: null, // Name of the selected list (for display)

	// For provider mode
	providerImport: {
		providerType: 'amq-export', // 'amq-export' | 'joseph-song-ui' | 'blissfullyoshi-ranked' | 'kempanator-answer-stats'
		fileData: null,
		processedData: null
	},

	// Song percentage limit (null = not using percentages, or object with value/random/min/max)
	songPercentage: null
};

/**
 * Default settings for Batch User List node (now unified with Live Node).
 * Allows importing anime lists from multiple users simultaneously.
 * Can work in 'manual' mode (configure here) or 'live' mode (sync from AMQ).
 */
/** @type {BatchUserListSettings} */
export const BATCH_USER_LIST_DEFAULT_SETTINGS = {
	mode: 'manual', // 'manual' | 'live' - determines if users are configured here or synced from AMQ
	useEntirePool: false, // Bypass all filters
	songPercentage: null, // Node-level percentage (applies to all users combined, null = not using node-level percentage)
	songSelectionMode: /** @type {'default' | 'many-lists' | 'few-lists'} */ ('default'), // How to prioritize songs during selection
	userEntries: [
		{
			id: 'user-1',
			platform: 'anilist', // 'anilist' | 'mal'
			username: '',
			selectedLists: {
				completed: true,
				watching: true,
				planning: false,
				on_hold: false,
				dropped: false
			},
			songPercentage: null // Per-user percentage (null = not using per-user percentages)
		}
	]
};

/**
 * Live Node user entry configuration (configured from AMQ side).
 * @typedef {Object} LiveNodeEntry
 * @property {string} id - Unique identifier for this user entry
 * @property {'anilist' | 'mal' | 'kitsu'} platform - Platform to import from
 * @property {string} username - Username to import
 * @property {Object} selectedLists - List types to import
 * @property {boolean} selectedLists.completed - Include completed anime
 * @property {boolean} selectedLists.watching - Include watching anime
 * @property {boolean} selectedLists.planning - Include planning anime
 * @property {boolean} selectedLists.on_hold - Include on-hold anime
 * @property {boolean} selectedLists.dropped - Include dropped anime
 * @property {Object|null} [songPercentage] - Percentage of songs to pick from this user's list (null = not using percentages)
 * @property {number} [songPercentage.value] - Static percentage value (0-100)
 * @property {boolean} [songPercentage.random] - Whether to use random range
 * @property {number} [songPercentage.min] - Minimum percentage (for random range)
 * @property {number} [songPercentage.max] - Maximum percentage (for random range)
 */

/**
 * Live Node settings configuration.
 * Configured from AMQ side, gathers lists from players in the room.
 * @typedef {Object} LiveNodeSettings
 * @property {boolean} useEntirePool - Bypass all filters
 * @property {LiveNodeEntry[]} userEntries - User entries from lobby players
 * @property {SongPercentageConfig|null} songPercentage - Song percentage configuration (null = not using percentages)
 * @property {'default' | 'many-lists' | 'few-lists'} [songSelectionMode] - How to prioritize songs during selection (default: 'default')
 */

/** @type {LiveNodeSettings} */
export const LIVE_NODE_DEFAULT_SETTINGS = {
	useEntirePool: false, // Bypass all filters
	userEntries: [], // Will be populated from AMQ connector script
	songPercentage: null, // Percentage of songs to pick from this node (null = not using percentages)
	songSelectionMode: /** @type {'default' | 'many-lists' | 'few-lists'} */ ('default') // How to prioritize songs during selection
};

/**
 * Source Selector node settings configuration.
 * Allows targeting a specific source node for a filter.
 * @typedef {Object} SourceSelectorSettings
 * @property {string|null} targetSourceId - Instance ID of the target source node (Song List, Batch User List, or Live Node)
 */

/**
 * Default settings for Source Selector node.
 * Restricts a filter to only affect songs from a specific source node.
 * @type {SourceSelectorSettings}
 */
export const SOURCE_SELECTOR_DEFAULT_SETTINGS = {
	targetSourceId: null // Will be set to a specific source node instance ID
};

/**
 * Collection of all default settings for easy access by node type.
 * @type {Object.<string, RouterSettings | BasicSettings | SongsAndTypesSettings | VintageSettings | SongDifficultySettings | ScoreRangeSettings | AnimeTypeSettings | SongCategoriesSettings | GenresTagsSettings | SelectionModifierSettings | NumberOfSongsSettings | SongListSettings | BatchUserListSettings | LiveNodeSettings | SourceSelectorSettings>}
 */
export const DEFAULT_NODE_SETTINGS = {
	router: ROUTER_DEFAULT_SETTINGS,
	basicSettings: BASIC_SETTINGS_DEFAULT_SETTINGS,
	'songs-and-types': SONGS_AND_TYPES_DEFAULT_SETTINGS,
	vintage: VINTAGE_DEFAULT_SETTINGS,
	'song-difficulty': SONG_DIFFICULTY_DEFAULT_SETTINGS,
	'player-score': PLAYER_SCORE_DEFAULT_SETTINGS,
	'anime-score': ANIME_SCORE_DEFAULT_SETTINGS,
	'anime-type': ANIME_TYPE_DEFAULT_SETTINGS,
	'song-categories': SONG_CATEGORIES_DEFAULT_SETTINGS,
	genres: GENRES_DEFAULT_SETTINGS,
	tags: TAGS_DEFAULT_SETTINGS,
	selectionModifier: SELECTION_MODIFIER_DEFAULT_SETTINGS,
	numberOfSongs: NUMBER_OF_SONGS_DEFAULT_SETTINGS,
	'song-list': SONG_LIST_DEFAULT_SETTINGS,
	'batch-user-list': BATCH_USER_LIST_DEFAULT_SETTINGS,
	'live-node': LIVE_NODE_DEFAULT_SETTINGS,
	'source-selector': SOURCE_SELECTOR_DEFAULT_SETTINGS
};

/**
 * Retrieves default settings for a specific node type.
 *
 * @param {string} nodeType - The node type identifier
 * @returns {RouterSettings | BasicSettings | SongsAndTypesSettings | VintageSettings | SongDifficultySettings | ScoreRangeSettings | AnimeTypeSettings | SongCategoriesSettings | GenresTagsSettings | SelectionModifierSettings | NumberOfSongsSettings | SongListSettings | BatchUserListSettings | LiveNodeSettings | SourceSelectorSettings | null} Default settings object or null if not found
 */
export function getDefaultSettingsForNodeType(nodeType) {
	return DEFAULT_NODE_SETTINGS[nodeType] || null;
}

/**
 * Gets all available node types with their default settings.
 *
 * @returns {Array<{nodeType: string, defaultSettings: RouterSettings | BasicSettings | SongsAndTypesSettings | VintageSettings | SongDifficultySettings | ScoreRangeSettings | AnimeTypeSettings | SongCategoriesSettings | GenresTagsSettings | SelectionModifierSettings | NumberOfSongsSettings | SongListSettings | BatchUserListSettings | LiveNodeSettings | SourceSelectorSettings}>} Array of node types and their defaults
 */
export function getAllNodeTypesWithDefaults() {
	return Object.keys(DEFAULT_NODE_SETTINGS).map((nodeType) => ({
		nodeType,
		defaultSettings: DEFAULT_NODE_SETTINGS[nodeType]
	}));
}

/**
 * Extracts the default value from a basic setting configuration.
 * Handles the various setting structures (simple values vs complex objects).
 *
 * @param {string} settingKey - The basic setting key to retrieve
 * @returns {RangeValue | SamplePointValue | PlaybackSpeedValue | boolean | null} The default value for the setting, or null if not found
 */
export function getBasicSettingDefaultValue(settingKey) {
	const setting = BASIC_SETTINGS_DEFAULT_SETTINGS[settingKey];
	if (!setting) return null;

	// Extract the actual default value based on the setting structure
	switch (settingKey) {
		case 'guessTime':
		case 'extraGuessTime':
			return setting.value; // Returns the complex object with useRange, staticValue, etc.
		case 'samplePoint':
			return setting.value; // Returns the complex object
		case 'playbackSpeed':
			return setting.value; // Returns the complex object with mode, staticValue, etc.
		default:
			return setting.value || setting;
	}
}

/** @type {RangeValue} */
export const GUESS_TIME_DEFAULT_SETTINGS = BASIC_SETTINGS_DEFAULT_SETTINGS.guessTime.value;
/** @type {RangeValue} */
export const EXTRA_TIME_DEFAULT_SETTINGS = BASIC_SETTINGS_DEFAULT_SETTINGS.extraGuessTime.value;
/** @type {SamplePointValue} */
export const SAMPLE_POINT_DEFAULT_SETTINGS = BASIC_SETTINGS_DEFAULT_SETTINGS.samplePoint.value;
/** @type {PlaybackSpeedValue} */
export const PLAYBACK_SPEED_DEFAULT_SETTINGS = BASIC_SETTINGS_DEFAULT_SETTINGS.playbackSpeed.value;

/** @type {'random'} */
export const WATCHED_DISTRIBUTION_DEFAULT_SETTINGS = 'random';
