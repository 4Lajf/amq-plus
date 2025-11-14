/**
 * Centralized type definitions for the AMQ+ application
 * All types defined here can be referenced in JSDoc comments
 * 
 * @module types
 */

/**
 * Quiz configuration object from the database
 * @typedef {Object} Quiz
 * @property {string} id
 * @property {string} name
 * @property {string|null} description
 * @property {boolean} is_public
 * @property {boolean} allow_remixing
 * @property {string} creator_username
 * @property {string} created_at - ISO timestamp of creation
 * @property {string} [updated_at] - ISO timestamp of last update
 * @property {string} [play_token] - Token for playing the quiz
 * @property {number} [likes] - Number of likes
 * @property {number} [plays] - Number of plays
 * @property {QuizMetadata} [quiz_metadata]
 * @property {QuizConfigurationData} [configuration_data]
 */

/**
 * Quiz metadata containing useful information about the quiz
 * @typedef {Object} QuizMetadata
 * @property {{min: number, max: number}} estimatedSongs - Estimated song count range
 * @property {string|null} difficulty
 * @property {string|null} songTypes
 * @property {string|null} songSelection
 * @property {Array} [sourceNodes]
 */

/**
 * Quiz configuration data structure
 * @typedef {Object} QuizConfigurationData
 * @property {Array} nodes - Array of node objects
 * @property {Array} edges - Array of edge objects
 * @property {Object} [basicSettings]
 * @property {number} [numberOfSongs]
 * @property {Object} [router] - Router configuration
 * @property {string} [seed] - Random seed
 * @property {string} [timestamp]
 */

/**
 * User session object
 * @typedef {Object} Session
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number} expires_in - Expiration time in seconds
 * @property {string} token_type - Token type (usually 'bearer')
 * @property {User} user
 */

/**
 * User object
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} [username]
 * @property {Object} [user_metadata]
 * @property {Object} [app_metadata]
 */

/**
 * Pagination information
 * @typedef {Object} Pagination
 * @property {number} page - Current page number (1-based)
 * @property {number} totalPages
 * @property {number} totalItems
 * @property {number} limit - Items per page
 */

/**
 * Quiz filters
 * @typedef {Object} QuizFilters
 * @property {string} [search] - General search query
 * @property {string} [name] - Name filter
 * @property {string} [description] - Description filter
 * @property {string} [creator] - Creator filter
 * @property {string} [dateFrom] - Start date filter (ISO string)
 * @property {string} [dateTo] - End date filter (ISO string)
 * @property {boolean} [myQuizzes] - Whether to show only user's quizzes
 * @property {string} [sortBy] - Sort order (newest, trending, mostLiked, mostPlayed)
 */

/**
 * CalendarDate object from @internationalized/date
 * @typedef {Object} CalendarDate
 * @property {number} year
 * @property {number} month - Month (1-12)
 * @property {number} day
 */

/**
 * Local quiz stored in browser localStorage
 * @typedef {Object} LocalQuiz
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {QuizConfigurationData} configuration_data
 * @property {string} creator_username
 * @property {string} share_token - Share token for editing
 * @property {string} play_token - Play token for playing
 * @property {number} created_at - Timestamp of creation
 * @property {number} updated_at - Timestamp of last update
 * @property {string} [database_id] - Database ID if quiz is stored in database
 * @property {boolean} [is_temporary] - Whether this is a temporary quiz
 * @property {boolean} [is_public] - Whether this quiz is public
 */

/**
 * Quiz data for creating a local quiz
 * @typedef {Object} CreateLocalQuizData
 * @property {string} name
 * @property {string} [description]
 * @property {QuizConfigurationData} configuration_data
 * @property {string} creator_username
 */

/**
 * Quiz data from database for syncing
 * @typedef {Object} DatabaseQuizData
 * @property {string} id - Database quiz ID
 * @property {string} name
 * @property {string} [description]
 * @property {QuizConfigurationData} configuration_data
 * @property {string} creator_username
 * @property {string} share_token
 * @property {string} play_token
 */

/**
 * Partial quiz data for updates
 * @typedef {Partial<Pick<LocalQuiz, 'name' | 'description' | 'configuration_data'>>} LocalQuizUpdates
 */

/**
 * Display value with kind discriminator
 * @typedef {Object} DisplayValue
 * @property {'static'|'range'|'random'} kind - Kind of display value
 * @property {number} [value] - Static value (for kind='static')
 * @property {number} [min] - Minimum value (for kind='range')
 * @property {number} [max] - Maximum value (for kind='range')
 * @property {Array} [values] - Array of values (for kind='random')
 */

