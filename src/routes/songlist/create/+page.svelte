<!-- @ts-nocheck -->
<!--
  TypeScript checking disabled due to Svelte 5 component prop compatibility issues.
  The shadcn-ui/bits-ui components require updated type definitions.
-->
<script>
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Pagination from '$lib/components/ui/pagination';
	import { Separator } from '$lib/components/ui/separator';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		DialogTrigger
	} from '$lib/components/ui/dialog';
	import { Switch } from '$lib/components/ui/switch';
	import {
		Search,
		Plus,
		Download,
		Save,
		Trash2,
		Music,
		User,
		List,
		Globe,
		UserCheck,
		Loader2,
		Settings,
		ChevronLeft,
		ChevronRight,
		RefreshCw,
		Clock,
		Film,
		AlertCircle,
		MoreVertical
	} from 'lucide-svelte';
	// @ts-ignore
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/stores';
	import { fetchAnimeMetadata } from '$lib/utils/anilist.js';
	import {
		processProviderData,
		PROVIDER_INFO
	} from '$lib/components/amqplus/editor/utils/providerUtils.js';
	import SampleRangeDialog from '$lib/components/SampleRangeDialog.svelte';
	import ProfileImport from '$lib/components/ProfileImport.svelte';

	/**
	 * Song data from AnisongDB API.
	 * @typedef {Object} AnisongDBSong
	 * @property {number} annId - Anime News Network ID
	 * @property {number} annSongId - ANN Song ID
	 * @property {number} amqSongId - AMQ Song ID
	 * @property {string} animeENName - English anime title
	 * @property {string} animeJPName - Japanese anime title
	 * @property {string|null} animeAltName - Alternative title
	 * @property {string} [animeRomajiName] - Romaji anime title
	 * @property {string} [animeEnglishName] - Alternative English anime title
	 * @property {number} [malId] - MyAnimeList ID
	 * @property {string} animeVintage - Release season/year (e.g., "Fall 1995")
	 * @property {string} animeType - Anime format (TV, Movie, OVA, etc.)
	 * @property {string} animeCategory - Category classification
	 * @property {string} songType - Song type (e.g., "Opening 1", "Ending 2")
	 * @property {string} songName - Song title
	 * @property {string} songArtist - Artist name
	 * @property {string} songComposer - Composer name
	 * @property {string} songArranger - Arranger name
	 * @property {number} songDifficulty - Difficulty rating (0-100)
	 * @property {string} songCategory - Category (Standard, Instrumental, Chanting, Character)
	 * @property {number} songLength - Duration in seconds
	 * @property {boolean} isDub - Whether it's a dub version
	 * @property {boolean} isRebroadcast - Whether from rebroadcast
	 * @property {string|null} HQ - High quality video filename
	 * @property {string|null} MQ - Medium quality video filename
	 * @property {string|null} audio - Audio filename
	 * @property {{myanimelist: number|null, anidb: number|null, anilist: number|null, kitsu: number|null}} linked_ids - External IDs
	 * @property {Array<{id: number, name: string, line_up_id: number, groups: Array}>} artists - Artist details
	 * @property {Array<{start: number, end: number, randomStartPosition: boolean}>} [sampleRanges]
	 * @property {'global'|'list'} [source]
	 * @property {import('../../../types/types.js').AniListAnime|import('../../../types/types.js').UserAnimeData|null} [sourceAnime]
	 * @property {number} [guessTime]
	 * @property {boolean} [guessTimeRandom]
	 * @property {{mode: 'static'|'random', staticValue: number, randomValues: number[]}} [playbackSpeed]
	 */

	/**
	 * Combined song data with anime metadata and user data.
	 * Extends AnisongDBSong with additional fields.
	 * @typedef {AnisongDBSong & {
	 *  source?: 'global' | 'list',
	 *  sourceAnime?: import('../../../types/types.js').AniListAnime | import('../../../types/types.js').UserAnimeData | null,
	 *  guessTime?: number,
	 *  guessTimeRandom?: boolean,
	 *  playbackSpeed?: {mode: 'static'|'random', staticValue: number, randomValues: number[]}
	 * }} EnrichedSong
	 */

	// @ts-ignore - SvelteKit types are generated at build time
	let { data } = $props();
	let { session, user } = $derived(data);

	// Search state
	let animeSearchQuery = $state('');
	let isSearching = $state(false);
	/** @type {AnisongDBSong[]} */
	let searchResults = $state([]);
	/** @type {AnisongDBSong[]} */
	let unfilteredSearchResults = $state([]); // Store unfiltered results for reactive filtering
	let searchMode = $state('global'); // 'global' or 'userlist'
	let searchError = $state(null);

	// Search criteria
	let searchBy = $state('anime'); // 'anime', 'artist', 'song', 'composer', 'season'
	let animeSearch = $state({ query: '' });
	let artistSearch = $state({ query: '' });
	let songNameSearch = $state({ query: '' });
	let composerSearch = $state({ query: '' });
	let seasonSearch = $state({ season: 'Winter', year: new Date().getFullYear() });
	let userListSearchQuery = $state('');

	let selectedSongTypes = $state({
		opening: true,
		ending: true,
		insert: true
	});

	let partialMatch = $state(true); // Partial search enabled by default
	let addingSongId = $state(null); // Track which song is being added for visual feedback

	/**
	 * Check if a song matches the selected song types
	 * @param {AnisongDBSong} song - Song to check
	 * @returns {boolean} Whether the song matches selected types
	 */
	function matchesSongTypes(song) {
		if (!song.songType) return false;

		const typeString = String(song.songType).toLowerCase();
		const isOpening = typeString.includes('opening');
		const isEnding = typeString.includes('ending');
		const isInsert = typeString.includes('insert');

		return (
			(isOpening && selectedSongTypes.opening) ||
			(isEnding && selectedSongTypes.ending) ||
			(isInsert && selectedSongTypes.insert)
		);
	}

	// Reactive effect to filter search results when song types change
	$effect(() => {
		// Access selectedSongTypes to make this reactive
		selectedSongTypes.opening;
		selectedSongTypes.ending;
		selectedSongTypes.insert;

		// Filter the unfiltered results based on selected song types
		if (unfilteredSearchResults.length > 0) {
			searchResults = unfilteredSearchResults.filter(matchesSongTypes);
		}
	});

	// Profile import state
	let importedUserList = $state([]); // Store imported anime list for user list mode
	let importedSongs = $state([]); // Store all songs from user's list
	let showAllSearchResults = $state(false); // For pagination of search results
	let isImporting = $state(false);

	// Provider import state
	let providerType = $state('amq-export');
	let providerFileInput = $state(null);
	let isProcessingProvider = $state(false);
	let providerError = $state(null);
	let providerData = $state(null); // Store processed provider data

	// Provider type options
	const providerTypes = Object.entries(PROVIDER_INFO).map(([key, info]) => ({
		value: key,
		label: info.name,
		icon: info.icon,
		color: info.color
	}));

	// Computed: paginated search results
	let paginatedSearchResults = $derived(
		showAllSearchResults ? searchResults : searchResults.slice(0, 10)
	);

	// Song list state
	/** @type {EnrichedSong[]} */
	let currentSongList = $state([]);
	let listName = $state('');
	let listDescription = $state('');
	let savedLists = $state([]);
	let isLoadingLists = $state(false);
	let isSaving = $state(false);
	let currentListShowAll = $state(false); // For pagination
	let isSaveDialogOpen = $state(false);

	// Shared list state (from view/edit tokens)
	let currentSharedListId = $state(null);
	let currentEditToken = $state(null);

	// Saved lists pagination
	let savedListsPage = $state(1);
	let savedListsPerPage = 5;
	let paginatedSavedLists = $derived(
		savedLists.slice((savedListsPage - 1) * savedListsPerPage, savedListsPage * savedListsPerPage)
	);
	let savedListsTotalPages = $derived(Math.ceil(savedLists.length / savedListsPerPage));

	// State for the settings dialog
	let selectedListForSettings = $state(null);
	let isSettingsDialogOpen = $state(false);
	let settingsListName = $state('');
	let settingsDescription = $state('');
	let settingsIsPublic = $state(false);

	// State for alert/confirm dialogs
	let showOverwriteDialog = $state(false);
	let showClearListDialog = $state(false);
	let showDeleteListDialog = $state(false);
	let listToDelete = $state(null);
	let existingListForOverwrite = $state(null);

	// State for sample range dialog
	let sampleRangeDialogOpen = $state(false);
	/** @type {EnrichedSong|null} */
	let selectedSongForEditing = $state(null);

	let isListMixed = $derived(
		currentSongList.length > 0 && new Set(currentSongList.map((s) => s.source)).size > 1
	);

	// Computed: displayed songs (with pagination)
	let displayedSongs = $derived(
		currentListShowAll ? currentSongList : currentSongList.slice(0, 50)
	);
	let hasMoreSongs = $derived(currentSongList.length > 50 && !currentListShowAll);

	// Helper function to get current season and year
	/**
	 * Get current season based on month
	 * @returns {string} Current season name
	 */
	function getCurrentSeason() {
		const month = new Date().getMonth();
		if (month < 3) return 'Winter';
		if (month < 6) return 'Spring';
		if (month < 9) return 'Summer';
		return 'Fall';
	}

	$effect(() => {
		seasonSearch.season = getCurrentSeason();
	});

	// Helper function to format song type
	/**
	 * Format song type for display
	 * @param {string} songType - Song type string
	 * @returns {string} Formatted song type
	 */
	function formatSongType(songType) {
		if (!songType) return '';

		// Convert to string if it's not already
		const typeString = String(songType);
		const type = typeString.toLowerCase();

		if (type.includes('opening')) {
			const match = typeString.match(/opening\s*(\d+)/i);
			return match ? `OP ${match[1]}` : 'OP';
		} else if (type.includes('ending')) {
			const match = typeString.match(/ending\s*(\d+)/i);
			return match ? `ED ${match[1]}` : 'ED';
		} else if (type.includes('insert')) {
			return 'IN';
		}
		return typeString;
	}

	/**
	 * Format anime name for display - romaji as primary, English as additional
	 * @param {AnisongDBSong} song - Song object with anime name fields
	 * @returns {Object} Object with primary (romaji) and secondary (english) names
	 */
	function formatAnimeName(song) {
		const romaji = song.animeRomajiName || song.animeJPName;
		const english = song.animeENName || song.animeEnglishName;

		return {
			primary: romaji || english || '',
			secondary: romaji && english ? english : null,
			full: romaji || english || song.animeJPName || ''
		};
	}

	/**
	 * Handle profile import completion
	 * @param {Object} result - Import result
	 * @returns {void}
	 */
	function handleProfileImportComplete(result) {
		importedUserList = result.animeList;
		importedSongs = result.songsList;
		unfilteredSearchResults = result.songsList;
		searchResults = unfilteredSearchResults.filter(matchesSongTypes);
		searchMode = 'userlist';

		// Show appropriate success message
		const hasCachedStatuses =
			result.cacheInfo.cachedStatuses && result.cacheInfo.cachedStatuses.length > 0;
		const hasUncachedStatuses =
			result.cacheInfo.uncachedStatuses && result.cacheInfo.uncachedStatuses.length > 0;

		if (hasCachedStatuses && hasUncachedStatuses) {
			toast.success(
				`Import completed! ${result.cacheInfo.cachedStatuses.length} cached + ${result.cacheInfo.uncachedStatuses.length} fresh statuses. ${result.songsList.length} songs from ${result.animeList.length} anime.`
			);
		} else if (hasCachedStatuses && !hasUncachedStatuses) {
			toast.success(
				`⚡ Loaded from cache! ${result.songsList.length} songs from ${result.animeList.length} anime (instant).`
			);
		} else {
			toast.success(
				`Import completed! Found ${result.songsList.length} songs from ${result.animeList.length} anime.`
			);
		}
	}

	/**
	 * Handle profile import error
	 * @param {Error} error - Import error
	 * @returns {void}
	 */
	function handleProfileImportError(error) {
		toast.error(`Import error: ${error.message}`);
	}

	/**
	 * Handle profile import config change
	 * @param {Object} config - Config data
	 * @returns {void}
	 */
	function handleProfileImportConfigChange(config) {
		// Config changes are tracked by ProfileImport component internally
		// No action needed here unless we want to persist the config
	}

	// Search function - handles both global API search and local user list filtering
	/**
	 * Handle search functionality
	 * @returns {Promise<void>}
	 */
	async function handleSearch() {
		isSearching = true;
		searchError = null;

		if (searchMode === 'global') {
			await searchAnisongDB();
		} else {
			filterUserListSongs();
		}

		isSearching = false;
	}

	// Filter local user list songs
	/**
	 * Filter user list songs based on search criteria
	 * @returns {void}
	 */
	function filterUserListSongs() {
		if (importedSongs.length === 0) {
			toast.info('Import your list to search within it.');
			return;
		}

		// Get the query based on search type
		let query = '';
		switch (searchBy) {
			case 'anime':
				query = animeSearch.query;
				break;
			case 'artist':
				query = artistSearch.query;
				break;
			case 'song':
				query = songNameSearch.query;
				break;
			case 'composer':
				query = composerSearch.query;
				break;
			default:
				query = '';
		}

		query = query.trim().toLowerCase();

		if (!query) {
			unfilteredSearchResults = importedSongs;
			searchResults = unfilteredSearchResults.filter(matchesSongTypes);
			toast.success(`Showing all ${searchResults.length} songs from your list.`);
			return;
		}

		const filtered = importedSongs.filter((song) => {
			if (searchBy === 'anime') {
				const anime = (
					song.animeENName ||
					song.animeJPName ||
					song.animeRomajiName ||
					song.animeEnglishName ||
					''
				).toLowerCase();
				return anime.includes(query);
			} else if (searchBy === 'artist') {
				const artist = (song.songArtist || '').toLowerCase();
				return artist.includes(query);
			} else if (searchBy === 'song') {
				const songName = (song.songName || '').toLowerCase();
				return songName.includes(query);
			} else if (searchBy === 'composer') {
				const composer = (song.songComposer || '').toLowerCase();
				return composer.includes(query);
			}
			return false;
		});

		unfilteredSearchResults = filtered;
		searchResults = unfilteredSearchResults.filter(matchesSongTypes);
		toast.success(`Found ${searchResults.length} songs in your list.`);
	}

	// Server-side database search function with AniList metadata
	/**
	 * Search AnisongDB for songs
	 * @returns {Promise<void>}
	 */
	async function searchAnisongDB() {
		unfilteredSearchResults = [];
		searchResults = [];

		try {
			if (searchMode === 'userlist' && importedUserList.length === 0) {
				toast.error('Import your anime list first');
				return;
			}

			let searchFilter;
			let requiresQuery = true;

			switch (searchBy) {
				case 'anime':
					searchFilter = {
						anime_search_filter: {
							search: animeSearch.query,
							partial_match: partialMatch
						}
					};
					if (!animeSearch.query.trim()) {
						toast.error('Please enter an anime title.');
						return;
					}
					break;
				case 'artist':
					searchFilter = {
						artist_search_filter: {
							search: artistSearch.query,
							partial_match: partialMatch,
							group_granularity: 0,
							max_other_artist: 99
						}
					};
					if (!artistSearch.query.trim()) {
						toast.error('Please enter an artist name.');
						return;
					}
					break;
				case 'song':
					searchFilter = {
						song_name_search_filter: { search: songNameSearch.query, partial_match: partialMatch }
					};
					if (!songNameSearch.query.trim()) {
						toast.error('Please enter a song name.');
						return;
					}
					break;
				case 'composer':
					searchFilter = {
						composer_search_filter: {
							search: composerSearch.query,
							partial_match: partialMatch,
							arrangement: false
						}
					};
					if (!composerSearch.query.trim()) {
						toast.error('Please enter a composer name.');
						return;
					}
					break;
				case 'season': {
					const year = parseInt(String(seasonSearch.year), 10);
					if (isNaN(year) || year.toString().length !== 4) {
						toast.error('Invalid year. Please use a 4-digit year.');
						return;
					}
					const validSeasons = ['Winter', 'Spring', 'Summer', 'Fall'];
					if (!validSeasons.includes(seasonSearch.season)) {
						toast.error("Invalid season. Please use 'Winter', 'Spring', 'Summer', or 'Fall'.");
						return;
					}
					searchFilter = { season: `${seasonSearch.season} ${year}` };
					requiresQuery = false;
					break;
				}
				default:
					toast.error('Invalid search type');
					return;
			}

			const requestBody = {
				and_logic: false,
				ignore_duplicate: false,
				opening_filter: selectedSongTypes.opening,
				ending_filter: selectedSongTypes.ending,
				insert_filter: selectedSongTypes.insert,
				...searchFilter
			};

			if (searchMode === 'userlist') {
				const malIds = importedUserList.map((anime) => anime.malId).filter(Boolean);
				if (malIds.length === 0) {
					toast.error('No MAL IDs found in your imported list.');
					return;
				}
				/** @type {Record<string, unknown>} */
				const withMalIds = requestBody;
				withMalIds.mal_ids = malIds;
			}

			const response = await fetch('https://anisongdb.com/api/search_request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const errorData = await response.json();
				if (errorData.detail && errorData.detail.includes('temporarily unavailable')) {
					searchError = 'Search is temporarily unavailable. Please try again in an hour.';
				} else {
					searchError = errorData.detail || `Search failed: ${response.status}`;
				}
				toast.error(searchError);
				return;
			}

			let results = await response.json();

			if (searchMode === 'global') {
				// For global search, just add the source and defer AniList enrichment
				unfilteredSearchResults = results.map((song) => ({ ...song, source: 'global' }));
			} else {
				// For userlist search, enrich with AniList data from the imported list
				const enhancedResults = results.map((song) => {
					// Songs from AnisongDB have MAL ID in linked_ids.myanimelist
					const songMalId = song.malId || song.linked_ids?.myanimelist;
					const sourceAnime = importedUserList.find((a) => a.malId === songMalId);

					if (!sourceAnime) {
						console.warn(
							'Could not find sourceAnime for song:',
							song.songName,
							'MAL ID:',
							songMalId
						);
					}

					return { ...song, sourceAnime, source: 'list' };
				});
				unfilteredSearchResults = enhancedResults;
			}

			// Apply song type filtering (reactive effect will handle this)
			searchResults = unfilteredSearchResults.filter(matchesSongTypes);

			if (searchResults.length === 0) {
				toast.info('No results found for your query.');
			} else {
				toast.success(`Found ${searchResults.length} songs.`);
			}
		} catch (error) {
			console.error('❌ Error searching AnisongDB:', error);
			searchError = error.message;
			toast.error(`Search error: ${error.message}`);
		}
	}

	/**
	 * Add song to current list
	 * @param {EnrichedSong} song - Song to add
	 * @returns {Promise<void>}
	 */
	async function addSongToList(song) {
		try {
			// Set adding state for visual feedback
			addingSongId = song.annSongId || song.amqSongId || song.songName;

			// Check if song already exists in the list
			const exists = currentSongList.some(
				(s) =>
					(s.songName === song.songName &&
						s.songArtist === song.songArtist &&
						s.animeENName === song.animeENName) ||
					(s.amqSongId && s.amqSongId === song.amqSongId)
			);

			if (exists) {
				addingSongId = null;
				toast.info('This song is already on the list');
				return;
			}

			/** @type {EnrichedSong} */
			let enrichedSong = song;

			// Only fetch AniList data for global songs that don't have it yet
			// Songs from list import already have all data (AnisongDB + AniList with personal metadata)
			if (enrichedSong.source === 'global' && !enrichedSong.sourceAnime) {
				try {
					const malId = enrichedSong.malId || enrichedSong.linked_ids?.myanimelist;
					if (malId) {
						const metadata = await fetchAnimeMetadata(malId);
						if (metadata) {
							enrichedSong = { ...enrichedSong, sourceAnime: metadata };
						}
					}
				} catch (error) {
					console.warn('Failed to fetch metadata when adding song:', song.songName, error);
				}
			}

			// Don't set sampleRanges or guessTime by default - they inherit from quiz-wide settings
			// Only preserve them if they already exist (user explicitly configured them)
			// If no custom sample ranges exist, don't set the field (undefined = inherit from quiz)

			// Only set guessTime if it was explicitly provided (don't default)
			// guessTime will be undefined if not set, allowing inheritance from quiz-wide settings

			currentSongList = [...currentSongList, enrichedSong];
			addingSongId = null;
			toast.success(`Added "${song.songName}" to the list`);
		} catch (e) {
			addingSongId = null;
			console.error(e);
			toast.error(`Failed to add song: ${e.message || 'Unknown error'}`);
		}
	}

	/**
	 * Remove song from current list
	 * @param {EnrichedSong} song - Song to remove
	 * @returns {void}
	 */
	function removeSongFromList(song) {
		currentSongList = currentSongList.filter((s) => s !== song);
		toast.success('Removed song from the list');
	}

	/**
	 * Open sample range dialog for a song
	 * @param {EnrichedSong} song - Song to configure sample range for
	 * @returns {void}
	 */
	function openSampleRangeDialog(song) {
		selectedSongForEditing = song;
		sampleRangeDialogOpen = true;
	}

	/**
	 * Handle song update after dialog changes
	 * @param {EnrichedSong} song - Updated song object
	 * @returns {void}
	 */
	function handleSongUpdate(song) {
		// Force reactivity by creating a new array
		currentSongList = [...currentSongList];
	}

	/**
	 * Get full song data from AnisongDB
	 * @param {EnrichedSong} song - Song to get full data for
	 * @returns {Promise<EnrichedSong>} Song with full data
	 */
	async function getFullSongDataFromAnisongDB(song) {
		// Create a specific search to find this exact song
		const requestBody = {
			and_logic: true,
			ignore_duplicate: false,
			opening_filter: true,
			ending_filter: true,
			insert_filter: true,
			song_name_search_filter: { search: song.songName, partial_match: false }
		};

		// If we have an artist, add it to be more specific
		if (song.songArtist) {
			requestBody.artist_search_filter = {
				search: song.songArtist,
				partial_match: false,
				group_granularity: 0,
				max_other_artist: 99
			};
		}

		const response = await fetch('https://anisongdb.com/api/search_request', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			throw new Error('Failed to fetch full song data from AnisongDB');
		}

		const results = await response.json();

		if (results.length === 0) {
			console.warn('Could not find a unique match for song:', song);
			// @ts-ignore - Return original partial song data as fallback
			return song; // Return original song data
		}

		const animeName = song.animeENName || song.animeJPName || song.animeEnglishName;

		// Find the best match
		const bestMatch =
			results.find(
				(r) =>
					r.animeENName === animeName ||
					r.animeJPName === animeName ||
					r.animeEnglishName === animeName
			) || results[0];

		// Keep the source as 'list' and preserve existing AniList data
		return { ...bestMatch, source: 'list', sourceAnime: song.sourceAnime };
	}

	// Handle provider file upload
	/**
	 * Handle provider file upload
	 * @param {Event} event - File upload event
	 * @returns {Promise<void>}
	 */
	async function handleProviderFileUpload(event) {
		const file = /** @type {HTMLInputElement} */ (event.target).files[0];
		if (!file) return;

		if (!file.name.toLowerCase().endsWith('.json')) {
			providerError = 'Please select a JSON file';
			return;
		}

		isProcessingProvider = true;
		providerError = null;

		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const resultText = e.target.result;
				if (typeof resultText !== 'string') {
					providerError = 'File content is not text';
					isProcessingProvider = false;
					return;
				}
				const jsonData = JSON.parse(resultText);
				const result = await processProviderData(jsonData, {
					enrichWithAnisongDB: true,
					onProgress: (eta) => {
						// Could show progress to user if needed
						console.log(`AnisongDB enrichment ETA: ${eta}s`);
					}
				});

				if (result.error) {
					providerError = result.error;
					isProcessingProvider = false;
					return;
				}

				providerData = result;
				isProcessingProvider = false;

				const enrichmentStatus = result.metadata.enrichedWithAnisongDB
					? ' (enriched with AnisongDB)'
					: ' (AnisongDB enrichment failed)';

				toast.success(
					`Successfully processed ${result.songs.length} songs from ${PROVIDER_INFO[result.provider]?.name || 'provider'}${enrichmentStatus}`
				);
			} catch (error) {
				providerError = `Invalid JSON file: ${error.message}`;
				isProcessingProvider = false;
			}
		};

		reader.onerror = () => {
			providerError = 'Error reading file';
			isProcessingProvider = false;
		};

		reader.readAsText(file);
	}

	// Clear provider data
	/**
	 * Clear provider data
	 * @returns {void}
	 */
	function clearProviderData() {
		providerData = null;
		providerError = null;
		if (providerFileInput) {
			providerFileInput.value = '';
		}
	}

	// Add all songs from provider import
	/**
	 * Add all provider songs to current list
	 * @returns {Promise<void>}
	 */
	async function addAllProviderSongs() {
		if (!providerData?.songs?.length) {
			toast.error('No provider data available');
			return;
		}

		let addedCount = 0;
		const songsToAdd = providerData.songs.filter(
			(song) =>
				!currentSongList.some(
					(s) =>
						s.songName === song.songName &&
						s.songArtist === song.songArtist &&
						(s.animeRomajiName === song.animeRomajiName ||
							s.animeEnglishName === song.animeEnglishName)
				)
		);

		try {
			// Process songs in batches for better performance
			const BATCH_SIZE = 100;
			const BATCH_DELAY = 50; // 50ms delay between batches to prevent UI freeze

			for (let i = 0; i < songsToAdd.length; i += BATCH_SIZE) {
				const batch = songsToAdd.slice(i, i + BATCH_SIZE);

				// Initialize new fields for each song in batch
				// Don't set sampleRanges/guessTime by default - they inherit from quiz-wide settings
				const initializedBatch = batch.map((song) => {
					// Only preserve sampleRanges if they already exist
					let processedSong = { ...song, source: 'provider' };

					// Convert sampleStart/sampleEnd to sampleRanges format if needed
					if (
						song.sampleRanges &&
						Array.isArray(song.sampleRanges) &&
						song.sampleRanges.length > 0
					) {
						processedSong.sampleRanges = song.sampleRanges;
					} else if (
						song.sampleStart !== undefined &&
						song.sampleStart !== null &&
						song.sampleEnd !== undefined &&
						song.sampleEnd !== null
					) {
						// Convert sampleStart/sampleEnd to sampleRanges format
						const songLength = song.songLength || 90;
						const startPercent = typeof song.sampleStart === 'number' ? song.sampleStart : 0;
						const endPercent = typeof song.sampleEnd === 'number' ? song.sampleEnd : songLength;

						// Convert percentage to seconds if needed (if > 100, assume it's seconds)
						const startSeconds =
							startPercent > 100 ? startPercent : (startPercent / 100) * songLength;
						const endSeconds = endPercent > 100 ? endPercent : (endPercent / 100) * songLength;

						processedSong.sampleRanges = [
							{
								start: startSeconds,
								end: endSeconds,
								randomStartPosition: false
							}
						];
					}
					// If no custom sample ranges, don't set the field (undefined = inherit from quiz)

					// Only set guessTime if it was explicitly provided and not null
					if (song.guessTime !== undefined && song.guessTime !== null) {
						processedSong.guessTime = song.guessTime;
					}
					// Only set extraGuessTime if it was explicitly provided and not null
					if (
						song.extraGuessTime !== undefined &&
						song.extraGuessTime !== null &&
						song.extraGuessTime > 0
					) {
						processedSong.extraGuessTime = song.extraGuessTime;
					}
					if (song.guessTimeRandom !== undefined) {
						processedSong.guessTimeRandom = song.guessTimeRandom;
					}

					return processedSong;
				});

				// Add batch to list
				currentSongList = [...currentSongList, ...initializedBatch];
				addedCount += batch.length;

				// Small delay to prevent UI freeze and allow progress updates
				if (i + BATCH_SIZE < songsToAdd.length) {
					await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
				}
			}

			toast.success(`Added ${addedCount} songs from provider import.`);
		} catch (error) {
			console.error('Error adding provider songs:', error);
			toast.error(`Error adding songs: ${error.message}`);
		}
	}

	// Add all songs from user's imported list (only in userlist mode)
	// This function efficiently adds all imported songs that already have:
	// - AnisongDB data (fetched in batches of 500 MAL IDs)
	// - AniList metadata (batch-fetched in chunks of 50)
	// - Personal user metadata (from AniList/MAL list)
	/**
	 * Add all user list songs to current list
	 * @returns {Promise<void>}
	 */
	async function addAllUserListSongs() {
		if (searchResults.length === 0 || searchMode !== 'userlist') {
			toast.error(
				'No songs from your list are currently displayed. Please import your list first.'
			);
			return;
		}

		isImporting = true;
		let addedCount = 0;
		const songsToAdd = searchResults.filter(
			(song) =>
				!currentSongList.some(
					(s) =>
						(s.songName === song.songName &&
							s.songArtist === song.songArtist &&
							(s.animeENName === song.animeENName ||
								s.animeEnglishName === song.animeEnglishName)) ||
						(s.amqSongId && s.amqSongId === song.amqSongId)
				)
		);

		try {
			// Process songs in batches for better performance
			const BATCH_SIZE = 100;
			const BATCH_DELAY = 50; // 50ms delay between batches to prevent UI freeze

			for (let i = 0; i < songsToAdd.length; i += BATCH_SIZE) {
				const batch = songsToAdd.slice(i, i + BATCH_SIZE);

				// Initialize new fields for each song in batch
				// Don't set sampleRanges/guessTime by default - they inherit from quiz-wide settings
				const initializedBatch = batch.map((song) => {
					// Only preserve sampleRanges if they already exist
					let processedSong = { ...song };

					if (
						song.sampleRanges &&
						Array.isArray(song.sampleRanges) &&
						song.sampleRanges.length > 0
					) {
						processedSong.sampleRanges = song.sampleRanges;
					}
					// If no custom sample ranges, don't set the field (undefined = inherit from quiz)

					// Only set guessTime if it was explicitly provided
					if (song.guessTime !== undefined) {
						processedSong.guessTime = song.guessTime;
					}
					if (song.guessTimeRandom !== undefined) {
						processedSong.guessTimeRandom = song.guessTimeRandom;
					}

					return processedSong;
				});

				// Add batch to list
				currentSongList = [...currentSongList, ...initializedBatch];
				addedCount += batch.length;

				// Small delay to prevent UI freeze and allow progress updates
				if (i + BATCH_SIZE < songsToAdd.length) {
					await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
				}
			}

			toast.success(`Added ${addedCount} new songs from your list.`);
		} catch (error) {
			console.error('Error adding all user list songs:', error);
			toast.error(`Error adding songs: ${error.message}`);
		} finally {
			isImporting = false;
		}
	}

	// Open save dialog
	/**
	 * Open save dialog
	 * @returns {void}
	 */
	function openSaveDialog() {
		// Allow if logged in OR if we have an edit token
		if (!session && !currentEditToken) {
			toast.error('You must be logged in to save a list');
			return;
		}

		if (currentSongList.length === 0) {
			toast.error('The list is empty');
			return;
		}

		isSaveDialogOpen = true;
	}

	// Save list to Supabase with Pixeldrain upload
	async function saveList() {
		if (!listName.trim()) {
			toast.error('Please enter a list name');
			return;
		}

		isSaving = true;

		try {
			// If using an edit token, we are updating the shared list directly
			if (currentEditToken && currentSharedListId) {
				await performSave(currentSharedListId);
				return;
			}

			// Normal flow: Check if a list with the same name already exists
			const existingList = savedLists.find((list) => list.name === listName.trim());

			if (existingList) {
				// Show overwrite dialog
				existingListForOverwrite = existingList;
				showOverwriteDialog = true;
				isSaving = false;
				return;
			}

			// Proceed with saving
			await performSave(null);
		} catch (error) {
			console.error('Error saving list:', error);
			toast.error(`Error saving list: ${error.message}`);
			isSaving = false;
		}
	}

	// Perform the actual save operation
	async function performSave(existingListId) {
		try {
			let songsToSave = currentSongList;
			if (isListMixed) {
				// Mixed list: strip personal metadata from "list" songs for compatibility
				console.log('Mixed list detected - stripping personal metadata from list songs');
				// @ts-ignore - Type is compatible after stripping personal metadata
				songsToSave = currentSongList.map((s) => {
					if (s.source === 'list' && s.sourceAnime && 'score' in s.sourceAnime) {
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
						const { score, progress, repeat, startedAt, completedAt, ...rest } = s.sourceAnime;
						return { ...s, sourceAnime: rest };
					}
					return s;
				});
			} else {
				// Pure list: keep all personal metadata
				console.log('Pure list detected - keeping all personal metadata');
			}

			// Upload songs list to Pixeldrain
			const songsListLink = await uploadToPixeldrain(songsToSave, listName.trim());

			// Get username for creator field
			// Use user.global_name if logged in, otherwise preserve existing or use 'Anonymous'
			const creatorUsername = user?.user_metadata?.custom_claims?.global_name || (data.publicList?.creator_username) || 'Anonymous';

			// Insert or update list via API
			const response = await fetch('/api/song-lists', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: listName.trim(),
					description: listDescription.trim() || null,
					songs_list_link: songsListLink,
					creator_username: creatorUsername,
					song_count: songsToSave.length,
					existingListId,
					edit_token: currentEditToken // Pass edit token if available
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to save list');
			}

			const result = await response.json();
			const isUpdate = existingListId ? true : result.updated;

			// Get the new or updated list ID
			const newListId = result.data?.id;

			toast.success(isUpdate ? 'List updated successfully' : 'List saved successfully');
			if (session) {
				await loadSavedLists();
			}

			// Close dialog and reset form
			isSaveDialogOpen = false;
			// Don't clear name/description if we just edited, so user can keep editing
			if (!isUpdate) {
				listName = '';
				listDescription = '';
			}

			// If this was a copy from another list (has ?fromList parameter), redirect to the new list
			const url = new URL(window.location.href);
			if (url.searchParams.has('fromList') && newListId && !existingListId) {
				// Clear the fromList parameter and navigate to the new list
				url.searchParams.delete('fromList');
				window.history.replaceState({}, '', url.toString());
				toast.info('Redirecting to your new list...');
				// Give user time to see the toast before redirecting
				await new Promise((resolve) => setTimeout(resolve, 1000));
				window.location.href = `/songlist/create?id=${newListId}`;
			}
		} catch (error) {
			console.error('Error saving list:', error);
			toast.error(`Error saving list: ${error.message}`);
			throw error;
		} finally {
			isSaving = false;
		}
	}

	// Confirm overwrite
	async function confirmOverwrite() {
		showOverwriteDialog = false;
		isSaving = true;
		await performSave(existingListForOverwrite.id);
		existingListForOverwrite = null;
	}

	// Upload JSON to Pixeldrain
	async function uploadToPixeldrain(songs, listName) {
		const jsonContent = JSON.stringify(songs, null, 2);
		const blob = new Blob([jsonContent], { type: 'application/json' });

		// Sanitize filename
		const sanitizedName = listName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
		const filename = `${sanitizedName}_${Date.now()}.json`;

		const response = await fetch(
			`/api/pixeldrain/upload?filename=${encodeURIComponent(filename)}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: jsonContent
			}
		);

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to upload to Pixeldrain');
		}

		const result = await response.json();
		return result.link;
	}

	function filterSourceAnimeData(sourceAnime) {
		if (!sourceAnime) return sourceAnime;

		const filtered = { ...sourceAnime };

		if (filtered.tags) {
			filtered.tags = filtered.tags.map((tag) => ({
				rank: tag.rank,
				name: tag.name
			}));
		}

		const propertiesToRemove = [
			'studio',
			'description',
			'titlePreferred',
			'externalLinks',
			'titles',
			'romaji',
			'english',
			'native',
			'bannerImage',
			'coverImage',
			'relations',
			'synonyms',
			'siteUrl',
			'studios'
		];

		propertiesToRemove.forEach((prop) => {
			delete filtered[prop];
		});

		if (filtered.title) {
			delete filtered.title;
		}

		return filtered;
	}

	// Load saved lists
	async function loadSavedLists() {
		if (!session) return;

		isLoadingLists = true;

		try {
			const response = await fetch('/api/song-lists', {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to load lists');
			}

			const result = await response.json();
			savedLists = result.data || [];
			savedListsPage = 1; // Reset to first page when loading lists
		} catch (error) {
			console.error('Error loading lists:', error);
			toast.error(`Error loading lists: ${error.message}`);
		} finally {
			isLoadingLists = false;
		}
	}

	// Load a saved list
	async function loadList(list, updateUrl = true) {
		try {
			// Optimistically update URL without reloading the page (do this first for instant feedback)
			if (updateUrl) {
				const url = new URL(window.location.href);
				// Remove fromList parameter when loading a new list
				url.searchParams.delete('fromList');
				url.searchParams.set('id', list.id);
				window.history.replaceState({}, '', url.toString());
			}

			toast.info(`Loading list "${list.name}"...`);

			// Fetch songs from server (server handles Pixeldrain)
			const response = await fetch(`/api/song-lists/${list.id}/load`);

			if (!response.ok) {
				throw new Error('Failed to fetch song list');
			}

			const result = await response.json();

			// Preserve existing sampleRanges/guessTime if they exist, otherwise don't set them (inherit from quiz)
			currentSongList = result.songs.map((song) => {
				let processedSong = { ...song };

				// Only preserve sampleRanges if they already exist
				if (song.sampleRanges && Array.isArray(song.sampleRanges) && song.sampleRanges.length > 0) {
					processedSong.sampleRanges = song.sampleRanges;
				}
				// If no custom sample ranges, don't set the field (undefined = inherit from quiz)

				// Only set guessTime if it was explicitly provided
				if (song.guessTime !== undefined) {
					processedSong.guessTime = song.guessTime;
				}
				if (song.guessTimeRandom !== undefined) {
					processedSong.guessTimeRandom = song.guessTimeRandom;
				}

				return processedSong;
			});
			listName = list.name;

			toast.success(`Loaded list "${list.name}" with ${currentSongList.length} songs`);
		} catch (error) {
			console.error('Error loading list:', error);
			toast.error(`Error loading list: ${error.message}`);
		}
	}

	// Open delete confirmation dialog
	function openDeleteDialog(listId) {
		listToDelete = listId;
		showDeleteListDialog = true;
	}

	// Delete a saved list
	async function deleteList() {
		if (!listToDelete) return;

		try {
			const response = await fetch(`/api/song-lists/${listToDelete}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to delete list');
			}

			toast.success('List deleted successfully');
			await loadSavedLists();
		} catch (error) {
			console.error('Error deleting list:', error);
			toast.error(`Error deleting list: ${error.message}`);
		} finally {
			showDeleteListDialog = false;
			listToDelete = null;
		}
	}

	// Open the settings dialog for a list
	function openSettings(list) {
		selectedListForSettings = list;
		settingsListName = list.name;
		settingsDescription = list.description || '';
		settingsIsPublic = list.is_public;
		isSettingsDialogOpen = true;
	}

	// Save changes from the settings dialog
	async function saveListSettings() {
		if (!selectedListForSettings) return;

		try {
			const response = await fetch(`/api/song-lists/${selectedListForSettings.id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: settingsListName,
					description: settingsDescription || null,
					is_public: settingsIsPublic
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to update settings');
			}

			toast.success('List settings updated successfully');
			await loadSavedLists();
			isSettingsDialogOpen = false;
			selectedListForSettings = null;
		} catch (error) {
			console.error('Error updating list settings:', error);
			toast.error(`Error updating settings: ${error.message}`);
		}
	}

	// Clear current list
	function openClearDialog() {
		if (currentSongList.length === 0) return;
		showClearListDialog = true;
	}

	function clearList() {
		currentSongList = [];
		toast.success('List cleared successfully');
		showClearListDialog = false;
	}

	// Load a list by ID (used for URL parameter loading)
	async function loadListById(listId) {
		try {
			// First try to find it in saved lists if we have them loaded
			if (savedLists.length > 0) {
				const list = savedLists.find((l) => l.id === listId);
				if (list) {
					await loadList(list, false); // Don't update URL since we're already loading from URL
					return;
				}
			}

			// If not found in saved lists, fetch it directly
			toast.info('Loading list...');

			const response = await fetch(`/api/song-lists/${listId}/load`);
			if (!response.ok) {
				throw new Error('Failed to fetch song list');
			}

			const result = await response.json();

			// Preserve existing sampleRanges/guessTime if they exist, otherwise don't set them (inherit from quiz)
			currentSongList = result.songs.map((song) => {
				let processedSong = { ...song };

				// Only preserve sampleRanges if they already exist
				if (song.sampleRanges && Array.isArray(song.sampleRanges) && song.sampleRanges.length > 0) {
					processedSong.sampleRanges = song.sampleRanges;
				}
				// If no custom sample ranges, don't set the field (undefined = inherit from quiz)

				// Only set guessTime if it was explicitly provided
				if (song.guessTime !== undefined) {
					processedSong.guessTime = song.guessTime;
				}
				if (song.guessTimeRandom !== undefined) {
					processedSong.guessTimeRandom = song.guessTimeRandom;
				}

				return processedSong;
			});

			// Try to get list name from API response or saved lists
			if (result.name) {
				listName = result.name;
			} else if (savedLists.length > 0) {
				const list = savedLists.find((l) => l.id === listId);
				if (list) {
					listName = list.name;
				}
			}

			toast.success(`Loaded list with ${currentSongList.length} songs`);
		} catch (error) {
			console.error('Error loading list:', error);
			toast.error(`Error loading list: ${error.message}`);
		}
	}

	// Load saved lists on mount
	onMount(async () => {
		if (session) {
			await loadSavedLists();
		}

		// Check for view/edit tokens handled by server
		if (data.publicList) {
			// Process the loaded songs
			let loadedSongs = [];
			if (data.publicList.songs && data.publicList.songs.length > 0) {
				loadedSongs = data.publicList.songs.map((s) => {
					let processedSong = { ...s, source: 'global' };

					// Only preserve sampleRanges if they already exist
					if (s.sampleRanges && Array.isArray(s.sampleRanges) && s.sampleRanges.length > 0) {
						processedSong.sampleRanges = s.sampleRanges;
					}
					
					// Only set guessTime if it was explicitly provided
					if (s.guessTime !== undefined) {
						processedSong.guessTime = s.guessTime;
					}
					if (s.guessTimeRandom !== undefined) {
						processedSong.guessTimeRandom = s.guessTimeRandom;
					}

					return processedSong;
				});
				currentSongList = loadedSongs;
			}

			// Handle Edit Token Mode
			if (data.editToken) {
				currentSharedListId = data.publicList.id;
				currentEditToken = data.editToken;
				listName = data.publicList.name;
				listDescription = data.publicList.description || '';
				toast.success(`Loaded "${data.publicList.name}" for editing (via shared link)`);
			} 
			// Handle View Token Mode (data.isViewOnly)
			else if (data.isViewOnly) {
				listName = `Copy of ${data.publicList.name}`;
				listDescription = data.publicList.description || '';
				toast.info(`Loaded "${data.publicList.name}" (View Only) - Save to create your own copy`);
			}
			// Handle standard fromList / public list loading
			else {
				// Check for id parameter in URL to distinguish between loading public list vs user list
				const listIdFromUrl = $page.url.searchParams.get('id');
				
				// If we have ID match with publicList, it's likely the server loaded it for us
				if (listIdFromUrl && data.publicList.id === listIdFromUrl) {
					listName = data.publicList.name;
					if (currentSongList.length > 0) {
						toast.success(`Loaded list "${data.publicList.name}" with ${currentSongList.length} songs`);
					} else {
						toast.warning('Public list is empty or could not be loaded.');
					}
				} else if ($page.url.searchParams.has('fromList')) {
					// Loaded as a copy source
					listName = `Copy of ${data.publicList.name}`;
					toast.info(`Loaded public list "${data.publicList.name}" for editing.`);
				}
			}
			
			return;
		}

		// Check for id parameter in URL (only if not already handled by server data)
		const listIdFromUrl = $page.url.searchParams.get('id');
		
		// If URL has id but no server-loaded data, try loading via API (for user's own lists)
		if (listIdFromUrl && !data.publicList) {
			await loadListById(listIdFromUrl);
			return; 
		}
	});
</script>

<svelte:head>
	<title>Song List Creator - AMQ Plus</title>
	<meta
		name="description"
		content="Create custom song lists for AMQ using AnisongDB and anime list imports"
	/>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mb-8">
		<h1 class="mb-2 text-3xl font-bold">Song List Creator</h1>
		<p class="text-gray-600">
			Create custom song lists for AMQ using AnisongDB search and anime list imports
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Search & Import Section -->
		<div class="space-y-6 lg:col-span-2">
			<!-- Profile Import -->
			<ProfileImport
				disabled={!session}
				onImportComplete={handleProfileImportComplete}
				onImportError={handleProfileImportError}
				onConfigChange={handleProfileImportConfigChange}
				showTitle={true}
				initialPlatform="anilist"
				initialUsername=""
				initialSelectedLists={{
					completed: true,
					watching: true,
					planning: false,
					on_hold: false,
					dropped: false
				}}
			/>

			<!-- Provider Import -->
			<Card class="">
				<CardHeader class="">
					<CardTitle class="flex items-center gap-2">
						<Download class="h-5 w-5" />
						Provider Import
					</CardTitle>
					<CardDescription class=""
						>Import songs from AMQ exports, Joseph Song UI, Kempanator Answer Stats, or
						Blissfullyoshi Ranked data</CardDescription
					>
				</CardHeader>
				<CardContent class="space-y-4">
					<!-- Provider Type Selection -->
					<div class="space-y-2">
						<Label class="">Provider Type</Label>
						<Select
							value={providerType}
							onValueChange={(val) => (providerType = val)}
							disabled={!session}
							type="single"
						>
							<SelectTrigger class="w-full">
								{providerTypes.find((p) => p.value === providerType)?.label ||
									'Select provider type'}
							</SelectTrigger>
							<SelectContent class="" portalProps={{}}>
								{#each providerTypes as type (type.value)}
									<SelectItem value={type.value} label={type.label} class="">
										<div class="flex items-center gap-2">
											<span>{type.icon}</span>
											<span class="font-medium">{type.label}</span>
										</div>
									</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					</div>

					<!-- File Upload -->
					<div class="space-y-2">
						<Label class="">JSON File</Label>
						<div class="flex gap-2">
							<input
								type="file"
								accept=".json"
								onchange={handleProviderFileUpload}
								bind:this={providerFileInput}
								class="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
								disabled={isProcessingProvider || !session}
							/>
							{#if providerData}
								<Button
									onclick={clearProviderData}
									variant="outline"
									size="sm"
									disabled={!session}
									class=""
								>
									Clear
								</Button>
							{/if}
						</div>
					</div>

					<!-- Processing Status -->
					{#if isProcessingProvider}
						<div class="flex items-center gap-2 text-sm text-blue-600">
							<Loader2 class="h-4 w-4 animate-spin" />
							Processing file...
						</div>
					{/if}

					<!-- Provider Error -->
					{#if providerError}
						<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
							<AlertCircle class="mr-2 inline h-4 w-4" />
							{providerError}
						</div>
					{/if}

					<!-- Provider Results -->
					{#if providerData}
						<div class="rounded-lg border border-green-200 bg-green-50 p-4">
							<div class="flex items-center gap-2">
								<span class="text-xl">
									{PROVIDER_INFO[providerData.provider]?.icon || '📄'}
								</span>
								<div>
									<div class="font-semibold text-green-900">
										✓ {PROVIDER_INFO[providerData.provider]?.name || 'Provider'} Import Successful
									</div>
									<div class="mt-1 text-sm text-green-700">
										{providerData.songs.length} songs processed
										{#if providerData.metadata?.totalSongs}
											• {providerData.metadata.totalSongs} total in file
										{/if}
									</div>
									{#if providerData.metadata?.roomName}
										<div class="mt-1 text-xs text-green-600">
											Room: {providerData.metadata.roomName}
										</div>
									{/if}
								</div>
							</div>
						</div>

						<!-- Add All Button -->
						<Button onclick={addAllProviderSongs} disabled={!session} class="w-full">
							<Download class="mr-2 h-4 w-4" />
							Add All Provider Songs ({providerData.songs.length} songs)
						</Button>
					{/if}
				</CardContent>
			</Card>

			<!-- Song Search & Discovery -->
			<Card class="">
				<CardHeader class="">
					<CardTitle class="flex items-center gap-2">
						<Search class="h-5 w-5" />
						Find & Add Songs
					</CardTitle>
					<CardDescription class=""
						>Search for songs and build your custom music lists</CardDescription
					>
				</CardHeader>
				<CardContent class="space-y-4">
					<!-- Search Mode Toggle -->
					<div class="flex gap-2">
						<Button
							variant={searchMode === 'global' ? 'default' : 'outline'}
							size="sm"
							onclick={() => {
								searchMode = 'global';
								unfilteredSearchResults = [];
								searchResults = [];
								showAllSearchResults = false;
							}}
							class="flex items-center gap-2"
							disabled={!session}
						>
							<Globe class="h-4 w-4" />
							Global Search
						</Button>
						<Button
							variant={searchMode === 'userlist' ? 'default' : 'outline'}
							size="sm"
							onclick={() => {
								searchMode = 'userlist';
								unfilteredSearchResults = [];
								searchResults = [];
								showAllSearchResults = false;
								if (importedUserList.length === 0) {
									toast.info('Import your anime list first using "Import from Profile" above');
								} else {
									// When switching back, show all imported songs
									unfilteredSearchResults = importedSongs;
									searchResults = unfilteredSearchResults.filter(matchesSongTypes);
									toast.success(
										`Switched to User List mode. Showing ${searchResults.length} songs.`
									);
								}
							}}
							class="flex items-center gap-2"
							disabled={!session}
						>
							<UserCheck class="h-4 w-4" />
							User List ({importedSongs.length})
						</Button>
					</div>

					{#if searchMode === 'userlist' && searchResults.length > 0}
						<div class="flex gap-2">
							<Button
								variant="outline"
								onclick={addAllUserListSongs}
								disabled={isImporting || !session}
								class="flex items-center gap-2"
							>
								{#if isImporting}
									<Loader2 class="mr-2 h-4 w-4 animate-spin" />
									Adding songs...
								{:else}
									<Download class="mr-2 h-4 w-4" />
									Add All From User List ({searchResults.length} songs)
								{/if}
							</Button>
						</div>
					{/if}

					<!-- Song Type Filters -->
					<div>
						<Label class="mb-2 block text-sm font-medium">Song Types to Include</Label>
						<div class="flex flex-wrap gap-2">
							{#each Object.entries(selectedSongTypes) as [type, enabled]}
								<label class="flex items-center space-x-2">
									<Checkbox bind:checked={selectedSongTypes[type]} disabled={!session} class="" />
									<span class="text-sm capitalize">
										{type === 'opening'
											? 'Openings'
											: type === 'ending'
												? 'Endings'
												: 'Insert Songs'}
									</span>
								</label>
							{/each}
						</div>
					</div>

					<!-- Partial Search Toggle -->
					<div>
						<label class="flex items-center space-x-2">
							<Checkbox bind:checked={partialMatch} disabled={!session} class="" />
							<span class="text-sm">Enable partial match search</span>
						</label>
						<p class="mt-1 text-xs text-gray-500">
							When enabled, searches will match partial text. When disabled, searches require exact
							matches.
						</p>
					</div>

					<!-- Search Inputs -->
					<div class="space-y-2">
						<div class="flex flex-wrap items-center gap-2">
							<Label class="font-semibold">Search by:</Label>
							{#each ['anime', 'artist', 'song', 'composer', 'season'] as type}
								<Button
									variant={searchBy === type ? 'default' : 'outline'}
									size="sm"
									onclick={() => (searchBy = type)}
									disabled={!session}
									class=""
								>
									{type.charAt(0).toUpperCase() + type.slice(1)}
								</Button>
							{/each}
						</div>

						{#if searchBy === 'anime'}
							<Input
								bind:value={animeSearch.query}
								placeholder="Enter anime title..."
								onkeydown={(e) => e.key === 'Enter' && handleSearch()}
								disabled={!session}
								type="text"
								class=""
							/>
						{:else if searchBy === 'artist'}
							<Input
								bind:value={artistSearch.query}
								placeholder="Enter artist name..."
								onkeydown={(e) => e.key === 'Enter' && handleSearch()}
								disabled={!session}
								type="text"
								class=""
							/>
						{:else if searchBy === 'song'}
							<Input
								bind:value={songNameSearch.query}
								placeholder="Enter song name..."
								onkeydown={(e) => e.key === 'Enter' && handleSearch()}
								disabled={!session}
								type="text"
								class=""
							/>
						{:else if searchBy === 'composer'}
							<Input
								bind:value={composerSearch.query}
								placeholder="Enter composer name..."
								onkeydown={(e) => e.key === 'Enter' && handleSearch()}
								disabled={!session}
								type="text"
								class=""
							/>
						{:else if searchBy === 'season'}
							<div class="grid grid-cols-2 gap-2">
								<Select
									value={seasonSearch.season}
									onValueChange={(val) => (seasonSearch.season = val)}
									disabled={!session}
									type="single"
								>
									<SelectTrigger class="">
										{seasonSearch.season}
									</SelectTrigger>
									<SelectContent class="" portalProps={{}}>
										<SelectItem value="Winter" label="Winter" class="">Winter</SelectItem>
										<SelectItem value="Spring" label="Spring" class="">Spring</SelectItem>
										<SelectItem value="Summer" label="Summer" class="">Summer</SelectItem>
										<SelectItem value="Fall" label="Fall" class="">Fall</SelectItem>
									</SelectContent>
								</Select>
								<Input
									type="number"
									bind:value={seasonSearch.year}
									placeholder="Year (e.g., 2024)"
									disabled={!session}
									class=""
								/>
							</div>
						{/if}
					</div>

					<Button onclick={handleSearch} disabled={isSearching || !session} class="w-full">
						{#if isSearching}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Searching...
						{:else}
							<Search class="mr-2 h-4 w-4" />
							{#if searchMode === 'global'}
								Search AnisongDB
							{:else}
								Filter List
							{/if}
						{/if}
					</Button>

					{#if searchError}
						<div class="text-sm text-red-600">{searchError}</div>
					{/if}

					{#if searchResults.length > 0}
						<div class="max-h-96 space-y-2 overflow-y-auto">
							{#each paginatedSearchResults as song}
								{@const animeName = formatAnimeName(song)}
								{@const isAddingSong =
									addingSongId === (song.annSongId || song.amqSongId || song.songName)}
								<div class="relative flex items-center justify-between rounded-lg border p-3">
									<div class="flex-1 overflow-hidden">
										<div class="w-full truncate text-left font-medium" title={animeName.full}>
											{animeName.primary}
											{#if animeName.secondary}
												<span class="text-sm text-gray-500"> ({animeName.secondary})</span>
											{/if}
										</div>
										<div
											class="w-full truncate text-left text-sm text-gray-600"
											title={song.songName}
										>
											{song.songName}
										</div>
										<div
											class="w-full truncate text-left text-xs text-gray-500"
											title={song.songArtist}
										>
											by {song.songArtist}
										</div>
									</div>
									<div class="absolute top-2 right-2 flex gap-1">
										{#if song.source === 'list'}
											<Badge variant="secondary" href="" class="">List</Badge>
										{:else if song.source === 'global'}
											<Badge variant="outline" class="border-black bg-black text-white" href="">
												Global
											</Badge>
										{/if}
										<Badge variant="default" href="" class=""
											>{formatSongType(song.songType) || 'N/A'}</Badge
										>
									</div>
									<div class="flex items-center gap-2 self-end">
										<Button
											size="sm"
											onclick={() => addSongToList(song)}
											disabled={!session || isAddingSong}
											class=""
											title={isAddingSong ? 'Adding...' : 'Add to list'}
										>
											{#if isAddingSong}
												<Loader2 class="h-4 w-4 animate-spin" />
											{:else}
												<Plus class="h-4 w-4" />
											{/if}
										</Button>
									</div>
								</div>
							{/each}

							{#if searchResults.length > 10 && !showAllSearchResults}
								<div class="pt-4 text-center">
									<Button
										variant="outline"
										onclick={() => (showAllSearchResults = true)}
										disabled={false}
										class=""
									>
										Load all {searchResults.length} results
									</Button>
								</div>
							{:else if searchResults.length > 10}
								<div class="pt-4 text-center">
									<Button
										variant="outline"
										onclick={() => (showAllSearchResults = false)}
										disabled={false}
										class=""
									>
										Show less
									</Button>
								</div>
							{/if}
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>

		<!-- Saved Lists & Current List -->
		<div class="space-y-6">
			<!-- Saved Lists -->
			{#if session}
				<Card class="">
					<CardHeader class="">
						<CardTitle class="flex items-center gap-2">
							<List class="h-5 w-5" />
							Saved Lists
						</CardTitle>
						<CardDescription class="">
							{#if savedLists.length > 0}
								Showing {(savedListsPage - 1) * savedListsPerPage + 1} -
								{Math.min(savedListsPage * savedListsPerPage, savedLists.length)} of {savedLists.length}
								lists
							{:else}
								Your previously saved song lists
							{/if}
						</CardDescription>
					</CardHeader>
					<CardContent class="">
						{#if isLoadingLists}
							<div class="py-4 text-center">Loading...</div>
						{:else if savedLists.length === 0}
							<div class="py-4 text-center text-gray-500">No saved lists yet</div>
						{:else}
							<div class="space-y-2">
								{#each paginatedSavedLists as list}
									<div class="flex items-center justify-between rounded border p-2">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2">
												<span class="truncate text-sm font-medium" title={list.name}>
													{list.name.length > 64 ? list.name.substring(0, 64) + '...' : list.name}
												</span>
											</div>
											<div class="mt-1 flex items-center gap-2 text-xs text-gray-600">
												<span class="text-gray-500">
													{list.is_public ? 'Public' : 'Private'}
												</span>
												<span
													>{list.song_count || 'unknown'} songs • {new Date(
														list.created_at
													).toLocaleDateString()}</span
												>
											</div>
										</div>
										<div class="flex items-center gap-1">
											<DropdownMenu.Root>
												<DropdownMenu.Trigger
													class="rounded p-1.5 transition-colors hover:bg-gray-200"
													title="More options"
												>
													<MoreVertical class="h-4 w-4 text-gray-600" />
												</DropdownMenu.Trigger>
												<DropdownMenu.Content class="p-1" portalProps={{}}>
													<DropdownMenu.Item
														class="-mx-6 cursor-pointer py-1.5"
														inset={false}
														onclick={() => openSettings(list)}
													>
														<Settings class="mr-2 h-4 w-4" />
														Settings
													</DropdownMenu.Item>
													<DropdownMenu.Item
														class="-mx-6 cursor-pointer py-1.5 text-red-600 hover:!text-red-600 focus:text-red-600"
														inset={false}
														onclick={() => openDeleteDialog(list.id)}
													>
														<Trash2 class="mr-2 h-4 w-4" />
														Delete
													</DropdownMenu.Item>
												</DropdownMenu.Content>
											</DropdownMenu.Root>
											<Button
												size="sm"
												variant="ghost"
												onclick={() => loadList(list)}
												disabled={false}
												class="ml-auto">Load</Button
											>
										</div>
									</div>
								{/each}
							</div>

							<!-- Pagination -->
							{#if savedListsTotalPages > 1}
								<div class="mt-4 flex justify-center">
									<Pagination.Root
										count={savedLists.length}
										perPage={savedListsPerPage}
										page={savedListsPage}
										siblingCount={1}
										onPageChange={(newPage) => (savedListsPage = newPage)}
										class=""
									>
										{#snippet children({ pages, currentPage })}
											<Pagination.Content class="">
												<Pagination.Item class="">
													<Pagination.PrevButton class="">
														<ChevronLeft class="size-4" />
														<span class="hidden sm:block">Previous</span>
													</Pagination.PrevButton>
												</Pagination.Item>
												{#each pages as page (page.key)}
													{#if page.type === 'ellipsis'}
														<Pagination.Item class="">
															<Pagination.Ellipsis class="" />
														</Pagination.Item>
													{:else}
														<Pagination.Item class="">
															<Pagination.Link
																{page}
																isActive={currentPage === page.value}
																class=""
															>
																{page.value}
															</Pagination.Link>
														</Pagination.Item>
													{/if}
												{/each}
												<Pagination.Item class="">
													<Pagination.NextButton class="">
														<span class="hidden sm:block">Next</span>
														<ChevronRight class="size-4" />
													</Pagination.NextButton>
												</Pagination.Item>
											</Pagination.Content>
										{/snippet}
									</Pagination.Root>
								</div>
							{/if}
						{/if}
					</CardContent>
				</Card>
			{:else}
				<Card class="">
					<CardContent class="py-8 text-center">
						<p class="mb-4 text-gray-600">Sign in to save and manage your song lists</p>
						<form action="/auth?/discord" method="POST">
							<Button type="submit" disabled={false} class="">Sign In with Discord</Button>
						</form>
					</CardContent>
				</Card>
			{/if}

			<!-- Current Song List -->
			<Card class="">
				<CardHeader class="">
					<CardTitle class="flex items-center gap-2">
						<Music class="h-5 w-5" />
						Current List ({currentSongList.length} songs)
					</CardTitle>
					<CardDescription class="">Songs in your current list</CardDescription>
					{#if currentEditToken}
						<div
							class="mt-2 rounded-md border border-blue-300 bg-blue-50 p-2 text-sm text-blue-800"
						>
							<p>
								<strong class="font-semibold">Shared Editing Mode:</strong> You are editing a shared list. Changes will affect the original list.
							</p>
						</div>
					{/if}
					{#if isListMixed}
						<div
							class="mt-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800"
						>
							<p>
								<strong class="font-semibold">Warning:</strong> This list contains songs from Global
								Search. For compatibility, personal data (like scores) from your user list will not be
								used in filtering or other features for this mixed list.
							</p>
						</div>
					{/if}
				</CardHeader>
				<CardContent class="space-y-4">
					{#if session}
						<div class="flex items-center gap-2">
							<Button onclick={openSaveDialog} disabled={isSaving} class="flex-1">
								<Save class="mr-2 h-4 w-4" />
								Save List
							</Button>
							<Button
								variant="outline"
								onclick={openClearDialog}
								size="icon"
								disabled={currentSongList.length === 0}
								aria-label="Clear list"
								class=""
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					{/if}

					<Separator class="" />

					{#if currentSongList.length === 0}
						<div class="py-8 text-center text-gray-500">
							<Music class="mx-auto mb-2 h-12 w-12 opacity-50" />
							<p>No songs added yet</p>
						</div>
					{:else}
						<div class="max-h-96 space-y-2 overflow-y-auto">
							{#each displayedSongs as song}
								{@const animeName = formatAnimeName(song)}
								<div class="relative flex items-center justify-between rounded border p-2">
									<div class="min-w-0 flex-1 overflow-hidden">
										<div class="w-full truncate text-left font-medium" title={animeName.full}>
											{animeName.primary}
											{#if animeName.secondary}
												<span class="text-sm text-gray-500"> ({animeName.secondary})</span>
											{/if}
										</div>
										<div
											class="w-full truncate text-left text-sm text-gray-600"
											title={song.songName}
										>
											{song.songName}
										</div>
										<div
											class="w-full truncate text-left text-xs text-gray-500"
											title={song.songArtist}
										>
											{song.songArtist}
										</div>
										{#if (song.sampleRanges && song.sampleRanges.length > 0) || song.guessTime !== undefined || /** @type {any} */ (song).extraGuessTime !== undefined || (() => {
												const ps = /** @type {any} */ (song).playbackSpeed;
												return ps && ((ps.mode === 'static' && ps.staticValue !== 1.0) || (ps.mode === 'random' && ps.randomValues && (ps.randomValues.length > 1 || (ps.randomValues.length === 1 && ps.randomValues[0] !== 1.0))));
											})()}
											{@const enrichedSong = /** @type {any} */ (song)}
											{@const playbackSpeed = enrichedSong.playbackSpeed}
											<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-blue-600">
												{#if song.sampleRanges && song.sampleRanges.length > 0}
													{#if song.sampleRanges.length === 1}
														{@const range = song.sampleRanges[0]}
														<span>
															Sample: {range.start.toFixed(1)}s - {range.end.toFixed(1)}s
															{#if range.randomStartPosition}
																<span class="ml-1 text-xs text-gray-500">Random Start</span>
															{/if}
														</span>
													{:else}
														<span>Sample: {song.sampleRanges.length} ranges</span>
													{/if}
												{/if}
												{#if song.guessTime !== undefined && song.guessTime !== null}
													<span>
														{#if typeof song.guessTime === 'object' && song.guessTime !== null && song.guessTime.useRange}
															Guess: {song.guessTime.min}-{song.guessTime.max}s
														{:else if typeof song.guessTime === 'number'}
															Guess: {song.guessTime.toFixed(1)}s
														{/if}
														{#if enrichedSong.extraGuessTime !== undefined && enrichedSong.extraGuessTime !== null}
															{#if typeof enrichedSong.extraGuessTime === 'object' && enrichedSong.extraGuessTime !== null && enrichedSong.extraGuessTime.useRange}
																+ {enrichedSong.extraGuessTime.min}-{enrichedSong.extraGuessTime.max}s
															{:else if typeof enrichedSong.extraGuessTime === 'number' && enrichedSong.extraGuessTime > 0}
																+ {enrichedSong.extraGuessTime.toFixed(1)}s
															{/if}
														{/if}
													</span>
												{:else if enrichedSong.extraGuessTime !== undefined && enrichedSong.extraGuessTime !== null}
													<span>
														{#if typeof enrichedSong.extraGuessTime === 'object' && enrichedSong.extraGuessTime !== null && enrichedSong.extraGuessTime.useRange}
															Extra Guess: {enrichedSong.extraGuessTime.min}-{enrichedSong.extraGuessTime.max}s
														{:else if typeof enrichedSong.extraGuessTime === 'number' && enrichedSong.extraGuessTime > 0}
															Extra Guess: {enrichedSong.extraGuessTime.toFixed(1)}s
														{/if}
													</span>
												{/if}
												{#if playbackSpeed}
													{@const speed = playbackSpeed}
													{#if speed.mode === 'random' && speed.randomValues && speed.randomValues.length > 1}
														{@const speedLabels = speed.randomValues.map((v) => {
															if (v === 1.0) return '1x';
															if (v === 1.5) return '1.5x';
															if (v === 2.0) return '2x';
															if (v === 4.0) return '4x';
															return `${v}x`;
														})}
														<span>({speedLabels.join(', ')})</span>
													{:else if speed.mode === 'static' && speed.staticValue !== 1.0}
														{@const speedLabel =
															speed.staticValue === 1.5
																? '1.5x'
																: speed.staticValue === 2.0
																	? '2x'
																	: speed.staticValue === 4.0
																		? '4x'
																		: `${speed.staticValue}x`}
														<span>({speedLabel})</span>
													{:else if speed.mode === 'random' && speed.randomValues && speed.randomValues.length === 1 && speed.randomValues[0] !== 1.0}
														{@const speedLabel =
															speed.randomValues[0] === 1.5
																? '1.5x'
																: speed.randomValues[0] === 2.0
																	? '2x'
																	: speed.randomValues[0] === 4.0
																		? '4x'
																		: `${speed.randomValues[0]}x`}
														<span>({speedLabel})</span>
													{/if}
												{/if}
											</div>
										{/if}
									</div>
									<div class="absolute top-2 right-2 flex gap-1">
										{#if song.source === 'list'}
											<Badge variant="secondary" class="h-5 text-xs" href="">List</Badge>
										{:else if song.source === 'global'}
											<Badge variant="default" class="h-5 text-xs" href="">Global</Badge>
										{/if}
										<Badge
											variant="outline"
											class="h-5 border-black bg-black text-xs text-white"
											href=""
										>
											{formatSongType(song.songType)}
										</Badge>
									</div>
									<div class="flex items-center gap-1 self-end">
										<Button
											size="sm"
											variant="ghost"
											onclick={() => openSampleRangeDialog(song)}
											disabled={!session}
											title="Configure song settings"
											class=""
										>
											<Film class="h-3 w-3" />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onclick={() => removeSongFromList(song)}
											disabled={!session}
											title="Remove from list"
											class=""
										>
											<Trash2 class="h-3 w-3" />
										</Button>
									</div>
								</div>
							{/each}

							{#if hasMoreSongs}
								<div class="pt-4 text-center">
									<Button
										variant="outline"
										onclick={() => (currentListShowAll = true)}
										disabled={false}
										class=""
									>
										Load all {currentSongList.length} songs
									</Button>
								</div>
							{:else if currentSongList.length > 50}
								<div class="pt-4 text-center">
									<Button
										variant="outline"
										onclick={() => (currentListShowAll = false)}
										disabled={false}
										class=""
									>
										Show less
									</Button>
								</div>
							{/if}
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</div>

<!-- Save Dialog -->
<Dialog bind:open={isSaveDialogOpen}>
	<DialogContent class="max-w-md overflow-hidden" portalProps={{}}>
		<DialogHeader class="">
			<DialogTitle class="">Save Song List</DialogTitle>
			<DialogDescription class="">
				Enter a name and optional description for your song list.
			</DialogDescription>
		</DialogHeader>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				if (!isSaving && listName.trim()) {
					saveList();
				}
			}}
		>
			<div class="space-y-4 overflow-hidden py-4">
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label for="save-name" class="">List Name *</Label>
						<span class="text-xs text-gray-500">{listName.length}/64</span>
					</div>
					<Input
						id="save-name"
						bind:value={listName}
						placeholder="My Awesome List"
						required
						type="text"
						class=""
						maxlength="64"
					/>
				</div>
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<Label for="save-description" class="">Description</Label>
						<span class="text-xs text-gray-500">{listDescription.length}/512</span>
					</div>
					<Textarea
						id="save-description"
						bind:value={listDescription}
						placeholder="Add a description for your list..."
						rows="3"
						class="overflow-wrap-break w-full min-w-0 break-words"
						maxlength="512"
						style="overflow-wrap: break-word; word-wrap: break-word; word-break: break-word;"
					/>
				</div>
			</div>
			<DialogFooter class="">
				<Button
					type="button"
					variant="outline"
					onclick={() => (isSaveDialogOpen = false)}
					disabled={false}
					class="">Cancel</Button
				>
				<Button type="submit" disabled={isSaving} class="">
					{#if isSaving}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						Saving...
					{:else}
						<Save class="mr-2 h-4 w-4" />
						Save List
					{/if}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>

<!-- Settings Dialog -->
<Dialog bind:open={isSettingsDialogOpen}>
	<DialogContent class="max-w-md overflow-hidden" portalProps={{}}>
		<DialogHeader class="">
			<DialogTitle class="">Edit List Settings</DialogTitle>
			<DialogDescription class="">
				Change the name, description, and visibility of your song list.
			</DialogDescription>
		</DialogHeader>
		<div class="space-y-4 overflow-hidden py-4">
			<div class="space-y-2">
				<Label for="settings-name" class="">Name</Label>
				<Input id="settings-name" bind:value={settingsListName} type="text" class="" />
			</div>
			<div class="space-y-2">
				<Label for="settings-description" class="">Description</Label>
				<Textarea
					id="settings-description"
					bind:value={settingsDescription}
					placeholder="Add a description for your list..."
					rows="3"
					class="overflow-wrap-break w-full min-w-0 break-words"
					maxlength="512"
					style="overflow-wrap: break-word; word-wrap: break-word; word-break: break-word;"
				/>
			</div>
			<div class="flex items-center space-x-2">
				<Switch id="public-switch" bind:checked={settingsIsPublic} class="" />
				<Label for="public-switch" class="">Make list public</Label>
			</div>
		</div>
		<DialogFooter class="">
			<Button
				variant="outline"
				onclick={() => (isSettingsDialogOpen = false)}
				disabled={false}
				class="">Cancel</Button
			>
			<Button onclick={saveListSettings} disabled={false} class="">Save Changes</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Overwrite Confirmation Dialog -->
<AlertDialog.Root bind:open={showOverwriteDialog}>
	<AlertDialog.Content
		class=""
		portalProps={{}}
		onkeydown={(e) => {
			if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				confirmOverwrite();
			}
		}}
	>
		<AlertDialog.Header class="">
			<AlertDialog.Title class="">Overwrite Existing List?</AlertDialog.Title>
			<AlertDialog.Description class="">
				A list with the name "{listName}" already exists. Do you want to overwrite it with the
				current list? This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer class="">
			<AlertDialog.Cancel class="">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="" onclick={confirmOverwrite}>Overwrite</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Clear List Confirmation Dialog -->
<AlertDialog.Root bind:open={showClearListDialog}>
	<AlertDialog.Content class="" portalProps={{}}>
		<AlertDialog.Header class="">
			<AlertDialog.Title class="">Clear Current List?</AlertDialog.Title>
			<AlertDialog.Description class="">
				Are you sure you want to clear the current list? This will remove all {currentSongList.length}
				songs. This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer class="">
			<AlertDialog.Cancel class="">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="" onclick={clearList}>Clear List</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Delete List Confirmation Dialog -->
<AlertDialog.Root bind:open={showDeleteListDialog}>
	<AlertDialog.Content class="" portalProps={{}}>
		<AlertDialog.Header class="">
			<AlertDialog.Title class="">Delete List?</AlertDialog.Title>
			<AlertDialog.Description class="">
				Are you sure you want to delete this list? This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer class="">
			<AlertDialog.Cancel class="">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="" onclick={deleteList}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Sample Range Dialog -->
<SampleRangeDialog
	bind:open={sampleRangeDialogOpen}
	bind:song={selectedSongForEditing}
	onSave={handleSongUpdate}
/>

<style>
	:global(.overflow-wrap-break) {
		overflow-wrap: break-word;
		word-wrap: break-word;
		-webkit-hyphens: auto;
		hyphens: auto;
	}
</style>
