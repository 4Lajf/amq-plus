/**
 * Quiz configuration object from the database
 * @typedef {Object} Quiz
 * @property {string} id - Unique quiz ID
 * @property {string} name
 * @property {string|null} description
 * @property {boolean} is_public
 * @property {boolean} allow_remixing
 * @property {string} creator_username
 * @property {string} created_at - ISO timestamp of creation
 * @property {string} [updated_at] - ISO timestamp of last update
 * @property {string} [play_token]
 * @property {number} [likes]
 * @property {number} [plays]
 * @property {Object} [quiz_metadata]
 * @property {Object} [configuration_data] - Quiz configuration data (nodes, edges, etc.)
 */
export interface Quiz {
	id: string;
	name: string;
	description: string | null;
	is_public: boolean;
	allow_remixing: boolean;
	creator_username: string;
	created_at: string;
	updated_at?: string;
	play_token?: string;
	likes?: number;
	plays?: number;
	quiz_metadata?: QuizMetadata;
	configuration_data?: QuizConfigurationData;
}

/**
 * Quiz metadata containing useful information about the quiz
 * @typedef {Object} QuizMetadata
 * @property {{min: number, max: number}} estimatedSongs - Estimated song count range
 * @property {string|null} difficulty
 * @property {string|null} songTypes
 * @property {string|null} songSelection
 * @property {Array} [sourceNodes]
 * @property {Object} [guessTime] - Guess time configuration
 */
export interface QuizMetadata {
	estimatedSongs: { min: number; max: number };
	difficulty: string | null;
	songTypes: string | null;
	songSelection: string | null;
	sourceNodes?: Array<unknown>;
	guessTime?: {
		guessTime: {
			useRange: boolean;
			staticValue?: number;
			min?: number;
			max?: number;
		};
		extraGuessTime: {
			useRange: boolean;
			staticValue?: number;
			min?: number;
			max?: number;
		};
	} | null;
}

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
export interface QuizConfigurationData {
	nodes: Array<unknown>;
	edges: Array<unknown>;
	basicSettings?: Record<string, unknown>;
	numberOfSongs?: number;
	router?: Record<string, unknown>;
	seed?: string;
	timestamp?: string;
}

/**
 * User session object
 * @typedef {Object} Session
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number} expires_in - Expiration time in seconds
 * @property {string} token_type - Token type (usually 'bearer')
 * @property {User} user
 */
export interface Session {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
	user: User;
}

/**
 * User object
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} [username]
 * @property {Object} [user_metadata]
 * @property {Object} [app_metadata]
 */
export interface User {
	id: string;
	email: string;
	username?: string;
	user_metadata?: Record<string, unknown>;
	app_metadata?: Record<string, unknown>;
}

/**
 * Pagination information
 * @typedef {Object} Pagination
 * @property {number} page - Current page number (1-based)
 * @property {number} totalPages
 * @property {number} totalItems
 * @property {number} limit - Items per page
 */
export interface Pagination {
	page: number;
	totalPages: number;
	totalItems: number;
	limit: number;
}

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
export interface QuizFilters {
	search?: string;
	name?: string;
	description?: string;
	creator?: string;
	dateFrom?: string;
	dateTo?: string;
	myQuizzes?: boolean;
	sortBy?: 'newest' | 'trending' | 'mostLiked' | 'mostPlayed';
}

/**
 * CalendarDate object from @internationalized/date
 * @typedef {Object} CalendarDate
 * @property {number} year - Year
 * @property {number} month - Month (1-12)
 * @property {number} day - Day of month
 */
export interface CalendarDate {
	year: number;
	month: number;
	day: number;
}

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
export interface LocalQuiz {
	id: string;
	name: string;
	description?: string | null;
	configuration_data: QuizConfigurationData;
	creator_username: string;
	share_token: string;
	play_token: string;
	created_at: number;
	updated_at: number;
	database_id?: string;
	is_temporary?: boolean;
	is_public?: boolean;
}