/**
 * Song percentage configuration
 * @typedef {Object} SongPercentageConfig
 * @property {number} [value] - Static percentage value
 * @property {boolean} [random] - Whether to use random range
 * @property {number} [min] - Minimum percentage (for random)
 * @property {number} [max] - Maximum percentage (for random)
 */

/**
 * Conflict resolution configuration
 * @typedef {Object} ConflictResolutionConfig
 * @property {Object<string, string>} [strategies] - Map of field paths to resolution strategies ('first', 'last', 'merge', etc.)
 * @property {string} [defaultStrategy] - Default resolution strategy
 */

/**
 * Route object
 * @typedef {Object} Route
 * @property {string} id
 * @property {string} name - Route display name
 * @property {number} percentage - Route percentage (0-100)
 * @property {boolean} enabled - Whether route is active
 */

/**
 * Node instance wrapper - nodes in simulation have this structure
 * @typedef {Object} NodeInstanceWrapper
 * @property {string} id
 * @property {import('../lib/components/amqplus/editor/utils/nodeDefinitions.js').BaseNodeData | import('../lib/components/amqplus/editor/utils/nodeDefinitions.js').RouterNodeData | import('../lib/components/amqplus/editor/utils/nodeDefinitions.js').BasicSettingsNodeData | import('../lib/components/amqplus/editor/utils/nodeDefinitions.js').FilterNodeData | import('../lib/components/amqplus/editor/utils/nodeDefinitions.js').NumberOfSongsNodeData | import('../lib/components/amqplus/editor/utils/nodeDefinitions.js').SongListNodeData} data
 */

/**
 * Anime metadata from AniList API.
 * @typedef {Object} AniListAnime
 * @property {number} id - AniList ID
 * @property {number} idMal - MyAnimeList ID
 * @property {{romaji: string, english: string|null, native: string, userPreferred: string}} title - Anime titles
 * @property {'TV'|'TV_SHORT'|'MOVIE'|'SPECIAL'|'OVA'|'ONA'|'MUSIC'} format - Anime format
 * @property {'FINISHED'|'RELEASING'|'NOT_YET_RELEASED'|'CANCELLED'} status - Airing status
 * @property {{year: number|null, month: number|null, day: number|null}} startDate - Start date
 * @property {{year: number|null, month: number|null, day: number|null}} endDate - End date
 * @property {'WINTER'|'SPRING'|'SUMMER'|'FALL'|null} season - Release season
 * @property {number|null} seasonYear - Release year
 * @property {number|null} episodes - Episode count
 * @property {number|null} duration - Episode duration in minutes
 * @property {string|null} source - Source material type
 * @property {{extraLarge: string, large: string, medium: string, color: string|null}} coverImage - Cover images
 * @property {string|null} bannerImage - Banner image URL
 * @property {string[]} genres - Genre list
 * @property {string[]} synonyms - Alternative titles
 * @property {number|null} averageScore - Average score (0-100)
 * @property {number|null} meanScore - Mean score (0-100)
 * @property {number} popularity - Popularity count
 * @property {number} favourites - Favourites count
 * @property {Array<{id: number, name: string, description: string, category: string, rank: number, isGeneralSpoiler: boolean, isMediaSpoiler: boolean}>} tags - Tag list
 * @property {string} siteUrl - AniList URL
 * @property {string} description - HTML description
 */

/**
 * User-specific anime data from AniList imports.
 * Extends AniListAnime with user's personal data.
 * @typedef {Object} UserAnimeData
 * @property {number} malId - MyAnimeList ID
 * @property {'COMPLETED'|'WATCHING'|'PLANNING'|'ON_HOLD'|'DROPPED'} status - User's watch status
 * @property {number|null} score - User's rating (0-10)
 * @property {number} progress - Episodes watched
 * @property {number} repeat - Rewatch count
 * @property {{year: number|null, month: number|null, day: number|null}} startedAt - When user started
 * @property {{year: number|null, month: number|null, day: number|null}} completedAt - When user completed
 * @property {number} id - AniList ID
 * @property {number} idMal - MyAnimeList ID
 * @property {{romaji: string, english: string|null, native: string, userPreferred: string}} title - Anime titles
 * @property {'TV'|'TV_SHORT'|'MOVIE'|'SPECIAL'|'OVA'|'ONA'|'MUSIC'} format - Anime format
 * @property {number|null} episodes - Episode count
 * @property {number|null} duration - Episode duration
 * @property {string[]} genres - Genre list
 * @property {Array<{name: string, rank: number}>} tags - Simplified tag list
 * @property {number|null} averageScore - Average score (0-100)
 * @property {number} popularity - Popularity count
 * @property {number|null} favourites - Favourites count
 */

