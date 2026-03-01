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
	import * as Table from '$lib/components/ui/table';
	import {
		createSvelteTable,
		getCoreRowModel,
		getFilteredRowModel,
		getSortedRowModel,
		getPaginationRowModel,
		FlexRender
	} from '$lib/components/ui/data-table';
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
		ChevronUp,
		ChevronDown,
		ChevronsUpDown,
		RefreshCw,
		Clock,
		Film,
		AlertCircle,
		MoreVertical,
		Columns3
	} from 'lucide-svelte';
	// @ts-ignore
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/stores';
	import { fetchAnimeMetadata } from '$lib/utils/anilist.js';
	import {
		processProviderData,
		processAnnSongIdsFromList,
		PROVIDER_INFO
	} from '$lib/utils/providerUtils.js';
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
	let isSearching = $state(false);
	/** @type {AnisongDBSong[]} */
	let searchResults = $state([]);
	/** @type {AnisongDBSong[]} */
	let unfilteredSearchResults = $state([]); // Store unfiltered results for reactive filtering
	let searchMode = $state('global'); // 'global' or 'userlist'
	let searchError = $state(null);

	// Search criteria
	let searchBy = $state('anime'); // 'anime', 'artist', 'song', 'composer', 'season'
	let searchQuery = $state('');
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
	let providerFileInput = $state(null);
	let isProcessingProvider = $state(false);
	let providerError = $state(null);
	let providerData = $state(null); // Store processed provider data
	let annSongIdsOnly = $state(false);
	let annSongIdsText = $state('');
	let trustProviderJson = $state(false); // Skip AnisongDB/AniList, trust JSON has full data
	let providerAdvancedOpen = $state(false);

	// Computed: paginated search results
	let paginatedSearchResults = $derived(
		showAllSearchResults ? searchResults : searchResults.slice(0, 10)
	);

	// Song list state
	/** @type {EnrichedSong[]} */
	let currentSongList = $state([]);
	let listName = $state('');
	let listDescription = $state('');
	let listIsPublic = $state(false);
	let savedLists = $state([]);
	let isLoadingLists = $state(false);
	let isSaving = $state(false);
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

	const duplicateAnnSongIds = $derived.by(() => {
		const counts = new Map();
		for (const s of currentSongList) {
			if (s.annSongId) counts.set(s.annSongId, (counts.get(s.annSongId) || 0) + 1);
		}
		const dups = new Set();
		for (const [id, count] of counts) {
			if (count > 1) dups.add(id);
		}
		return dups;
	});


	// Utility panel visibility state (all collapsed by default)
	let utilityPanelOpen = $state({
		profile: false,
		provider: false,
		search: false,
		saved: false
	});

	// Current list table state
	let currentListSorting = $state([]);
	let currentListColumnFilters = $state([]);
	let currentListColumnVisibility = $state({});
	let currentListPagination = $state({ pageIndex: 0, pageSize: 20 });
	let currentListColumnSizing = $state({});
	let currentListColumnSizingInfo = $state({});
	let currentListSearchQuery = $state('');
	let currentListSourceFilter = $state('all');
	let currentListTypeFilter = $state('all');
	// Only include actual filter criteria - NOT list length, so deleting songs preserves pagination
	let currentListFilterSignature = $derived(
		`${currentListSearchQuery}|${currentListSourceFilter}|${currentListTypeFilter}`
	);
	let previousCurrentListFilterSignature = $state('');

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
	 * Toggle a utility panel while keeping others collapsed.
	 * @param {'profile'|'provider'|'search'|'saved'} panelKey
	 */
	function toggleUtilityPanel(panelKey) {
		const shouldOpen = !utilityPanelOpen[panelKey];
		utilityPanelOpen = {
			profile: false,
			provider: false,
			search: false,
			saved: false,
			[panelKey]: shouldOpen
		};
	}

	/**
	 * @param {EnrichedSong} song
	 * @returns {'opening'|'ending'|'insert'|'other'}
	 */
	function getSongTypeKey(song) {
		const type = String(song.songType || '').toLowerCase();
		if (type.includes('opening')) return 'opening';
		if (type.includes('ending')) return 'ending';
		if (type.includes('insert')) return 'insert';
		return 'other';
	}

	/**
	 * @param {EnrichedSong} song
	 * @returns {string}
	 */
	function getSongConfigSummary(song) {
		const details = [];
		if (song.sampleRanges?.length) {
			if (song.sampleRanges.length === 1) {
				const range = song.sampleRanges[0];
				// If randomStartPosition is false, it's a static start point, not a range
				if (range.randomStartPosition === false) {
					details.push(`Sample @ ${range.start.toFixed(1)}s`);
				} else {
					details.push(
						`Sample ${range.start.toFixed(1)}-${range.end.toFixed(1)}s (random)`
					);
				}
			} else {
				details.push(`Sample ${song.sampleRanges.length} ranges`);
			}
		}

		const enrichedSong = /** @type {any} */ (song);
		const guessTime = enrichedSong.guessTime;
		const extraGuessTime = enrichedSong.extraGuessTime;
		if (guessTime !== undefined && guessTime !== null) {
			if (typeof guessTime === 'object' && guessTime.useRange) {
				details.push(`Guess ${guessTime.min}-${guessTime.max}s`);
			} else if (typeof guessTime === 'number') {
				details.push(`Guess ${guessTime.toFixed(1)}s`);
			}
		}
		if (extraGuessTime !== undefined && extraGuessTime !== null) {
			if (typeof extraGuessTime === 'object' && extraGuessTime.useRange) {
				details.push(`Extra ${extraGuessTime.min}-${extraGuessTime.max}s`);
			} else if (typeof extraGuessTime === 'number' && extraGuessTime > 0) {
				details.push(`Extra ${extraGuessTime.toFixed(1)}s`);
			}
		}

		const playbackSpeed = enrichedSong.playbackSpeed;
		if (playbackSpeed) {
			if (
				playbackSpeed.mode === 'random' &&
				playbackSpeed.randomValues &&
				playbackSpeed.randomValues.length > 0
			) {
				const randomValues = playbackSpeed.randomValues.map((speed) => `${speed}x`);
				details.push(`Speed ${randomValues.join(', ')}`);
			} else if (playbackSpeed.mode === 'static' && playbackSpeed.staticValue !== 1.0) {
				details.push(`Speed ${playbackSpeed.staticValue}x`);
			}
		}

		return details.join(' • ');
	}

	let currentListTableData = $derived.by(() => {
		const query = currentListSearchQuery.trim().toLowerCase();
		return currentSongList.filter((song) => {
			if (query) {
				const animeRomaji = song.animeRomajiName || song.animeJPName || '';
				const animeEnglish = song.animeENName || song.animeEnglishName || '';
				const combinedSearch =
					`${animeRomaji} ${animeEnglish} ${song.songName || ''} ${song.songArtist || ''}`
						.toLowerCase()
						.trim();
				if (!combinedSearch.includes(query)) {
					return false;
				}
			}

			if (
				currentListSourceFilter !== 'all' &&
				(song.source || 'unknown') !== currentListSourceFilter
			) {
				return false;
			}

			if (currentListTypeFilter !== 'all' && getSongTypeKey(song) !== currentListTypeFilter) {
				return false;
			}

			return true;
		});
	});

	function getCurrentListColumnSizingStorageKey() {
		return 'songlist-create-column-sizes';
	}

	function withStopPropagation(handler) {
		return (event) => {
			event.stopPropagation();
			handler(event);
		};
	}

	const currentListColumns = [
		{
			id: 'song',
			header: 'Song',
			size: 200,
			minSize: 100,
			maxSize: 400,
			accessorFn: (row) => row.songName || '',
			cell: (info) => {
				const songName = info.getValue() || 'Untitled';
				return `<span class="block truncate text-sm font-medium text-gray-900" style="max-width: 100%;" title="${songName}">${songName}</span>`;
			}
		},
		{
			id: 'artist',
			header: 'Artist',
			size: 180,
			minSize: 100,
			maxSize: 350,
			accessorFn: (row) => row.songArtist || '',
			cell: (info) => {
				const artist = info.getValue() || 'Unknown';
				return `<span class="block truncate text-sm text-gray-700" style="max-width: 100%;" title="${artist}">${artist}</span>`;
			}
		},
		{
			id: 'annSongId',
			header: 'annSongId',
			size: 110,
			minSize: 80,
			maxSize: 200,
			accessorFn: (row) => row.annSongId || row.amqSongId || '',
			cell: (info) => {
				const id = info.getValue() || '';
				return `<span class="text-sm text-gray-600">${id}</span>`;
			},
			sortingFn: (rowA, rowB) => {
				const idA = rowA.original.annSongId || rowA.original.amqSongId || '';
				const idB = rowB.original.annSongId || rowB.original.amqSongId || '';
				const numA = Number(idA) || 0;
				const numB = Number(idB) || 0;
				return numA - numB;
			}
		},
		{
			id: 'animeRomaji',
			header: 'Anime (Romaji)',
			size: 200,
			minSize: 100,
			maxSize: 400,
			accessorFn: (row) => row.animeRomajiName || row.animeJPName || '',
			cell: (info) => {
				const romaji = info.getValue() || '—';
				return `<span class="block truncate text-sm text-gray-700" style="max-width: 100%;" title="${romaji}">${romaji}</span>`;
			}
		},
		{
			id: 'animeEnglish',
			header: 'Anime (English)',
			size: 200,
			minSize: 100,
			maxSize: 400,
			accessorFn: (row) => row.animeENName || row.animeEnglishName || '',
			cell: (info) => {
				const english = info.getValue() || '—';
				return `<span class="block truncate text-sm text-gray-700" style="max-width: 100%;" title="${english}">${english}</span>`;
			}
		},
		{
			id: 'type',
			header: 'Type',
			size: 70,
			minSize: 50,
			maxSize: 100,
			accessorFn: (row) => formatSongType(row.songType || ''),
			cell: (info) => {
				const value = info.getValue() || 'N/A';
				return `<span class="text-xs font-medium text-gray-700">${value}</span>`;
			}
		},
		{
			id: 'source',
			header: 'Source',
			size: 90,
			minSize: 60,
			maxSize: 120,
			accessorFn: (row) => row.source || 'unknown',
			cell: (info) => {
				const source = info.getValue();
				const css =
					source === 'list'
						? 'bg-gray-200 text-gray-800'
						: source === 'global'
							? 'bg-black text-white'
							: source === 'provider'
								? 'bg-purple-100 text-purple-800'
								: 'bg-gray-100 text-gray-700';
				return `<span class="inline-flex rounded px-2 py-1 text-xs font-medium ${css}">${source}</span>`;
			}
		},
		{
			id: 'config',
			header: 'Settings',
			size: 180,
			minSize: 100,
			maxSize: 350,
			accessorFn: (row) => getSongConfigSummary(row),
			cell: (info) => {
				const configSummary = info.getValue();
				if (!configSummary) {
					return '<span class="text-xs text-gray-400">Defaults</span>';
				}
				return `<span class="line-clamp-2 text-xs text-blue-700">${configSummary}</span>`;
			}
		},
		{
			id: 'actions',
			header: 'Actions',
			size: 90,
			minSize: 60,
			maxSize: 110,
			enableSorting: false,
			enableResizing: false,
			cell: () => ''
		}
	];

	const currentListTable = createSvelteTable({
		get data() {
			return currentListTableData;
		},
		columns: currentListColumns,
		columnResizeMode: 'onChange',
		autoResetPageIndex: false,
		state: {
			get sorting() {
				return currentListSorting;
			},
			get columnFilters() {
				return currentListColumnFilters;
			},
			get columnVisibility() {
				return currentListColumnVisibility;
			},
			get pagination() {
				return currentListPagination;
			},
			get columnSizing() {
				return currentListColumnSizing;
			},
			get columnSizingInfo() {
				return currentListColumnSizingInfo;
			}
		},
		onSortingChange: (updater) => {
			if (typeof updater === 'function') {
				currentListSorting = updater(currentListSorting);
			} else {
				currentListSorting = updater;
			}
		},
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				currentListColumnFilters = updater(currentListColumnFilters);
			} else {
				currentListColumnFilters = updater;
			}
		},
		onColumnVisibilityChange: (updater) => {
			if (typeof updater === 'function') {
				currentListColumnVisibility = updater(currentListColumnVisibility);
			} else {
				currentListColumnVisibility = updater;
			}
		},
		onPaginationChange: (updater) => {
			if (typeof updater === 'function') {
				currentListPagination = updater(currentListPagination);
			} else {
				currentListPagination = updater;
			}
		},
		onColumnSizingChange: (updater) => {
			if (typeof updater === 'function') {
				currentListColumnSizing = updater(currentListColumnSizing);
			} else {
				currentListColumnSizing = updater;
			}
		},
		onColumnSizingInfoChange: (updater) => {
			if (typeof updater === 'function') {
				currentListColumnSizingInfo = updater(currentListColumnSizingInfo);
			} else {
				currentListColumnSizingInfo = updater;
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	});

	$effect(() => {
		if (currentListFilterSignature !== previousCurrentListFilterSignature) {
			previousCurrentListFilterSignature = currentListFilterSignature;
			currentListPagination = {
				pageIndex: 0,
				pageSize: currentListPagination.pageSize
			};
		}
	});

	// Preserve pagination when table data shrinks (e.g. after removing a song) - clamp to valid page
	$effect(() => {
		const rowCount = currentListTableData.length;
		const pageSize = currentListPagination.pageSize;
		const pageCount = rowCount === 0 ? 1 : Math.ceil(rowCount / pageSize);
		if (pageCount > 0 && currentListPagination.pageIndex >= pageCount) {
			currentListPagination = {
				...currentListPagination,
				pageIndex: Math.max(0, pageCount - 1)
			};
		}
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem(
				getCurrentListColumnSizingStorageKey(),
				JSON.stringify(currentListColumnSizing)
			);
		} catch (error) {
			console.warn('Failed to persist column sizing', error);
		}
	});

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
		utilityPanelOpen = { profile: false, provider: false, search: true, saved: false };

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

	/**
	 * Validate season search and return season string
	 * @returns {string | null} Season string (e.g., "Fall 2023") or null if invalid
	 */
	function getValidatedSeasonQuery() {
		const year = parseInt(String(seasonSearch.year), 10);
		if (isNaN(year) || year.toString().length !== 4) {
			toast.error('Invalid year. Please use a 4-digit year.');
			return null;
		}
		const validSeasons = ['Winter', 'Spring', 'Summer', 'Fall'];
		if (!validSeasons.includes(seasonSearch.season)) {
			toast.error("Invalid season. Please use 'Winter', 'Spring', 'Summer', or 'Fall'.");
			return null;
		}
		return `${seasonSearch.season} ${year}`;
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
		let query = searchQuery.trim().toLowerCase();
		let seasonQuery = null;
		if (searchBy === 'season') {
			const validatedSeason = getValidatedSeasonQuery();
			if (!validatedSeason) {
				return;
			}
			seasonQuery = validatedSeason.toLowerCase();
		}

		if (!query && searchBy !== 'season') {
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
			} else if (searchBy === 'season') {
				const vintage = (song.animeVintage || '').toLowerCase();
				return vintage.includes(seasonQuery || '');
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
			let searchUrl = 'https://anisongdb.com/api/search_request';

			switch (searchBy) {
				case 'anime':
					searchFilter = {
						anime_search_filter: {
							search: searchQuery,
							partial_match: partialMatch
						}
					};
					if (!searchQuery.trim()) {
						toast.error('Please enter an anime title.');
						return;
					}
					break;
				case 'artist':
					searchFilter = {
						artist_search_filter: {
							search: searchQuery,
							partial_match: partialMatch,
							group_granularity: 0,
							max_other_artist: 99
						}
					};
					if (!searchQuery.trim()) {
						toast.error('Please enter an artist name.');
						return;
					}
					break;
				case 'song':
					searchFilter = {
						song_name_search_filter: { search: searchQuery, partial_match: partialMatch }
					};
					if (!searchQuery.trim()) {
						toast.error('Please enter a song name.');
						return;
					}
					break;
				case 'composer':
					searchFilter = {
						composer_search_filter: {
							search: searchQuery,
							partial_match: partialMatch,
							arrangement: false
						}
					};
					if (!searchQuery.trim()) {
						toast.error('Please enter a composer name.');
						return;
					}
					break;
				case 'season': {
					const validatedSeason = getValidatedSeasonQuery();
					if (!validatedSeason) {
						return;
					}
					searchFilter = { season: validatedSeason };
					requiresQuery = false;
					searchUrl = 'https://anisongdb.com/api/season_request';
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

			const response = await fetch(searchUrl, {
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
	 * Check if a song is a duplicate of one already in the list
	 * Matches only based on the unique annSongId from the payload.
	 * @param {EnrichedSong} song - Song to check
	 * @param {EnrichedSong[]} list - Current list
	 * @returns {boolean}
	 */
	function isDuplicateSong(song, list) {
		return list.some((s) => s.annSongId && song.annSongId && s.annSongId === song.annSongId);
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

			if (isDuplicateSong(song, currentSongList)) {
				toast.warning(`"${song.songName}" is already in the list — adding as duplicate`);
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
					enrichWithAnisongDB: !trustProviderJson,
					skipExternalFetching: trustProviderJson,
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
		annSongIdsText = '';
		if (providerFileInput) {
			providerFileInput.value = '';
		}
	}

	// Import from annSongIds list (one per line)
	/**
	 * Process pasted annSongIds and fetch songs from AnisongDB
	 * @returns {Promise<void>}
	 */
	async function handleAnnSongIdsImport() {
		const text = annSongIdsText.trim();
		if (!text) {
			providerError = 'Please paste at least one annSongId.';
			return;
		}

		isProcessingProvider = true;
		providerError = null;

		try {
			const result = await processAnnSongIdsFromList(text, {
				onProgress: (eta) => console.log(`AnisongDB fetch ETA: ${eta}s`)
			});

			if (result.error) {
				providerError = result.error;
				isProcessingProvider = false;
				return;
			}

			providerData = result;
			isProcessingProvider = false;
			toast.success(
				`Successfully fetched ${result.songs.length} songs from AnisongDB (${result.metadata?.requestedIds || 0} annSongIds)`
			);
		} catch (error) {
			providerError = `Failed to import annSongIds: ${error.message}`;
			isProcessingProvider = false;
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
		const songsToAdd = providerData.songs.filter((song) => !isDuplicateSong(song, currentSongList));

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
						processedSong.sampleRanges = song.sampleRanges.map((range) => ({
							randomStartPosition: false,
							...range
						}));
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

	/**
	 * Add all search results to current list (works for both global and userlist modes)
	 * @returns {Promise<void>}
	 */
	async function addAllSearchResults() {
		if (searchResults.length === 0) {
			toast.error('No search results to add. Run a search first.');
			return;
		}

		isImporting = true;
		let addedCount = 0;
		const songsToAdd = searchResults.filter((song) => !isDuplicateSong(song, currentSongList));

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
						processedSong.sampleRanges = song.sampleRanges.map((range) => ({
							randomStartPosition: false,
							...range
						}));
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

			toast.success(`Added ${addedCount} songs from search results.`);
		} catch (error) {
			console.error('Error adding songs from search results:', error);
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
			const creatorUsername =
				user?.user_metadata?.custom_claims?.global_name ||
				data.publicList?.creator_username ||
				'Anonymous';

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
					edit_token: currentEditToken, // Pass edit token if available
					is_public: listIsPublic
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
					processedSong.sampleRanges = song.sampleRanges.map((range) => ({
						randomStartPosition: false,
						...range
					}));
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
			listDescription = list.description || '';
			listIsPublic = list.is_public || false;

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
			listName = settingsListName;
			listDescription = settingsDescription || '';
			listIsPublic = settingsIsPublic;
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
					processedSong.sampleRanges = song.sampleRanges.map((range) => ({
						randomStartPosition: false,
						...range
					}));
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
				listDescription = result.description || '';
				listIsPublic = result.is_public || false;
			} else if (savedLists.length > 0) {
				const list = savedLists.find((l) => l.id === listId);
				if (list) {
					listName = list.name;
					listDescription = list.description || '';
					listIsPublic = list.is_public || false;
				}
			}

			toast.success(`Loaded list with ${currentSongList.length} songs`);
		} catch (error) {
			console.error('Error loading list:', error);
			toast.error(`Error loading list: ${error.message}`);
		}
	}

	// Load saved lists and column sizing on mount
	onMount(async () => {
		if (typeof window !== 'undefined') {
			try {
				const storedSizing = localStorage.getItem(getCurrentListColumnSizingStorageKey());
				if (storedSizing) {
					const parsed = JSON.parse(storedSizing);
					if (parsed && typeof parsed === 'object') {
						currentListColumnSizing = parsed;
					}
				}
			} catch (error) {
				console.warn('Failed to load column sizing', error);
			}
		}
		if (session) {
			await loadSavedLists();
		}

		// Check for view/edit tokens handled by server
		if (data.publicList) {
			// Process the loaded songs
			let loadedSongs = [];
			if (data.publicList.songs && data.publicList.songs.length > 0) {
				loadedSongs = data.publicList.songs.map((s) => {
					// Preserve persisted source; only default legacy entries to global.
					let processedSong = { ...s, source: s.source || 'global' };

					// Only preserve sampleRanges if they already exist
					if (s.sampleRanges && Array.isArray(s.sampleRanges) && s.sampleRanges.length > 0) {
						processedSong.sampleRanges = s.sampleRanges.map((range) => ({
							randomStartPosition: false,
							...range
						}));
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
				listIsPublic = data.publicList.is_public || false;
				toast.success(`Loaded "${data.publicList.name}" for editing (via shared link)`);
			}
			// Handle View Token Mode (data.isViewOnly)
			else if (data.isViewOnly) {
				listName = `Copy of ${data.publicList.name}`;
				listDescription = data.publicList.description || '';
				listIsPublic = false; // Copies start as private
				toast.info(`Loaded "${data.publicList.name}" (View Only) - Save to create your own copy`);
			}
			// Handle standard fromList / public list loading
			else {
				// Differentiate loading behavior between own lists and public remix sources.
				const isOwnedByCurrentUser = data.publicList.is_owned_by_current_user === true;
				const isPublicList = data.publicList.is_public === true;
				const isCopySource = $page.url.searchParams.has('fromList') && !isOwnedByCurrentUser;

				// Check for id parameter in URL to distinguish between explicit id loading and source loading
				const listIdFromUrl = $page.url.searchParams.get('id');

				// If we have ID match with publicList, it's likely the server loaded it as a direct open
				if (listIdFromUrl && data.publicList.id === listIdFromUrl && !isCopySource) {
					listName = data.publicList.name;
					listDescription = data.publicList.description || '';
					listIsPublic = isPublicList;
					if (currentSongList.length > 0) {
						toast.success(
							`Loaded list "${data.publicList.name}" with ${currentSongList.length} songs`
						);
					} else {
						toast.warning('List is empty or could not be loaded.');
					}
				} else if (isCopySource) {
					// Public list loaded as a copy source
					listName = `Copy of ${data.publicList.name}`;
					listDescription = data.publicList.description || '';
					listIsPublic = false; // Copies start as private
					toast.info(`Loaded public list "${data.publicList.name}" for editing.`);
				} else {
					// Own list loaded from fromList should still open as the same list
					listName = data.publicList.name;
					listDescription = data.publicList.description || '';
					listIsPublic = isPublicList;
					if (currentSongList.length > 0) {
						const listScopeText = isPublicList ? 'public' : 'private';
						toast.success(
							`Loaded your ${listScopeText} list "${data.publicList.name}" with ${currentSongList.length} songs`
						);
					} else {
						toast.warning('List is empty or could not be loaded.');
					}
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

	<div class="space-y-6">
		<!-- Compact stats bar with inline actions -->
		<div class="bg-card flex flex-wrap items-center gap-4 rounded-lg border px-4 py-2 shadow-sm">
			<div class="ml-auto flex items-center gap-2">
				{#if session}
					<Button onclick={openSaveDialog} disabled={isSaving} size="sm" class="">
						<Save class="mr-1.5 h-3.5 w-3.5" />
						Save List
					</Button>
					<Button
						variant="outline"
						onclick={openClearDialog}
						size="sm"
						disabled={currentSongList.length === 0}
						aria-label="Clear list"
						class="shrink-0"
					>
						<Trash2 class="h-3.5 w-3.5" />
					</Button>
				{:else}
					<form action="/auth?/discord" method="POST" class="inline">
						<Button type="submit" size="sm" class="" disabled={false}>Sign In with Discord</Button>
					</form>
				{/if}
			</div>
		</div>

		<div class="grid gap-3 xl:grid-cols-2">
			<Card class="py-2">
				<CardHeader class="px-4 py-2">
					<button
						type="button"
						class="flex w-full items-center justify-between text-left"
						onclick={() => toggleUtilityPanel('profile')}
					>
						<div>
							<CardTitle class="flex items-center gap-2 text-sm">
								<User class="h-4 w-4" />
								Import from Profile
							</CardTitle>
							<CardDescription class="text-xs">
								Import songs from AniList/MyAnimeList and keep user list context.
							</CardDescription>
						</div>
						{#if utilityPanelOpen.profile}
							<ChevronUp class="h-4 w-4 text-gray-500" />
						{:else}
							<ChevronDown class="h-4 w-4 text-gray-500" />
						{/if}
					</button>
				</CardHeader>
				{#if utilityPanelOpen.profile}
					<CardContent class="pt-0">
						<ProfileImport
							disabled={!session}
							onImportComplete={handleProfileImportComplete}
							onImportError={handleProfileImportError}
							onConfigChange={handleProfileImportConfigChange}
							showTitle={false}
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
					</CardContent>
				{/if}
			</Card>

			<Card class="py-2">
				<CardHeader class="px-4 py-2">
					<button
						type="button"
						class="flex w-full items-center justify-between text-left"
						onclick={() => toggleUtilityPanel('provider')}
					>
						<div>
							<CardTitle class="flex items-center gap-2 text-sm">
								<Download class="h-4 w-4" />
								Provider Import
							</CardTitle>
							<CardDescription class="text-xs">
								AMQ exports, Joseph Song UI, Kempanator, Blissfullyoshi, CSL.
							</CardDescription>
						</div>
						{#if utilityPanelOpen.provider}
							<ChevronUp class="h-4 w-4 text-gray-500" />
						{:else}
							<ChevronDown class="h-4 w-4 text-gray-500" />
						{/if}
					</button>
				</CardHeader>
				{#if utilityPanelOpen.provider}
					<CardContent class="space-y-4 pt-0">
						{#if annSongIdsOnly}
							<div class="space-y-2">
								<Label for="ann-song-ids-paste" class="text-sm">
									Paste annSongIds (one per line)
								</Label>
								<textarea
									id="ann-song-ids-paste"
									bind:value={annSongIdsText}
									placeholder="12345..."
									rows="6"
									class="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
									disabled={isProcessingProvider || !session}
								></textarea>
								<Button
									onclick={handleAnnSongIdsImport}
									disabled={isProcessingProvider || !session || !annSongIdsText.trim()}
									class="w-full"
								>
									{#if isProcessingProvider}
										<Loader2 class="mr-2 h-4 w-4 animate-spin" />
									{/if}
									Import annSongIds
								</Button>
							</div>
						{:else}
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
						{/if}

						{#if isProcessingProvider}
							<div class="flex items-center gap-2 text-sm text-blue-600">
								<Loader2 class="h-4 w-4 animate-spin" />
								Processing file...
							</div>
						{/if}

						{#if providerError}
							<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
								<AlertCircle class="mr-2 inline h-4 w-4" />
								{providerError}
							</div>
						{/if}

						{#if providerData}
							<div class="rounded-lg border border-green-200 bg-green-50 p-4">
								<div class="flex items-center gap-2">
									<span class="text-xl">{PROVIDER_INFO[providerData.provider]?.icon || '📄'}</span>
									<div>
										<div class="font-semibold text-green-900">
											✓ {PROVIDER_INFO[providerData.provider]?.name || 'Provider'} Import Successful
										</div>
										<div class="mt-1 text-sm text-green-700">
											{providerData.songs.length} songs processed
											{#if providerData.metadata?.totalSongs}
												• {providerData.metadata.totalSongs} total in file
											{:else if providerData.metadata?.requestedIds}
												• {providerData.metadata.requestedIds} annSongIds requested
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
							<div class="flex gap-2">
								<Button onclick={addAllProviderSongs} disabled={!session} class="flex-1">
									<Download class="mr-2 h-4 w-4" />
									Add All Provider Songs ({providerData.songs.length} songs)
								</Button>
								<Button
									onclick={clearProviderData}
									variant="outline"
									size="sm"
									disabled={!session}
									class=""
								>
									Clear
								</Button>
							</div>
						{/if}

						<!-- Advanced settings (collapsible) -->
						<div class="rounded-lg border border-gray-200">
							<button
								type="button"
								class="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
								onclick={() => (providerAdvancedOpen = !providerAdvancedOpen)}
							>
								<span class="flex items-center gap-2">
									<Settings class="h-4 w-4" />
									Advanced
								</span>
								{#if providerAdvancedOpen}
									<ChevronUp class="h-4 w-4 text-gray-500" />
								{:else}
									<ChevronDown class="h-4 w-4 text-gray-500" />
								{/if}
							</button>
							{#if providerAdvancedOpen}
								<div class="space-y-3 border-t border-gray-200 px-3 py-3">
									<div class="flex flex-col gap-1">
										<div class="flex items-center space-x-2">
											<Checkbox
												id="trust-provider-json"
												checked={trustProviderJson}
												onCheckedChange={(checked) => {
													trustProviderJson = !!checked;
													providerData = null;
													providerError = null;
													if (providerFileInput) providerFileInput.value = '';
												}}
												class=""
											/>
											<Label for="trust-provider-json" class="cursor-pointer text-sm font-medium">
												Trust JSON – skip AnisongDB/AniList fetching
											</Label>
										</div>
										<p class="text-xs text-gray-500">
											Map JSON fields directly. Use when your file already has all required song data.
										</p>
									</div>
									<div class="flex items-center space-x-2">
										<Checkbox
											id="ann-song-ids-only"
											checked={annSongIdsOnly}
											onCheckedChange={(checked) => {
												annSongIdsOnly = !!checked;
												providerData = null;
												providerError = null;
												if (providerFileInput) providerFileInput.value = '';
											}}
											class=""
										/>
										<Label for="ann-song-ids-only" class="cursor-pointer text-sm font-medium">
											Upload solely annSongIds
										</Label>
									</div>
								</div>
							{/if}
						</div>
					</CardContent>
				{/if}
			</Card>

			<Card class="py-2 xl:col-span-2">
				<CardHeader class="px-4 py-2">
					<button
						type="button"
						class="flex w-full items-center justify-between text-left"
						onclick={() => toggleUtilityPanel('search')}
					>
						<div>
							<CardTitle class="flex items-center gap-2 text-sm">
								<Search class="h-4 w-4" />
								Find & Add Songs
							</CardTitle>
							<CardDescription class="text-xs"
								>Search for songs and add them to the current list.</CardDescription
							>
						</div>
						{#if utilityPanelOpen.search}
							<ChevronUp class="h-4 w-4 text-gray-500" />
						{:else}
							<ChevronDown class="h-4 w-4 text-gray-500" />
						{/if}
					</button>
				</CardHeader>
				{#if utilityPanelOpen.search}
					<CardContent class="space-y-4 pt-0">
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

						{#if searchResults.length > 0}
							<div class="flex gap-2">
								<Button
									variant="outline"
									onclick={addAllSearchResults}
									disabled={isImporting || !session}
									class="flex items-center gap-2"
								>
									{#if isImporting}
										<Loader2 class="mr-2 h-4 w-4 animate-spin" />
										Adding songs...
									{:else}
										<Download class="mr-2 h-4 w-4" />
										Add All ({searchResults.length} songs)
									{/if}
								</Button>
							</div>
						{/if}

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

						<div>
							<label class="flex items-center space-x-2">
								<Checkbox bind:checked={partialMatch} disabled={!session} class="" />
								<span class="text-sm">Enable partial match search</span>
							</label>
							<p class="mt-1 text-xs text-gray-500">
								When enabled, searches will match partial text. When disabled, searches require
								exact matches.
							</p>
						</div>

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
									bind:value={searchQuery}
									placeholder="Enter anime title..."
									onkeydown={(e) => e.key === 'Enter' && handleSearch()}
									disabled={!session}
									type="text"
									class=""
								/>
							{:else if searchBy === 'artist'}
								<Input
									bind:value={searchQuery}
									placeholder="Enter artist name..."
									onkeydown={(e) => e.key === 'Enter' && handleSearch()}
									disabled={!session}
									type="text"
									class=""
								/>
							{:else if searchBy === 'song'}
								<Input
									bind:value={searchQuery}
									placeholder="Enter song name..."
									onkeydown={(e) => e.key === 'Enter' && handleSearch()}
									disabled={!session}
									type="text"
									class=""
								/>
							{:else if searchBy === 'composer'}
								<Input
									bind:value={searchQuery}
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
										<SelectTrigger class="">{seasonSearch.season}</SelectTrigger>
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
												<Badge variant="outline" class="border-black bg-black text-white" href=""
													>Global</Badge
												>
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
				{/if}
			</Card>

			<Card class="py-2 xl:col-span-2">
				<CardHeader class="px-4 py-2">
					<button
						type="button"
						class="flex w-full items-center justify-between text-left"
						onclick={() => toggleUtilityPanel('saved')}
					>
						<div>
							<CardTitle class="flex items-center gap-2 text-sm">
								<List class="h-4 w-4" />
								Saved Lists
							</CardTitle>
							<CardDescription class="text-xs">
								{#if savedLists.length > 0}
									Showing {(savedListsPage - 1) * savedListsPerPage + 1} -
									{Math.min(savedListsPage * savedListsPerPage, savedLists.length)} of {savedLists.length}
									lists
								{:else}
									Your previously saved song lists
								{/if}
							</CardDescription>
						</div>
						{#if utilityPanelOpen.saved}
							<ChevronUp class="h-4 w-4 text-gray-500" />
						{:else}
							<ChevronDown class="h-4 w-4 text-gray-500" />
						{/if}
					</button>
				</CardHeader>
				{#if utilityPanelOpen.saved}
					<CardContent class="pt-0">
						{#if session}
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
													<span class="text-gray-500">{list.is_public ? 'Public' : 'Private'}</span>
													<span
														>{list.song_count || 'unknown'} songs • {new Date(list.created_at)
															.toISOString()
															.split('T')[0]}</span
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
															class="-mx-6 cursor-pointer py-1.5 text-red-600 hover:text-red-600! focus:text-red-600"
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
						{:else}
							<div class="py-8 text-center">
								<p class="mb-4 text-gray-600">Sign in to save and manage your song lists</p>
								<form action="/auth?/discord" method="POST">
									<Button type="submit" disabled={false} class="">Sign In with Discord</Button>
								</form>
							</div>
						{/if}
					</CardContent>
				{/if}
			</Card>
		</div>

		<Card class="">
			<CardHeader class="">
				<CardTitle class="flex items-center gap-2">
					<Music class="h-5 w-5" />
					Current List ({currentSongList.length} songs)
				</CardTitle>
				<CardDescription class="">Song table for editing and reviewing your list</CardDescription>
				{#if currentEditToken}
					<div class="mt-2 rounded-md border border-blue-300 bg-blue-50 p-2 text-sm text-blue-800">
						<p>
							<strong class="font-semibold">Shared Editing Mode:</strong> You are editing a shared list.
							Changes will affect the original list.
						</p>
					</div>
				{/if}
				{#if isListMixed}
					<div
						class="mt-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800"
					>
						<p>
							<strong class="font-semibold">Warning:</strong> This list contains songs from Global Search
							or from Provider Source. Personal list metadata is unavailable for mixed lists. Filter nodes
							that require personal list data (such as "User Score" and others added in the future) will
							not work.
						</p>
					</div>
				{/if}
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="flex flex-wrap gap-3">
					<div class="relative min-w-[260px] flex-1">
						<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
						<Input
							type="text"
							bind:value={currentListSearchQuery}
							placeholder="Search by anime, song, or artist..."
							class="pl-10"
						/>
					</div>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm transition-colors"
						>
							<Columns3 class="mr-2 h-4 w-4" />
							Columns
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="max-h-[min(80vh,400px)] overflow-y-auto" portalProps={{}}>
							{#each currentListColumns.filter((c) => c.id !== 'actions') as col}
								{@const isVisible = currentListColumnVisibility[col.id] !== false}
								<DropdownMenu.CheckboxItem
									checked={isVisible}
									onCheckedChange={(checked) => {
										currentListColumnVisibility = {
											...currentListColumnVisibility,
											[col.id]: checked !== false
										};
									}}
									class="cursor-pointer"
								>
									{col.header}
								</DropdownMenu.CheckboxItem>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Select
						value={currentListSourceFilter}
						onValueChange={(val) => (currentListSourceFilter = val)}
						type="single"
					>
						<SelectTrigger class="w-[160px]">
							{currentListSourceFilter === 'all'
								? 'All Sources'
								: currentListSourceFilter === 'list'
									? 'List'
									: currentListSourceFilter === 'global'
										? 'Global'
										: currentListSourceFilter === 'provider'
											? 'Provider'
											: 'All Sources'}
						</SelectTrigger>
						<SelectContent class="" portalProps={{}}>
							<SelectItem value="all" label="All Sources" class="">All Sources</SelectItem>
							<SelectItem value="list" label="List" class="">List</SelectItem>
							<SelectItem value="global" label="Global" class="">Global</SelectItem>
							<SelectItem value="provider" label="Provider" class="">Provider</SelectItem>
						</SelectContent>
					</Select>
					<Select
						value={currentListTypeFilter}
						onValueChange={(val) => (currentListTypeFilter = val)}
						type="single"
					>
						<SelectTrigger class="w-[160px]">
							{currentListTypeFilter === 'all'
								? 'All Types'
								: currentListTypeFilter === 'opening'
									? 'Openings'
									: currentListTypeFilter === 'ending'
										? 'Endings'
										: currentListTypeFilter === 'insert'
											? 'Insert'
											: 'Other'}
						</SelectTrigger>
						<SelectContent class="" portalProps={{}}>
							<SelectItem value="all" label="All Types" class="">All Types</SelectItem>
							<SelectItem value="opening" label="Openings" class="">Openings</SelectItem>
							<SelectItem value="ending" label="Endings" class="">Endings</SelectItem>
							<SelectItem value="insert" label="Insert Songs" class="">Insert Songs</SelectItem>
							<SelectItem value="other" label="Other" class="">Other</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<Separator class="" />

				<div class="overflow-x-auto rounded-md border">
					<Table.Root class="table-fixed">
						<Table.Header class="">
							{#each currentListTable.getHeaderGroups() as headerGroup}
								<Table.Row class="">
									{#each headerGroup.headers as header}
										<Table.Head
											class="relative px-6 py-3 {header.id === 'actions' ? 'text-right' : ''}"
											style={`width: ${header.getSize()}px`}
										>
											{#if !header.isPlaceholder}
												{#if header.column.getCanSort()}
													<button
														class="flex items-center gap-2 text-xs font-medium uppercase hover:text-gray-900"
														onclick={() => header.column.toggleSorting()}
													>
														<FlexRender
															attach={header.column.columnDef.header}
															content={header.column.columnDef.header}
															context={header.getContext()}
														/>
														{#if header.column.getIsSorted() === 'asc'}
															<ChevronUp class="h-4 w-4" />
														{:else if header.column.getIsSorted() === 'desc'}
															<ChevronDown class="h-4 w-4" />
														{:else}
															<ChevronsUpDown class="h-4 w-4 opacity-50" />
														{/if}
													</button>
												{:else}
													<div class="text-xs font-medium uppercase">
														<FlexRender
															attach={header.column.columnDef.header}
															content={header.column.columnDef.header}
															context={header.getContext()}
														/>
													</div>
												{/if}
											{/if}
											{#if header.column.getCanResize()}
												<div
													class="column-resizer {header.column.getIsResizing()
														? 'is-resizing'
														: ''}"
													onpointerdown={withStopPropagation(header.getResizeHandler())}
													ontouchstart={withStopPropagation(header.getResizeHandler())}
												></div>
											{/if}
										</Table.Head>
									{/each}
								</Table.Row>
							{/each}
						</Table.Header>
						<Table.Body class="">
						{#if currentListTable.getRowModel().rows?.length}
							{#each currentListTable.getRowModel().rows as row}
								{@const isDupRow = /** @type {any} */ (row.original).annSongId &&
									duplicateAnnSongIds.has(/** @type {any} */ (row.original).annSongId)}
								<Table.Row
									class={isDupRow
										? 'border-l-4 border-l-red-500 bg-red-50/30 hover:bg-red-50/60'
										: ''}
								>
										{#each row.getVisibleCells() as cell}
											<Table.Cell
												class="px-6 py-4 text-sm {cell.column.id === 'actions' ? 'text-right' : ''}"
												style={`width: ${cell.column.getSize()}px`}
											>
												{#if cell.column.id === 'actions'}
													<div class="flex items-center justify-end gap-1">
														<Button
															size="sm"
															variant="ghost"
															onclick={() =>
																openSampleRangeDialog(/** @type {EnrichedSong} */ (row.original))}
															disabled={!session}
															title="Configure song settings"
															class=""
														>
															<Film class="h-3.5 w-3.5" />
														</Button>
														<Button
															size="sm"
															variant="ghost"
															onclick={() =>
																removeSongFromList(/** @type {EnrichedSong} */ (row.original))}
															disabled={!session}
															title="Remove from list"
															class="text-red-500 hover:bg-red-50 hover:text-red-700"
														>
															<Trash2 class="h-3.5 w-3.5" />
														</Button>
													</div>
												{:else}
													{@html typeof cell.column.columnDef.cell === 'function'
														? cell.column.columnDef.cell(cell.getContext())
														: cell.column.columnDef.cell}
												{/if}
											</Table.Cell>
										{/each}
									</Table.Row>
								{/each}
							{:else}
								<Table.Row class="">
									<Table.Cell
										colspan={currentListColumns.length}
										class="h-24 text-center text-gray-500"
									>
										{#if currentSongList.length === 0}
											No songs added yet.
										{:else}
											No songs match current filters.
										{/if}
									</Table.Cell>
								</Table.Row>
							{/if}
						</Table.Body>
					</Table.Root>
			</div>

			{#if duplicateAnnSongIds.size > 0}
				<div class="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
					<AlertCircle class="h-4 w-4 shrink-0" />
					<span>Containing <strong>{duplicateAnnSongIds.size}</strong> duplicate {duplicateAnnSongIds.size === 1 ? 'song' : 'songs'}</span>
				</div>
			{/if}

			{#if currentListTable.getFilteredRowModel().rows.length > 0}
				<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex items-center gap-4">
							<div class="text-sm text-gray-700">
								Showing {currentListTable.getState().pagination.pageIndex *
									currentListTable.getState().pagination.pageSize +
									1}
								to
								{Math.min(
									(currentListTable.getState().pagination.pageIndex + 1) *
										currentListTable.getState().pagination.pageSize,
									currentListTable.getFilteredRowModel().rows.length
								)}
								of {currentListTable.getFilteredRowModel().rows.length} songs
							</div>
							<div class="flex items-center gap-2">
								<span class="text-sm text-gray-600">Songs per page:</span>
								<Select
									value={String(currentListTable.getState().pagination.pageSize)}
									onValueChange={(val) => {
										const pageSize = Number(val);
										currentListTable.setPageSize(pageSize);
									}}
									type="single"
								>
									<SelectTrigger class="h-8 w-[90px]">
										{currentListTable.getState().pagination.pageSize}
									</SelectTrigger>
									<SelectContent class="" portalProps={{}}>
										<SelectItem value="20" label="20" class="">20</SelectItem>
										<SelectItem value="50" label="50" class="">50</SelectItem>
										<SelectItem value="100" label="100" class="">100</SelectItem>
										<SelectItem value="1000" label="1000" class="">1000</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						{#if currentListTable.getPageCount() > 1}
							<div class="flex items-center gap-2">
								<Button
									onclick={() => currentListTable.previousPage()}
									variant="outline"
									size="sm"
									disabled={!currentListTable.getCanPreviousPage()}
									class=""
								>
									<ChevronLeft class="h-4 w-4" />
									Previous
								</Button>
								<div class="flex items-center gap-1">
									{#each Array.from( { length: Math.min(5, currentListTable.getPageCount()) }, (_, i) => {
											const start = Math.max(0, Math.min(currentListTable.getState().pagination.pageIndex - 2, currentListTable.getPageCount() - 5));
											return start + i;
										} ) as pageIndex}
										<Button
											class="min-w-10"
											onclick={() => currentListTable.setPageIndex(pageIndex)}
											variant={currentListTable.getState().pagination.pageIndex === pageIndex
												? 'default'
												: 'outline'}
											size="sm"
											disabled={false}
										>
											{pageIndex + 1}
										</Button>
									{/each}
								</div>
								<Button
									onclick={() => currentListTable.nextPage()}
									variant="outline"
									size="sm"
									disabled={!currentListTable.getCanNextPage()}
									class=""
								>
									Next
									<ChevronRight class="h-4 w-4" />
								</Button>
							</div>
						{/if}
					</div>
				{/if}
			</CardContent>
		</Card>
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
						class="overflow-wrap-break w-full min-w-0 wrap-break-word"
						maxlength="512"
						style="overflow-wrap: break-word; word-wrap: break-word; word-break: break-word;"
					/>
				</div>
				<div class="flex items-center space-x-2">
					<Switch id="save-public-switch" bind:checked={listIsPublic} class="" />
					<Label for="save-public-switch" class="">Make list public</Label>
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
					class="overflow-wrap-break w-full min-w-0 wrap-break-word"
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

	.column-resizer {
		position: absolute;
		right: 0;
		top: 0;
		height: 100%;
		width: 4px;
		cursor: col-resize;
		touch-action: none;
		user-select: none;
		background: rgba(203, 213, 225, 0.3);
		transition: background 0.15s ease;
	}

	.column-resizer:hover {
		background: rgba(148, 163, 184, 0.6);
	}

	.column-resizer.is-resizing {
		background: rgba(99, 102, 241, 0.8);
	}
</style>
