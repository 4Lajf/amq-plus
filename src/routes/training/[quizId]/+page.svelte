<script>
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import {
		ArrowLeft,
		Target,
		TrendingUp,
		Clock,
		Award,
		Trash2,
		PauseCircle,
		PlayCircle,
		Calendar,
		Search,
		ChevronLeft,
		ChevronRight,
		ChevronUp,
		ChevronDown,
		ChevronsUpDown,
		Eye,
		X,
		Timer,
		Play,
		CheckCircle,
		XCircle,
		Copy,
		CalendarClock,
		RefreshCw,
		RotateCcw
	} from 'lucide-svelte';
	import { utcStartOfDay, dayBoundaryNote } from '$lib/utils/day-boundary.js';
	import { isTrainingDue } from '$lib/utils/training-due.js';
	import { toast } from 'svelte-sonner';
	import { onMount, tick, untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { fade, slide } from 'svelte/transition';
	import * as echarts from 'echarts';
	import {
		createSvelteTable,
		getCoreRowModel,
		getFilteredRowModel,
		getSortedRowModel,
		getPaginationRowModel,
		FlexRender
	} from '$lib/components/ui/data-table';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Switch } from '$lib/components/ui/switch';

	// @ts-ignore
	let { data } = $props();

	let accuracyChartContainer = $state();
	let masteryChartContainer = $state();
	let forecastChartContainer = $state();

	// Table state for song progress
	let sorting = $state([]);
	let songSortMode = $state('default'); // default, titleAsc, titleDesc, artistAsc, artistDesc
	let columnFilters = $state([]);
	// Start with the decision-making columns. Scheduler internals remain available
	// from the column picker for people who want to inspect them.
	const DEFAULT_COLUMN_VISIBILITY = {
		attempt_count: false,
		success_streak: false,
		last_attempt_at: false,
		difficulty: false,
		annSongId: false
	};
	let columnVisibility = $state({ ...DEFAULT_COLUMN_VISIBILITY });
	let pagination = $state({ pageIndex: 0, pageSize: 20 });
	let columnSizing = $state({});
	let columnSizingInfo = $state({});

	// Filter states
	let searchQuery = $state('');
	let learningStageFilter = $state('all'); // all, learning, review, relearning
	let selectionTypeFilter = $state('all'); // all, due, new, revision
	let statusFilter = $state('all'); // all, in-quiz, outside, paused, scheduled
	/** @type {Map<string, string|null>} */
	let suspensionOverrides = $state(new Map());

	// Dialog states
	let confirmationOpen = $state(false);
	let confirmationMessage = $state('');
	/** @type {((value: boolean) => void) | null} */
	let resolveConfirmation = null;
	/** @type {HTMLElement | null} */
	let confirmationOpener = null;

	function confirmInApp(message) {
		confirmationMessage = message;
		confirmationOpener =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		confirmationOpen = true;
		return new Promise((resolve) => {
			resolveConfirmation = resolve;
		});
	}

	function settleConfirmation(accepted) {
		const resolve = resolveConfirmation;
		resolveConfirmation = null;
		confirmationOpen = false;
		resolve?.(accepted);
	}

	let rescheduleDialogOpen = $state(false);
	let dailyReviewLimitInput = $state(
		data.quiz.daily_review_limit === null || data.quiz.daily_review_limit === undefined
			? ''
			: String(data.quiz.daily_review_limit)
	);
	let savingDailyReviewLimit = $state(false);
	let dailyNewLimitInput = $state(
		data.quiz.daily_new_limit === null || data.quiz.daily_new_limit === undefined
			? ''
			: String(data.quiz.daily_new_limit)
	);
	let savingDailyNewLimit = $state(false);
	let dailyReviewGoalInput = $state(
		data.quiz.daily_review_goal === null || data.quiz.daily_review_goal === undefined
			? ''
			: String(data.quiz.daily_review_goal)
	);
	let savingDailyReviewGoal = $state(false);
	let spreadHorizonDays = $state(14);
	// W8/C1: keep the 00:00 UTC boundary, but say so wherever a day-scoped number
	// appears, with the viewer's local equivalent.
	const boundaryNote = dayBoundaryNote();
	let combineDuplicates = $state(data.quiz.combine_duplicates === true);
	let savingCombineDuplicates = $state(false);
	let allowSameDayReviews = $state(data.quiz.allow_same_day_reviews !== false);
	let savingAllowSameDayReviews = $state(false);

	// Session pagination state
	let currentSessionPage = $state(1);
	const SESSIONS_PER_PAGE = 5;
	let showInProgressSessions = $state(true);

	// Optimistic deletion: track deleted song IDs for instant table update without reload
	let deletedSongIds = $state(new Set());

	// Merge history state
	let mergeSourceId = $state('');
	let mergeLoading = $state(false);
	let isCloningTraining = $state(false);

	// Filter sessions based on toggle
	let filteredSessions = $derived(
		showInProgressSessions ? data.sessions : data.sessions.filter((session) => session.isComplete)
	);

	let totalSessionPages = $derived(Math.ceil(filteredSessions.length / SESSIONS_PER_PAGE));
	let paginatedSessions = $derived(
		filteredSessions.slice(
			(currentSessionPage - 1) * SESSIONS_PER_PAGE,
			currentSessionPage * SESSIONS_PER_PAGE
		)
	);

	// Reset to page 1 when filter changes
	$effect(() => {
		if (currentSessionPage > totalSessionPages && totalSessionPages > 0) {
			currentSessionPage = 1;
		}
	});

	// Clamp pagination when table data shrinks (e.g. after deleting a song)
	$effect(() => {
		const rowCount = tableData.length;
		const pageSize = pagination.pageSize;
		const pageCount = rowCount === 0 ? 1 : Math.ceil(rowCount / pageSize);
		if (pageCount > 0 && pagination.pageIndex >= pageCount) {
			pagination = { ...pagination, pageIndex: Math.max(0, pageCount - 1) };
		}
	});

	// Selected session details (from server data)
	let selectedSession = $derived(data.selectedSession);
	let sessionPlays = $derived(data.sessionPlays || []);

	// Table data with derived filtering
	let tableData = $derived.by(() => {
		const now = new Date();
		// The training day rolls over at 00:00 UTC, same as the server. Using the
		// browser's local midnight here is what made "due today" disagree with what
		// the session actually served.
		const today = utcStartOfDay(now);

		return data.progress.filter((record) => {
			// Exclude optimistically deleted songs
			const songId = record.song_ann_id ?? record.annSongId;
			if (songId != null && deletedSongIds.has(String(songId))) return false;

			// Search filter — title, artist and anime. Anime was the one people
			// actually asked for (Cherryish, 2026-03-19): you remember the show a
			// song is from long before you remember its title.
			if (searchQuery.trim()) {
				const song = parseSongKey(record);
				const query = searchQuery.toLowerCase();
				const haystack = [song.title, song.artist, song.anime];
				if (!haystack.some((field) => (field || '').toLowerCase().includes(query))) {
					return false;
				}
			}

			// Learning stage filter
			if (learningStageFilter !== 'all') {
				const fsrsState = record.fsrs_state?.state;
				if (learningStageFilter === 'new' && !(fsrsState === 0 || !record.fsrs_state)) {
					return false;
				}
				if (learningStageFilter === 'learning' && fsrsState !== 1) {
					return false;
				}
				if (learningStageFilter === 'review' && fsrsState !== 2) {
					return false;
				}
				if (learningStageFilter === 'relearning' && fsrsState !== 3) {
					return false;
				}
			}

			// Due uses the scheduler's own rule (isTrainingDue); Extra practice retains its
			// existing future-day policy so same-day learning steps cannot be skipped.
			if (selectionTypeFilter !== 'all') {
				const dueDateTime = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
				const dueDate = dueDateTime ? utcStartOfDay(dueDateTime) : null;

				if (
					selectionTypeFilter === 'due' &&
					(isSuspended(record) || !isTrainingDue({ ...record, suspended_at: null }, now))
				) {
					return false;
				}
				if (
					selectionTypeFilter === 'new' &&
					!(record.fsrs_state?.state === 0 || !record.fsrs_state)
				) {
					return false;
				}
				if (
					selectionTypeFilter === 'revision' &&
					(!dueDate || dueDate <= today || !record.fsrs_state)
				) {
					return false;
				}
			}

			if (statusFilter !== 'all') {
				const status = getProgressStatusLabel(record);
				if (statusFilter === 'in-quiz' && status === 'Outside quiz') return false;
				if (statusFilter === 'outside' && status !== 'Outside quiz') return false;
				if (statusFilter === 'paused' && status !== 'Paused') return false;
				if (statusFilter === 'scheduled' && status !== 'Scheduled') return false;
			}

			return true;
		});
	});

	function getColumnSizingStorageKey() {
		return `training-column-sizes:${data?.quiz?.id ?? 'unknown'}`;
	}

	function getColumnVisibilityStorageKey() {
		return `training-column-visibility:${data?.quiz?.id ?? 'unknown'}`;
	}

	function withStopPropagation(handler) {
		return (event) => {
			event.stopPropagation();
			handler(event);
		};
	}

	// Column definitions for TanStack Table
	const columns = [
		{
			id: 'select',
			header: '',
			size: 44,
			minSize: 44,
			maxSize: 44,
			enableSorting: false,
			enableResizing: false,
			cell: () => ''
		},
		{
			accessorKey: 'song_ann_id',
			header: 'Song',
			size: 320,
			minSize: 160,
			maxSize: 600,
			cell: (info) => {
				const record = info.row.original;
				const song = parseSongKey(record);
				const title = song.title || '';
				const artist = song.artist || '';
				const titleAttr = artist ? `${title} — ${artist}` : title;
				return `
					<div class="min-w-0" style="max-width: 100%;" title="${titleAttr}">
						<p class="font-medium text-gray-900 truncate">${title}</p>
						${artist ? `<p class="text-xs text-gray-500 truncate">${artist}</p>` : ''}
					</div>
				`;
			},
			sortingFn: (rowA, rowB) => {
				const songA = parseSongKey(rowA.original);
				const songB = parseSongKey(rowB.original);

				if (songSortMode === 'artistAsc' || songSortMode === 'artistDesc') {
					return songA.artist.localeCompare(songB.artist);
				}

				return songA.title.localeCompare(songB.title);
			}
		},
		{
			id: 'anime',
			header: 'Anime',
			size: 260,
			minSize: 140,
			maxSize: 600,
			accessorFn: (row) => parseSongKey(row).anime || 'Unknown',
			cell: (info) => {
				const anime = info.getValue();
				return `<span class="text-sm text-gray-700 truncate block" style="max-width: 100%;" title="${anime}">${anime}</span>`;
			},
			sortingFn: (rowA, rowB) => {
				const animeA = parseSongKey(rowA.original).anime || 'Unknown';
				const animeB = parseSongKey(rowB.original).anime || 'Unknown';
				return animeA.localeCompare(animeB);
			}
		},
		{
			accessorKey: 'attempt_count',
			header: 'Attempts',
			size: 120,
			minSize: 90,
			maxSize: 180,
			cell: (info) => {
				const record = info.row.original;
				const failCount = record.attempt_count - record.success_count;
				return `<span class="text-green-600">${record.success_count}</span><span class="text-gray-400">/</span><span class="text-red-600">${failCount}</span>`;
			}
		},
		{
			id: 'success_rate',
			header: 'Success Rate',
			size: 170,
			minSize: 130,
			maxSize: 240,
			accessorFn: (row) => {
				const history = row.history || [];
				const last10 = history.slice(-10);
				const last10Success = last10.filter((a) => a.success).length;
				const last10Total = last10.length;
				return last10Total > 0 ? Math.round((last10Success / last10Total) * 100) : 0;
			},
			cell: (info) => {
				const rate = info.getValue();
				return `<div class="flex items-center"><span class="text-sm font-medium text-gray-900">${rate}%</span><span class="ml-2 text-xs text-gray-500">(last 10)</span></div>`;
			}
		},
		{
			accessorKey: 'success_streak',
			header: 'Streak',
			size: 110,
			minSize: 80,
			maxSize: 160,
			cell: (info) => {
				const streak = info.getValue();
				const variant = streak > 0 ? 'success' : 'secondary';
				return `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${variant === 'success' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}">${streak}</span>`;
			}
		},
		{
			accessorKey: 'last_attempt_at',
			header: 'Last Attempt',
			size: 150,
			minSize: 120,
			maxSize: 220,
			cell: (info) => formatDate(info.getValue())
		},
		{
			id: 'next_review',
			header: 'Next Review',
			size: 150,
			minSize: 120,
			maxSize: 220,
			accessorFn: (row) => row.fsrs_state?.due || null,
			cell: (info) => {
				const due = info.getValue();
				if (due) {
					return formatDate(due);
				}
				return '<span class="text-purple-600 font-medium">New</span>';
			},
			sortingFn: (rowA, rowB) => {
				const dueA = rowA.original.fsrs_state?.due;
				const dueB = rowB.original.fsrs_state?.due;
				if (!dueA && !dueB) return 0;
				if (!dueA) return 1;
				if (!dueB) return -1;
				return new Date(dueA).getTime() - new Date(dueB).getTime();
			}
		},
		{
			id: 'difficulty',
			header: 'Difficulty',
			size: 130,
			minSize: 100,
			maxSize: 200,
			accessorFn: (row) => row.fsrs_state?.difficulty || 0,
			cell: (info) => {
				const difficulty = info.getValue();
				const variant = difficulty < 5 ? 'default' : difficulty < 7 ? 'secondary' : 'destructive';
				const colorClass =
					difficulty < 5
						? 'bg-blue-100 text-blue-700'
						: difficulty < 7
							? 'bg-gray-100 text-gray-700'
							: 'bg-red-100 text-red-700';
				return `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${colorClass}">${difficulty.toFixed(1)}</span>`;
			}
		},
		{
			id: 'annSongId',
			header: 'annSongId',
			size: 150,
			minSize: 100,
			maxSize: 250,
			accessorFn: (row) => row.annSongId || row.song_ann_id || '',
			cell: (info) => {
				const record = info.row.original;
				const annSongId = record.annSongId || record.song_ann_id || '';
				return `<span class="text-sm text-gray-700">${annSongId}</span>`;
			},
			sortingFn: (rowA, rowB) => {
				const idA = rowA.original.annSongId || rowA.original.song_ann_id || '';
				const idB = rowB.original.annSongId || rowB.original.song_ann_id || '';
				// Convert to numbers for numerical sorting
				const numA = Number(idA) || 0;
				const numB = Number(idB) || 0;
				return numA - numB;
			}
		},
		{
			id: 'suspended',
			header: 'Status',
			size: 110,
			minSize: 90,
			maxSize: 160,
			accessorFn: (row) => (row.is_active === false ? 2 : row.suspended_at ? 1 : 0),
			cell: (info) => {
				if (info.getValue() === 2) {
					return '<span class="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">Outside quiz</span>';
				}
				if (info.getValue() === 1) {
					return '<span class="inline-flex items-center rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Paused</span>';
				}
				return '<span class="text-xs text-gray-500">Scheduled</span>';
			}
		},
		{
			id: 'actions',
			header: 'Actions',
			size: 170,
			minSize: 140,
			maxSize: 220,
			enableSorting: false,
			enableResizing: false,
			cell: (info) => ''
		}
	];

	// Create TanStack Table instance
	const table = createSvelteTable({
		get data() {
			return tableData;
		},
		columns,
		columnResizeMode: 'onChange',
		state: {
			get sorting() {
				return sorting;
			},
			get columnFilters() {
				return columnFilters;
			},
			get columnVisibility() {
				return columnVisibility;
			},
			get pagination() {
				return pagination;
			},
			get columnSizing() {
				return columnSizing;
			},
			get columnSizingInfo() {
				return columnSizingInfo;
			}
		},
		onSortingChange: (updater) => {
			if (typeof updater === 'function') {
				sorting = updater(sorting);
			} else {
				sorting = updater;
			}
		},
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				columnFilters = updater(columnFilters);
			} else {
				columnFilters = updater;
			}
		},
		onColumnVisibilityChange: (updater) => {
			if (typeof updater === 'function') {
				columnVisibility = updater(columnVisibility);
			} else {
				columnVisibility = updater;
			}
		},
		onPaginationChange: (updater) => {
			if (typeof updater === 'function') {
				pagination = updater(pagination);
			} else {
				pagination = updater;
			}
		},
		onColumnSizingChange: (updater) => {
			if (typeof updater === 'function') {
				columnSizing = updater(columnSizing);
			} else {
				columnSizing = updater;
			}
		},
		onColumnSizingInfoChange: (updater) => {
			if (typeof updater === 'function') {
				columnSizingInfo = updater(columnSizingInfo);
			} else {
				columnSizingInfo = updater;
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	});

	// Column widths and visibility are stored per quiz. Going straight from one
	// quiz's training page to another reuses this component, so onMount does not
	// run again: load whenever the quiz id changes, and before anything is saved,
	// so one quiz's columns are never written under another quiz's key.
	function loadColumnState() {
		let nextSizing = {};
		try {
			const storedSizing = localStorage.getItem(getColumnSizingStorageKey());
			if (storedSizing) {
				const parsed = JSON.parse(storedSizing);
				if (parsed && typeof parsed === 'object') {
					nextSizing = parsed;
				}
			}
		} catch (error) {
			console.warn('Failed to load column sizing', error);
		}
		columnSizing = nextSizing;

		const nextVisibility = { ...DEFAULT_COLUMN_VISIBILITY };
		try {
			const storedVisibility = localStorage.getItem(getColumnVisibilityStorageKey());
			if (storedVisibility) {
				const parsed = JSON.parse(storedVisibility);
				if (parsed && typeof parsed === 'object') {
					for (const [key, value] of Object.entries(parsed)) {
						if (typeof value === 'boolean') nextVisibility[key] = value;
					}
				}
			}
		} catch (error) {
			console.warn('Failed to load column visibility', error);
		}
		columnVisibility = nextVisibility;
	}

	onMount(() => {
		if (!selectedSession) {
			initCharts();
		}
	});

	let columnStateQuizId = null;
	$effect(() => {
		const quizId = data?.quiz?.id;
		if (typeof window === 'undefined' || !quizId) return;
		if (quizId !== columnStateQuizId) {
			columnStateQuizId = quizId;
			untrack(loadColumnState);
		}
		try {
			localStorage.setItem(getColumnSizingStorageKey(), JSON.stringify(columnSizing));
		} catch (error) {
			console.warn('Failed to persist column sizing', error);
		}
		try {
			localStorage.setItem(getColumnVisibilityStorageKey(), JSON.stringify(columnVisibility));
		} catch (error) {
			console.warn('Failed to persist column visibility', error);
		}
	});

	// Reinitialize charts when navigating back from session details
	$effect(() => {
		if (!selectedSession && data.progress.length > 0) {
			// Use a small timeout to ensure DOM elements are rendered after transition
			const timer = setTimeout(() => {
				initCharts();
			}, 350);
			return () => clearTimeout(timer);
		}
	});

	function resizeChart(node) {
		const observer = new ResizeObserver(() => {
			echarts.getInstanceByDom(node)?.resize();
		});
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
				echarts.getInstanceByDom(node)?.dispose();
			}
		};
	}

	function initCharts() {
		// Accuracy Line Chart
		if (accuracyChartContainer && data.performanceOverTime.length > 0) {
			// Dispose existing chart if any
			const existingAccuracyChart = echarts.getInstanceByDom(accuracyChartContainer);
			if (existingAccuracyChart) {
				existingAccuracyChart.dispose();
			}
			const accuracyChart = echarts.init(accuracyChartContainer);
			accuracyChart.setOption({
				tooltip: {
					trigger: 'axis',
					backgroundColor: 'rgba(0, 0, 0, 0.8)',
					borderColor: '#333',
					textStyle: { color: '#fff' }
				},
				xAxis: {
					type: 'category',
					data: data.performanceOverTime.map((d) => d.date),
					axisLabel: { rotate: 45 }
				},
				yAxis: {
					type: 'value',
					min: 0,
					max: 100,
					axisLabel: { formatter: '{value}%' }
				},
				series: [
					{
						name: 'Accuracy',
						type: 'line',
						data: data.performanceOverTime.map((d) => d.accuracy),
						smooth: true,
						lineStyle: { color: '#6366f1', width: 3 },
						itemStyle: { color: '#6366f1' },
						areaStyle: { color: 'rgba(99, 102, 241, 0.1)' }
					}
				]
			});
		}

		// Mastery Donut Chart
		if (masteryChartContainer) {
			// Dispose existing chart if any
			const existingMasteryChart = echarts.getInstanceByDom(masteryChartContainer);
			if (existingMasteryChart) {
				existingMasteryChart.dispose();
			}
			const masteryChart = echarts.init(masteryChartContainer);
			const dist = data.stats.masteryDistribution;
			masteryChart.setOption({
				tooltip: {
					trigger: 'item',
					backgroundColor: 'rgba(0, 0, 0, 0.8)',
					borderColor: '#333',
					textStyle: { color: '#fff' },
					formatter: function (params) {
						const tooltips = {
							New: 'Songs never studied',
							Learning: 'Songs being actively learned',
							Review: 'Songs in spaced repetition',
							Relearning: 'Songs forgotten and being relearned'
						};
						return `${params.name}: ${params.value}<br/>${tooltips[params.name] || ''}`;
					}
				},
				legend: {
					orient: 'vertical',
					left: 'left'
				},
				series: [
					{
						name: 'Songs',
						type: 'pie',
						radius: ['40%', '70%'],
						avoidLabelOverlap: false,
						itemStyle: {
							borderRadius: 10,
							borderColor: '#fff',
							borderWidth: 2
						},
						label: {
							show: true,
							formatter: '{b}: {c}'
						},
						emphasis: {
							label: {
								show: true,
								fontSize: 16,
								fontWeight: 'bold'
							}
						},
						data: [
							{ value: dist.learning, name: 'Learning', itemStyle: { color: '#fbbf24' } },
							{ value: dist.review, name: 'Review', itemStyle: { color: '#60a5fa' } },
							{ value: dist.relearning, name: 'Relearning', itemStyle: { color: '#ef4444' } }
						]
					}
				]
			});
		}

		// Forecast Bar Chart
		if (forecastChartContainer && data.forecast.length > 0) {
			// Dispose existing chart if any
			const existingForecastChart = echarts.getInstanceByDom(forecastChartContainer);
			if (existingForecastChart) {
				existingForecastChart.dispose();
			}
			const forecastChart = echarts.init(forecastChartContainer);
			forecastChart.setOption({
				tooltip: {
					trigger: 'axis',
					backgroundColor: 'rgba(0, 0, 0, 0.8)',
					borderColor: '#333',
					textStyle: { color: '#fff' }
				},
				xAxis: {
					type: 'category',
					data: data.forecast.map((d) => d.date),
					axisLabel: { rotate: 45 }
				},
				yAxis: {
					type: 'value'
				},
				series: [
					{
						name: 'Due Songs',
						type: 'bar',
						data: data.forecast.map((d) => d.due),
						itemStyle: { color: '#f59e0b' }
					}
				]
			});
		}
	}

	function formatDate(dateString) {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		// Format as ISO 8601 (YYYY-MM-DD)
		return date.toISOString().split('T')[0];
	}

	function getRecentSuccessRate(record) {
		const recent = (record.history || []).slice(-10);
		if (recent.length === 0) return null;
		return Math.round((recent.filter((attempt) => attempt.success).length / recent.length) * 100);
	}

	function getLastRatingLabel(record) {
		const history = record.history || [];
		const lastAttempt = history.at(-1);
		if (!lastAttempt) return 'No attempts yet';
		const ratingLabels = {
			1: 'No idea',
			2: 'Lucky guess',
			3: 'Okay',
			4: 'Trivial'
		};
		return ratingLabels[Number(lastAttempt.rating)] || (lastAttempt.success ? 'Correct' : 'Missed');
	}

	function getLearningStageLabel(record) {
		const labels = {
			0: 'New',
			1: 'Learning',
			2: 'Review',
			3: 'Relearning'
		};
		return labels[record.fsrs_state?.state] || 'New';
	}

	function getSelectionTypeLabel(record) {
		if (record.fsrs_state?.state === 0 || !record.fsrs_state) return 'New';
		const due = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
		return due && due <= new Date() ? 'Due' : 'Extra practice';
	}

	function getProgressStatusLabel(record) {
		if (record.is_active === false) return 'Outside quiz';
		if (isSuspended(record)) return 'Paused';
		return 'Scheduled';
	}

	function currentProgressSortValue() {
		if (songSortMode !== 'default') return songSortMode;
		const activeSort = sorting[0];
		if (!activeSort) return 'default';
		if (activeSort.id === 'next_review') return activeSort.desc ? 'dueDesc' : 'dueAsc';
		if (activeSort.id === 'success_rate') return activeSort.desc ? 'rateDesc' : 'rateAsc';
		return 'default';
	}

	function setProgressSort(value) {
		if (value === 'default') {
			songSortMode = 'default';
			sorting = [];
			return;
		}
		if (['titleAsc', 'titleDesc', 'artistAsc', 'artistDesc'].includes(value)) {
			songSortMode = value;
			sorting = [{ id: 'song_ann_id', desc: value.endsWith('Desc') }];
			return;
		}
		songSortMode = 'default';
		sorting = [
			{
				id: value.startsWith('due') ? 'next_review' : 'success_rate',
				desc: value.endsWith('Desc')
			}
		];
	}

	function formatDuration(minutes) {
		if (minutes === null || minutes === undefined) return 'N/A';
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return `${hours}h ${mins}m`;
	}

	function cycleSongSortMode() {
		const modes = ['default', 'titleAsc', 'titleDesc', 'artistAsc', 'artistDesc'];
		const currentIndex = modes.indexOf(songSortMode);
		const nextIndex = (currentIndex + 1) % modes.length;
		songSortMode = modes[nextIndex];

		if (songSortMode === 'default') {
			sorting = [];
		} else if (songSortMode === 'titleAsc' || songSortMode === 'artistAsc') {
			sorting = [{ id: 'song_ann_id', desc: false }];
		} else if (songSortMode === 'titleDesc' || songSortMode === 'artistDesc') {
			sorting = [{ id: 'song_ann_id', desc: true }];
		}
	}

	$effect(() => {
		// Reset song sort mode if sorting is cleared or changed to another column
		const isSongSort = sorting.length > 0 && sorting[0].id === 'song_ann_id';
		if (!isSongSort && sorting.length > 0) {
			songSortMode = 'default';
		} else if (sorting.length === 0 && songSortMode !== 'default') {
			songSortMode = 'default';
		}
	});

	function parseSongKey(record) {
		// Handle record object with potential song_ann_id and legacy annSongId
		if (!record) return { artist: 'Unknown', title: 'Unknown' };

		// Use metadata if available (fastest and most accurate)
		if (record.song_ann_id && data.songMetadata?.[record.song_ann_id]) {
			const meta = data.songMetadata[record.song_ann_id];
			return {
				artist: meta.artist || 'Unknown',
				title: meta.title || 'Unknown',
				anime: meta.anime || 'Unknown'
			};
		}

		// For plays, use correct_answer if available (contains the actual song name)
		if (record.correct_answer) {
			return {
				artist: '',
				title: record.correct_answer
			};
		}

		// Legacy/imported format: "Artist_SongName" in song_key or FSRS state
		const legacySongKey = record.song_key || record.fsrs_state?.songKey;
		if (legacySongKey && typeof legacySongKey === 'string') {
			const parts = legacySongKey.split('_');
			if (parts.length >= 2) {
				return {
					artist: parts[0],
					title: parts.slice(1).join('_')
				};
			}
			return { artist: 'Unknown', title: legacySongKey };
		}

		// Legacy format: "Artist_SongName" string in annSongId field
		const annSongId = record.annSongId;
		if (annSongId && typeof annSongId === 'string') {
			const parts = annSongId.split('_');
			if (parts.length >= 2) {
				return {
					artist: parts[0],
					title: parts.slice(1).join('_')
				};
			}
			return { artist: 'Unknown', title: annSongId };
		}

		// New format: only song_ann_id (numeric) - display ID
		if (record.song_ann_id) {
			return { artist: '', title: `Song #${record.song_ann_id}` };
		}

		return { artist: 'Unknown', title: 'Unknown' };
	}

	async function refreshSessionHistory() {
		await invalidateAll();
		await tick();
		// An outgoing history heading can remain in the DOM during its transition.
		const headingId = data.sessions.length > 0 ? 'recent-sessions-heading' : 'training-heading';
		document.getElementById(headingId)?.focus();
	}

	async function finishSession(sessionId) {
		if (
			!(await confirmInApp(
				`Finish this training session?\n\nThis will set the completion date to now and update the song count to the actual number played (correct + incorrect).`
			))
		) {
			return;
		}

		try {
			const response = await fetch(`/api/training/session/${sessionId}/finish`, {
				method: 'POST'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to finish session');
			}

			const result = await response.json();
			toast.success(result.message || 'Session finished successfully');
			await refreshSessionHistory();
		} catch (error) {
			console.error('Error finishing session:', error);
			toast.error(error.message || 'Failed to finish session');
		}
	}

	let sessionDeletionStatus = $state('');
	let sessionDeletionWarning = $state(false);

	async function deleteSession(sessionId, isComplete = true) {
		const inProgressWarning = isComplete
			? ''
			: `This session is still in progress. If you are playing it in AMQ right now, the rest of its answers will not be saved.\n\n`;
		if (
			!(await confirmInApp(
				`Delete this training session?\n\n${inProgressWarning}This will also delete all play records from this session and recalculate your song progress accordingly.\n\nThis action cannot be undone.`
			))
		) {
			return;
		}

		sessionDeletionStatus = 'Deleting session…';
		sessionDeletionWarning = false;
		let deleted = false;
		try {
			const response = await fetch(`/api/training/session/${sessionId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const failure = await response.json();
				throw new Error(failure.message || 'Failed to delete session');
			}

			const result = await response.json();
			deleted = true;
			sessionDeletionWarning = result.progressUpdated === false || result.recalculationErrors > 0;
			sessionDeletionStatus =
				result.message ||
				(sessionDeletionWarning
					? 'Session deleted, but some song progress could not be recalculated. Review dates may be out of date.'
					: 'Session and play records deleted');
			if (sessionDeletionWarning) toast.warning(sessionDeletionStatus);
			else toast.success(sessionDeletionStatus);
			if (selectedSession?.id === sessionId) {
				await goto(`/training/${data.quiz.id}`, { replaceState: true });
			}
			await refreshSessionHistory();
		} catch (error) {
			console.error('Error deleting session:', error);
			sessionDeletionWarning = true;
			sessionDeletionStatus = deleted
				? `${sessionDeletionStatus} The page could not refresh; reload to see the latest history.`
				: error.message || 'Failed to delete session';
			toast.error(sessionDeletionStatus);
		}
	}

	async function confirmRescheduleDueSongs() {
		rescheduleDialogOpen = false;

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/reset-due`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ days: spreadHorizonDays })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to spread backlog');
			}

			toast.success(result.message);
			window.location.reload();
		} catch (error) {
			console.error('Error spreading backlog:', error);
			toast.error('Failed to spread backlog');
		}
	}

	function dailySettingInputValue(value) {
		return value === '' || value === null || value === undefined ? '' : String(value);
	}

	async function saveDailyReviewLimit() {
		if (savingDailyReviewLimit) return false;
		savingDailyReviewLimit = true;

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					dailyReviewLimit:
						String(dailyReviewLimitInput ?? '').trim() === '' ? null : Number(dailyReviewLimitInput)
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to save daily review limit');
			}

			data = { ...data, quiz: { ...data.quiz, daily_review_limit: result.dailyReviewLimit } };
			toast.success(result.message);
			return true;
		} catch (error) {
			console.error('Error saving daily review limit:', error);
			toast.error(error.message || 'Failed to save daily review limit');
			return false;
		} finally {
			savingDailyReviewLimit = false;
		}
	}

	// Presets save straight away. If the save fails, put the box back to the
	// last value the server accepted so it does not show an unsaved number.
	async function applyDailyReviewLimit(value) {
		if (savingDailyReviewLimit) return;
		dailyReviewLimitInput = dailySettingInputValue(value);
		if (!(await saveDailyReviewLimit())) {
			dailyReviewLimitInput = dailySettingInputValue(data.quiz.daily_review_limit);
		}
	}

	async function saveDailyNewLimit() {
		if (savingDailyNewLimit) return false;
		savingDailyNewLimit = true;

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					dailyNewLimit:
						String(dailyNewLimitInput ?? '').trim() === '' ? null : Number(dailyNewLimitInput)
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to save daily new limit');
			}

			data = { ...data, quiz: { ...data.quiz, daily_new_limit: result.dailyNewLimit } };
			toast.success(result.message);
			return true;
		} catch (error) {
			console.error('Error saving daily new limit:', error);
			toast.error(error.message || 'Failed to save daily new limit');
			return false;
		} finally {
			savingDailyNewLimit = false;
		}
	}

	async function applyDailyNewLimit(value) {
		if (savingDailyNewLimit) return;
		dailyNewLimitInput = dailySettingInputValue(value);
		if (!(await saveDailyNewLimit())) {
			dailyNewLimitInput = dailySettingInputValue(data.quiz.daily_new_limit);
		}
	}

	async function saveDailyReviewGoal() {
		if (savingDailyReviewGoal) return false;
		savingDailyReviewGoal = true;
		const goal =
			String(dailyReviewGoalInput ?? '').trim() === '' ? null : Number(dailyReviewGoalInput);

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dailyReviewGoal: goal })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to save daily review goal');
			}

			data = { ...data, quiz: { ...data.quiz, daily_review_goal: result.dailyReviewGoal } };
			toast.success(result.message);
			return true;
		} catch (error) {
			console.error('Error saving daily review goal:', error);
			toast.error(error.message || 'Failed to save daily review goal');
			return false;
		} finally {
			savingDailyReviewGoal = false;
		}
	}

	async function applyDailyReviewGoal(value) {
		if (savingDailyReviewGoal) return;
		dailyReviewGoalInput = dailySettingInputValue(value);
		if (!(await saveDailyReviewGoal())) {
			dailyReviewGoalInput = dailySettingInputValue(data.quiz.daily_review_goal);
		}
	}

	async function saveCombineDuplicates(checked) {
		const previous = combineDuplicates;
		combineDuplicates = checked;
		savingCombineDuplicates = true;

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ combineDuplicates: checked })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to save combine-duplicates setting');
			}

			toast.success(result.message);
		} catch (error) {
			combineDuplicates = previous;
			console.error('Error saving combine-duplicates setting:', error);
			toast.error(error.message || 'Failed to save combine-duplicates setting');
		} finally {
			savingCombineDuplicates = false;
		}
	}

	async function saveAllowSameDayReviews(checked) {
		const previous = allowSameDayReviews;
		allowSameDayReviews = checked;
		savingAllowSameDayReviews = true;

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/settings`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ allowSameDayReviews: checked })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to save same-day reviews setting');
			}

			toast.success(result.message);
		} catch (error) {
			allowSameDayReviews = previous;
			console.error('Error saving same-day reviews setting:', error);
			toast.error(error.message || 'Failed to save same-day reviews setting');
		} finally {
			savingAllowSameDayReviews = false;
		}
	}

	// N4. Before this existed the only way to reconcile training with an edited
	// quiz was to start a session, or the folklore version: open the editor,
	// change nothing, save, and hope.
	let refreshingPool = $state(false);
	let poolRefreshMessage = $state('');
	let poolRefreshFailed = $state(false);

	async function refreshSongPool() {
		if (refreshingPool) return;
		refreshingPool = true;
		poolRefreshMessage = 'Refreshing the song pool…';
		poolRefreshFailed = false;

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/refresh-pool`, {
				method: 'POST'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to refresh the song pool');
			}

			if (result.success === false) {
				poolRefreshMessage = result.message;
				poolRefreshFailed = true;
				toast.warning(result.message);
				return;
			}

			poolRefreshMessage = result.message;
			toast.success(result.message);

			// Only reload when the table would actually read differently.
			if (result.activated > 0 || result.deactivated > 0) {
				window.location.reload();
			}
		} catch (error) {
			console.error('Error refreshing song pool:', error);
			poolRefreshMessage = error.message || 'Failed to refresh the song pool';
			poolRefreshFailed = true;
			toast.error(poolRefreshMessage);
		} finally {
			refreshingPool = false;
		}
	}

	function viewSessionDetails(sessionId) {
		attemptDeletionStatus = '';
		goto(`/training/${data.quiz.id}?session=${sessionId}`, { replaceState: false });
	}

	function closeSessionDetails() {
		attemptDeletionStatus = '';
		goto(`/training/${data.quiz.id}`, { replaceState: false });
	}

	let attemptDeletionStatus = $state('');

	async function deletePlay(playId) {
		if (
			!(await confirmInApp(
				'Delete this attempt?\n\nThis will remove it from history and recalculate when the song is due.'
			))
		)
			return;

		attemptDeletionStatus = 'Deleting attempt…';
		try {
			const res = await fetch(`/api/training/session/${selectedSession.id}/plays/${playId}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Failed to delete play');
			}

			const result = await res.json();
			attemptDeletionStatus = result.message || 'Attempt deleted successfully';
			if (result.progressUpdated === false) toast.warning(result.message);
			else toast.success('Attempt deleted successfully');
			await invalidateAll();
			await tick();
			document.getElementById('session-details-heading')?.focus();
		} catch (e) {
			console.error(e);
			attemptDeletionStatus = e.message || 'Error deleting play';
			toast.error(e.message || 'Error deleting play');
		}
	}

	async function deleteSong(record) {
		const song = parseSongKey(record);
		if (
			!(await confirmInApp(
				`Delete entire record for "${song.title}"?\n\nThis will permanently delete the song's training history across all sessions.\n\nThis action cannot be undone.`
			))
		) {
			return;
		}

		try {
			const query = new URLSearchParams();
			// Prefer song identifiers, but fall back to record ID if they're not available
			if (record.song_ann_id) {
				query.append('songAnnId', record.song_ann_id);
			} else if (record.annSongId) {
				query.append('annSongId', record.annSongId);
			} else if (record.id) {
				// Use record ID when song identifiers are not available (for training data without IDs)
				query.append('recordId', record.id);
			}

			const response = await fetch(
				`/api/training/${data.quiz.id}/progress/song?${query.toString()}`,
				{
					method: 'DELETE'
				}
			);

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.message || 'Failed to delete song record');
			}

			const result = await response.json();
			toast.success(result.message || 'Song record deleted');
			// Optimistic update: remove from table instantly without reload
			const songId = record.song_ann_id ?? record.annSongId ?? record.id;
			if (songId != null) {
				deletedSongIds = new Set(deletedSongIds).add(String(songId));
			}
		} catch (error) {
			console.error('Error deleting song:', error);
			toast.error(error.message || 'Failed to delete song record');
		}
	}

	/**
	 * Suspension is tracked locally as well as on the server so the table can
	 * update without a full reload — the list is regularly thousands of rows and
	 * `invalidateAll()` on every toggle makes bulk work unusable.
	 */
	function isSuspended(record) {
		const key = String(record.song_ann_id ?? record.annSongId ?? record.id);
		if (suspensionOverrides.has(key)) return suspensionOverrides.get(key) != null;
		return record.suspended_at != null;
	}

	function songIdOf(record) {
		const id = record.song_ann_id ?? record.annSongId;
		return Number.isFinite(Number(id)) ? Number(id) : null;
	}

	/** W17: make a song due immediately without mutating FSRS stability/difficulty. */
	async function markSongDue(record) {
		const annSongId = songIdOf(record);
		if (annSongId == null) {
			toast.error('This row has no annSongId');
			return;
		}

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/again`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ annSongId })
			});
			const result = await response.json();
			if (!response.ok) {
				throw new Error(result.message || result.error || 'Failed to mark due');
			}
			toast.success(result.message || 'Marked for review');
			if (result.alreadyTracked) {
				window.location.reload();
			}
		} catch (error) {
			console.error('Error marking song due:', error);
			toast.error(error.message || 'Failed to mark due');
		}
	}

	async function setSuspended(records, suspended) {
		const ids = [...new Set(records.map(songIdOf).filter((id) => id != null))];
		if (ids.length === 0) {
			toast.error('These songs are missing an ID, so their training status cannot be changed');
			return;
		}

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/suspend`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ songAnnIds: ids, suspended })
			});

			const result = await response.json();
			if (!response.ok) {
				throw new Error(result.message || 'Failed to update training status');
			}

			const next = new Map(suspensionOverrides);
			const stamp = suspended ? new Date().toISOString() : null;
			for (const id of ids) next.set(String(id), stamp);
			suspensionOverrides = next;
			selectedSongIds = new Set();

			toast.success(
				`${suspended ? 'Paused' : 'Resumed'} ${result.updated} song${result.updated === 1 ? '' : 's'}`
			);
		} catch (error) {
			console.error('Error updating training status:', error);
			toast.error(error.message || 'Failed to update training status');
		}
	}

	// ---- Bulk selection (R10) ----
	/** @type {Set<string>} */
	let selectedSongIds = $state(new Set());

	// Going straight from /training/A to /training/B reuses this component, so
	// state seeded from data once would still show quiz A's values.
	let perQuizStateId = data.quiz.id;
	$effect(() => {
		const quizId = data.quiz.id;
		if (quizId === perQuizStateId) return;
		perQuizStateId = quizId;
		untrack(() => {
			dailyReviewLimitInput = dailySettingInputValue(data.quiz.daily_review_limit);
			dailyNewLimitInput = dailySettingInputValue(data.quiz.daily_new_limit);
			dailyReviewGoalInput = dailySettingInputValue(data.quiz.daily_review_goal);
			combineDuplicates = data.quiz.combine_duplicates === true;
			allowSameDayReviews = data.quiz.allow_same_day_reviews !== false;
			selectedSongIds = new Set();
		});
	});

	// ---- W16: mass-add the selection to a song list ----
	let mySongLists = $state([]);
	let bulkTargetListId = $state('');
	let isAddingToList = $state(false);
	let bulkAddStatus = $state('');
	let loadedMySongLists = false;

	async function loadMySongLists() {
		if (loadedMySongLists) return;
		loadedMySongLists = true;
		try {
			const res = await fetch('/api/song-lists');
			if (!res.ok) throw new Error(`Request failed (${res.status})`);
			const payload = await res.json();
			mySongLists = payload.data || payload.lists || [];
		} catch (err) {
			loadedMySongLists = false;
			toast.error('Could not load your song lists.');
		}
	}

	// Load the lists as soon as the bulk bar appears. Loading them on the
	// select's focus event is too late — focus fires before the dropdown paints,
	// so the first click would show an empty menu.
	$effect(() => {
		if (selectedSongIds.size > 0) loadMySongLists();
	});

	async function addSelectedToSongList() {
		const records = selectedRecords();
		const annSongIds = records
			.map((r) => Number(r.song_ann_id ?? r.annSongId))
			.filter((n) => Number.isFinite(n));

		if (annSongIds.length === 0) {
			toast.error('None of the selected rows have a song id.');
			return;
		}

		isAddingToList = true;
		bulkAddStatus = 'Adding selected songs…';
		try {
			const res = await fetch(`/api/song-lists/${bulkTargetListId}/append-bulk`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ annSongIds })
			});
			const result = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(result.message || result.error || `Request failed (${res.status})`);
			}
			bulkAddStatus = result.message;
			toast.success(bulkAddStatus);
			const target = mySongLists.find((l) => l.id === bulkTargetListId);
			if (target && typeof result.songCount === 'number') target.song_count = result.songCount;
		} catch (err) {
			bulkAddStatus = err instanceof Error ? err.message : 'Could not add the songs.';
			toast.error(bulkAddStatus);
		} finally {
			isAddingToList = false;
		}
	}

	function rowKey(record) {
		return String(record.song_ann_id ?? record.annSongId ?? record.id);
	}

	function toggleRow(record) {
		const key = rowKey(record);
		const next = new Set(selectedSongIds);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		selectedSongIds = next;
	}

	/** Rows currently visible on this page of the table. */
	function visibleRows() {
		return table.getRowModel().rows.map((r) => r.original);
	}

	function allVisibleSelected() {
		const rows = visibleRows();
		return rows.length > 0 && rows.every((r) => selectedSongIds.has(rowKey(r)));
	}

	function toggleAllVisible() {
		const rows = visibleRows();
		const next = new Set(selectedSongIds);
		if (allVisibleSelected()) {
			for (const r of rows) next.delete(rowKey(r));
		} else {
			for (const r of rows) next.add(rowKey(r));
		}
		selectedSongIds = next;
	}

	/** Selection is by song id, so resolve back to records across all filtered rows. */
	function selectedRecords() {
		return table
			.getFilteredRowModel()
			.rows.map((r) => r.original)
			.filter((r) => selectedSongIds.has(rowKey(r)));
	}

	function formatDateTime(dateString) {
		if (!dateString) return '-';
		return new Date(dateString).toISOString();
	}

	function formatTime(dateString) {
		if (!dateString) return '-';
		const date = new Date(dateString);
		// Format as ISO 8601 time (HH:mm:ss)
		return date.toISOString().split('T')[1].split('.')[0];
	}

	async function mergeHistoryFromQuiz() {
		if (!mergeSourceId) {
			toast.error('Select a quiz to merge from');
			return;
		}

		if (
			!(await confirmInApp(
				'Merge training history from the selected quiz into this one?\n\nThis will combine attempts and update review dates.\n\nThis action cannot be undone.'
			))
		) {
			return;
		}

		mergeLoading = true;
		try {
			const response = await fetch(`/api/training/${data.quiz.id}/merge`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ sourceQuizId: mergeSourceId })
			});

			const result = await response.json();
			if (!response.ok) {
				throw new Error(result.error || 'Failed to merge history');
			}

			toast.success(`Merged ${result.merged} songs, added ${result.added} new`);
			window.location.reload();
		} catch (error) {
			console.error('Error merging history:', error);
			toast.error(error.message || 'Failed to merge history');
		} finally {
			mergeLoading = false;
		}
	}

	async function cloneQuizWithTraining() {
		const quizName = data.quiz.name;
		const confirmed = await confirmInApp(
			`Clone "${quizName}" with its training data?\n\nThis will copy your training progress, sessions, and attempt history to the new quiz.`
		);
		if (!confirmed) return;

		isCloningTraining = true;
		try {
			const response = await fetch(`/api/quiz-configurations/${data.quiz.id}/clone-with-training`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(
					result.message || result.error || 'Failed to clone quiz with training data'
				);
			}

			const cloneStats = result.trainingClone || {};
			const statsLabel =
				cloneStats.progress || cloneStats.sessions || cloneStats.plays
					? ` (progress ${cloneStats.progress || 0}, sessions ${cloneStats.sessions || 0}, plays ${cloneStats.plays || 0})`
					: '';

			toast.success(`Cloned quiz with training data: ${result.data.name}${statsLabel}`);

			// Navigate to the cloned quiz's training detail page
			goto(`/training/${result.data.id}`);
		} catch (error) {
			console.error('Error cloning quiz with training data:', error);
			toast.error(error.message || 'Failed to clone quiz with training data');
		} finally {
			isCloningTraining = false;
		}
	}
</script>

<svelte:head>
	<title>{data.quiz.name} - Training Details - AMQ Plus</title>
	<meta name="description" content="Training progress and statistics for {data.quiz.name}" />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Back Button & Header -->
	<div class="mb-8">
		<Button href="/training" variant="ghost" size="sm" class="mb-4" disabled={false}>
			<ArrowLeft class="mr-2 h-4 w-4" />
			Back to Training
		</Button>
		<div class="mt-2 flex flex-wrap items-center justify-between gap-3">
			<div>
				<h1 id="training-heading" tabindex="-1" class="text-3xl font-bold text-gray-900">
					{data.quiz.name}
				</h1>
				<p class="mt-2 text-gray-600">{data.quiz.description || 'No description'}</p>
			</div>
			<div class="flex gap-2">
				<Button
					onclick={cloneQuizWithTraining}
					variant="outline"
					size="sm"
					class=""
					disabled={isCloningTraining}
				>
					<Copy class="mr-2 h-4 w-4" />
					{isCloningTraining ? 'Cloning...' : 'Clone Data'}
				</Button>
			</div>
		</div>
	</div>

	{#if data.missingSongGroups?.length}
		<!-- One block per cause. "Newer than the database" is not a problem and must
		     not read like one; only a genuinely unexpected id asks for a report. -->
		<div class="mb-8 space-y-3">
			{#each data.missingSongGroups as group}
				<div
					class="rounded-lg border px-4 py-3 text-sm {group.kind === 'newer-than-database'
						? 'border-blue-200 bg-blue-50 text-blue-900'
						: 'border-amber-200 bg-amber-50 text-amber-900'}"
				>
					<p class="font-medium">
						{group.ids.length} song{group.ids.length === 1 ? '' : 's'} in your training history
						{group.ids.length === 1 ? 'has' : 'have'} no title or artist yet.
					</p>
					<p
						class="mt-1 {group.kind === 'newer-than-database' ? 'text-blue-800' : 'text-amber-800'}"
					>
						{group.message}
					</p>
					<p class="mt-1 text-xs opacity-70">
						Your review history for {group.ids.length === 1 ? 'it' : 'them'} is intact. annSongId{group
							.ids.length === 1
							? ''
							: 's'}: {group.ids.slice(0, 12).join(', ')}{group.ids.length > 12
							? ` and ${group.ids.length - 12} more`
							: ''}
					</p>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Overview Stats Cards -->
	<div class="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<Card class="">
			<CardContent class="px-6 py-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Songs Discovered</p>
						<p class="mt-2 text-3xl font-bold text-gray-900">
							{data.stats.totalSongs} / {data.stats.totalQuizSongs}
						</p>
						<p class="mt-1 text-xs text-gray-500">practiced / total in quiz</p>
					</div>
					<Target class="h-8 w-8 text-blue-500" />
				</div>
			</CardContent>
		</Card>

		<Card class="">
			<CardContent class="px-6 py-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Accuracy</p>
						<p class="mt-2 text-3xl font-bold text-gray-900">{data.stats.accuracy}%</p>
						<p class="mt-1 text-xs text-gray-500">
							{data.stats.last10Success}/{data.stats.last10Total} last 10 per song
						</p>
					</div>
					<TrendingUp class="h-8 w-8 text-purple-500" />
				</div>
			</CardContent>
		</Card>

		<Card class="">
			<CardContent class="px-6 py-6">
				{@const goal =
					data.quiz.daily_review_goal === null || data.quiz.daily_review_goal === undefined
						? null
						: Number(data.quiz.daily_review_goal)}
				{@const progress = data.dueGoalProgress ?? 0}
				{@const catchUp = data.stats.catchUpQueue ?? 0}
				{@const fresh = data.stats.freshDue ?? data.stats.dueToday ?? 0}
				{@const goalMet = goal != null && progress >= goal}
				<div class="flex items-center justify-between">
					<div>
						{#if goal != null}
							<p class="text-sm font-medium text-gray-600">Daily Goal</p>
							<p class="mt-2 text-3xl font-bold {goalMet ? 'text-emerald-600' : 'text-orange-600'}">
								{Math.min(progress, goal)}/{goal}
							</p>
							{#if goalMet}
								<p class="mt-1 text-xs font-medium text-emerald-700">
									Goal met! Further plays are bonus catch-up.
								</p>
							{:else}
								<p class="mt-1 text-xs text-gray-500">
									Play due songs to hit today’s target. {boundaryNote}
								</p>
							{/if}
							{#if catchUp > 0}
								<p class="mt-2 text-sm text-gray-600">
									Catch-Up Queue: <span class="font-semibold text-gray-900">{catchUp}</span>
									<span class="text-xs text-gray-500"> (older overdue)</span>
								</p>
							{:else if fresh > 0}
								<p class="mt-2 text-xs text-gray-500">{fresh} fresh due waiting</p>
							{/if}
						{:else}
							<p class="text-sm font-medium text-gray-600">Due Today</p>
							<p class="mt-2 text-3xl font-bold text-orange-600">{data.stats.dueToday}</p>
							<p class="mt-1 text-xs text-gray-500">songs need review</p>
							<p class="mt-1 text-[11px] text-gray-400">{boundaryNote}</p>
						{/if}
					</div>
					<Clock class="h-8 w-8 {goalMet ? 'text-emerald-500' : 'text-orange-500'}" />
				</div>
			</CardContent>
		</Card>

		<Card class="">
			<CardContent class="px-6 py-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Avg Difficulty</p>
						<p class="mt-2 text-3xl font-bold text-gray-900">{data.stats.averageDifficulty}</p>
						<p class="mt-1 text-xs text-gray-500">across all songs</p>
					</div>
					<Award class="h-8 w-8 text-yellow-500" />
				</div>
			</CardContent>
		</Card>
	</div>

	<!-- Performance Charts -->
	{#if data.progress.length > 0 && !selectedSession}
		<div class="mb-8" transition:slide={{ duration: 300 }}>
			<h2 class="mb-4 text-2xl font-bold text-gray-900">Performance Charts</h2>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<!-- Accuracy Over Time -->
				{#if data.performanceOverTime.length > 0}
					<Card class="min-w-0">
						<CardHeader class="">
							<CardTitle class="">Accuracy Over Time</CardTitle>
							<CardDescription class="">Your performance trend</CardDescription>
						</CardHeader>
						<CardContent class="">
							<div use:resizeChart bind:this={accuracyChartContainer} style="height: 300px;"></div>
						</CardContent>
					</Card>
				{/if}

				<!-- Mastery Distribution -->
				<Card class="min-w-0">
					<CardHeader class="">
						<CardTitle class="">Mastery Distribution</CardTitle>
						<CardDescription class="">Songs by learning stage</CardDescription>
					</CardHeader>
					<CardContent class="">
						<div use:resizeChart bind:this={masteryChartContainer} style="height: 300px;"></div>
					</CardContent>
				</Card>

				<!-- Review Forecast -->
				{#if data.forecast.length > 0}
					<Card class="min-w-0 md:col-span-2">
						<CardHeader class="">
							<CardTitle class="">Review Forecast</CardTitle>
							<CardDescription class=""
								>Songs due in the next 7 days. {boundaryNote}</CardDescription
							>
						</CardHeader>
						<CardContent class="">
							<div use:resizeChart bind:this={forecastChartContainer} style="height: 300px;"></div>
						</CardContent>
					</Card>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Recent Sessions (moved above Song Progress) -->
	<div role="status" aria-live="polite" aria-atomic="true">
		{#if sessionDeletionStatus}
			<p class="mb-4 rounded-md border p-3 text-sm" class:border-amber-300={sessionDeletionWarning}>
				{sessionDeletionStatus}
			</p>
		{/if}
	</div>
	{#if data.sessions.length > 0 && !selectedSession}
		<div class="mb-8" transition:slide={{ duration: 300 }}>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="recent-sessions-heading" tabindex="-1" class="text-2xl font-bold text-gray-900">
					Recent Sessions
				</h2>
				<div class="flex items-center gap-2">
					<label
						for="show-in-progress-toggle"
						class="cursor-pointer text-sm font-medium text-gray-700"
					>
						Show in progress
					</label>
					<Switch id="show-in-progress-toggle" class="" bind:checked={showInProgressSessions} />
				</div>
			</div>
			<Card class="">
				<CardContent class="p-0">
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead class="border-b bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700">Date</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700">Duration</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700">Songs</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700">Pool Size</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700">Correct</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700">Incorrect</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700">Accuracy</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each paginatedSessions as session}
									<tr class="hover:bg-gray-50">
										<td class="px-6 py-4 text-sm text-gray-700">
											{#if session.isComplete}
												{formatDate(session.endedAt)}
											{:else}
												<span class="font-medium text-orange-600">In progress</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-sm text-gray-700">
											{formatDuration(session.duration)}
										</td>
										<td class="px-6 py-4 text-sm text-gray-700">{session.totalSongs}</td>
										<td class="px-6 py-4 text-sm text-gray-600">
											{session.poolSize || '-'}
										</td>
										<td class="px-6 py-4 text-sm text-green-600">{session.correctSongs}</td>
										<td class="px-6 py-4 text-sm text-red-600">{session.incorrectSongs}</td>
										<td class="px-6 py-4">
											<Badge
												variant={session.accuracy >= 80
													? 'success'
													: session.accuracy >= 60
														? 'default'
														: 'destructive'}
												class=""
												href={undefined}
											>
												{session.accuracy}%
											</Badge>
										</td>
										<td class="px-6 py-4">
											<div class="flex gap-1">
												<Button
													onclick={() => viewSessionDetails(session.id)}
													class="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
													size="sm"
													variant="ghost"
													disabled={false}
													title="View Details"
													aria-label={`View details for session from ${formatDate(session.startedAt)} at ${formatTime(session.startedAt)} UTC`}
												>
													<Eye class="h-4 w-4" aria-hidden="true" />
												</Button>
												{#if !session.isComplete}
													<Button
														class="text-green-600 hover:bg-green-50 hover:text-green-700"
														size="sm"
														variant="ghost"
														onclick={() => finishSession(session.id)}
														disabled={false}
														title="Finish Session"
														aria-label={`Finish session from ${formatDate(session.startedAt)} at ${formatTime(session.startedAt)} UTC`}
													>
														<CheckCircle class="h-4 w-4" aria-hidden="true" />
													</Button>
												{/if}
												<Button
													class="text-red-600 hover:bg-red-50 hover:text-red-700"
													size="sm"
													variant="ghost"
													onclick={() => deleteSession(session.id, session.isComplete)}
													disabled={false}
													title="Delete Session"
													aria-label={`Delete session from ${formatDate(session.startedAt)} at ${formatTime(session.startedAt)} UTC`}
												>
													<Trash2 class="h-4 w-4" aria-hidden="true" />
												</Button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination Controls -->
					{#if totalSessionPages > 1}
						<div class="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4">
							<div class="text-sm text-gray-700">
								Showing {(currentSessionPage - 1) * SESSIONS_PER_PAGE + 1} to {Math.min(
									currentSessionPage * SESSIONS_PER_PAGE,
									filteredSessions.length
								)} of {filteredSessions.length} sessions
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<Button
									onclick={() => (currentSessionPage = Math.max(1, currentSessionPage - 1))}
									variant="outline"
									size="sm"
									disabled={currentSessionPage === 1}
								>
									<ChevronLeft class="h-4 w-4" />
									Previous
								</Button>
								<div class="flex flex-wrap items-center gap-1">
									{#each Array.from({ length: Math.min(5, totalSessionPages) }, (_, i) => {
										const start = Math.max(1, Math.min(currentSessionPage - 2, totalSessionPages - 4));
										return start + i;
									}) as pageNum}
										<Button
											onclick={() => (currentSessionPage = pageNum)}
											variant={currentSessionPage === pageNum ? 'default' : 'outline'}
											size="sm"
											disabled={false}
										>
											{pageNum}
										</Button>
									{/each}
								</div>
								<Button
									onclick={() =>
										(currentSessionPage = Math.min(totalSessionPages, currentSessionPage + 1))}
									variant="outline"
									size="sm"
									disabled={currentSessionPage === totalSessionPages}
								>
									Next
									<ChevronRight class="h-4 w-4" />
								</Button>
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>
	{/if}

	<!-- Session Details Panel (shown when a session is selected) -->
	{#if selectedSession}
		{#if !selectedSession.isComplete}<p class="mb-3 text-sm text-amber-700">
				Finish this session before deleting individual attempts. You can still delete the whole
				session.
			</p>{/if}
		<div class="mb-8" transition:slide={{ duration: 300 }}>
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-4">
					<Button
						onclick={closeSessionDetails}
						variant="outline"
						size="sm"
						disabled={false}
						class=""
					>
						<ArrowLeft class="mr-2 h-4 w-4" />
						Back to Sessions
					</Button>
					<h2 id="session-details-heading" tabindex="-1" class="text-2xl font-bold text-gray-900">
						Session Details
					</h2>
				</div>
				<Button
					class="text-red-600 hover:bg-red-50 hover:text-red-700"
					size="sm"
					variant="ghost"
					onclick={() => deleteSession(selectedSession.id, selectedSession.isComplete)}
					disabled={false}
					title="Delete Session"
					aria-label={`Delete session from ${formatDate(selectedSession.startedAt)} at ${formatTime(selectedSession.startedAt)} UTC`}
				>
					<Trash2 class="mr-2 h-4 w-4" aria-hidden="true" />
					Delete session
				</Button>
			</div>

			<p role="status" aria-live="polite" class="mb-4 text-sm text-gray-700">
				{attemptDeletionStatus}
			</p>

			<!-- Session Stats Cards -->
			<div class="mb-6 grid gap-4 md:grid-cols-4">
				<Card class="">
					<CardContent class="flex items-center justify-between p-6">
						<div>
							<p class="text-sm font-medium text-gray-500">Duration</p>
							<p class="text-2xl font-bold">
								{selectedSession.duration !== null
									? selectedSession.duration + 'm'
									: selectedSession.isComplete
										? 'N/A'
										: 'In Progress'}
							</p>
						</div>
						<Timer class="h-8 w-8 text-blue-500" />
					</CardContent>
				</Card>

				<Card class="">
					<CardContent class="flex items-center justify-between p-6">
						<div>
							<p class="text-sm font-medium text-gray-500">Songs Played</p>
							<p class="text-2xl font-bold">{sessionPlays.length}</p>
						</div>
						<Play class="h-8 w-8 text-purple-500" />
					</CardContent>
				</Card>

				<Card class="">
					<CardContent class="flex items-center justify-between p-6">
						<div>
							<p class="text-sm font-medium text-gray-500">Correct</p>
							<p class="text-2xl font-bold text-green-600">{selectedSession.correctSongs}</p>
						</div>
						<CheckCircle class="h-8 w-8 text-green-500" />
					</CardContent>
				</Card>

				<Card class="">
					<CardContent class="flex items-center justify-between p-6">
						<div>
							<p class="text-sm font-medium text-gray-500">Incorrect</p>
							<p class="text-2xl font-bold text-red-600">
								{selectedSession.incorrectSongs}
							</p>
						</div>
						<XCircle class="h-8 w-8 text-red-500" />
					</CardContent>
				</Card>
			</div>

			<!-- Session Composition -->
			{#if selectedSession.composition}
				<Card class="mb-6">
					<CardHeader class="">
						<CardTitle class="text-lg">Session Composition</CardTitle>
					</CardHeader>
					<CardContent class="">
						<div class="flex flex-wrap gap-4">
							<div class="flex items-center gap-2">
								<span class="h-3 w-3 rounded-full bg-blue-500"></span>
								<span class="font-medium">{selectedSession.composition.due || 0}</span> Due
							</div>
							<div class="flex items-center gap-2">
								<span class="h-3 w-3 rounded-full bg-purple-500"></span>
								<span class="font-medium">{selectedSession.composition.new || 0}</span> New
							</div>
							<div class="flex items-center gap-2">
								<span class="h-3 w-3 rounded-full bg-orange-500"></span>
								<span class="font-medium"
									>{(selectedSession.composition.revision || 0) +
										(selectedSession.composition.shelved || 0)}</span
								>
								Extra practice
							</div>
						</div>
					</CardContent>
				</Card>
			{/if}

			<!-- Play History Table -->
			<Card class="">
				<CardHeader class="">
					<CardTitle class="">Play History</CardTitle>
					<CardDescription class="">
						{formatDateTime(selectedSession.startedAt)} • {sessionPlays.length} plays
					</CardDescription>
				</CardHeader>
				<CardContent class="p-0">
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead class="bg-gray-50 text-gray-500">
								<tr>
									<th class="px-6 py-3 text-left font-medium">Time</th>
									<th class="px-6 py-3 text-left font-medium">Song</th>
									<th class="px-6 py-3 text-left font-medium">Your Answer</th>
									<th class="px-6 py-3 text-left font-medium">Correct Answer</th>
									<th class="px-6 py-3 text-left font-medium">Result</th>
									<th class="px-6 py-3 text-left font-medium">Rating</th>
									<th class="px-6 py-3 text-right font-medium">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each sessionPlays as play}
									{@const song = parseSongKey(play)}
									<tr class="hover:bg-gray-50">
										<td class="px-6 py-4 whitespace-nowrap text-gray-500">
											{formatTime(play.played_at)}
										</td>
										<td class="px-6 py-4">
											<div class="font-medium text-gray-900">{song.title}</div>
											<div class="text-xs text-gray-500">{song.artist}</div>
										</td>
										<td class="max-w-xs truncate px-6 py-4" title={play.user_answer}>
											{play.user_answer || '-'}
										</td>
										<td class="max-w-xs truncate px-6 py-4" title={play.correct_answer}>
											{play.correct_answer || '-'}
										</td>
										<td class="px-6 py-4">
											{#if play.success}
												<Badge
													variant="success"
													class="border-green-200 bg-green-100 text-green-700"
													href={undefined}>Correct</Badge
												>
											{:else}
												<Badge
													variant="destructive"
													class="border-red-200 bg-red-100 text-red-700"
													href={undefined}>Incorrect</Badge
												>
											{/if}
										</td>
										<td class="px-6 py-4">
											{#if play.rating === 1}
												<span class="font-medium text-red-600" title="FSRS rating 1">No idea</span>
											{:else if play.rating === 2}
												<span class="font-medium text-orange-600" title="FSRS rating 2"
													>Lucky guess</span
												>
											{:else if play.rating === 3}
												<span class="font-medium text-blue-600" title="FSRS rating 3">Okay</span>
											{:else if play.rating === 4}
												<span class="font-medium text-green-600" title="FSRS rating 4">Trivial</span
												>
											{/if}
										</td>
										<td class="px-6 py-4 text-right">
											<Button
												variant="ghost"
												size="icon"
												class="text-red-500 hover:bg-red-50 hover:text-red-700"
												onclick={() => deletePlay(play.id)}
												title={selectedSession.isComplete
													? 'Delete attempt'
													: 'Finish this session before deleting its history'}
												aria-label={`Delete training attempt for ${song.title} at ${formatTime(play.played_at)} UTC`}
												disabled={!selectedSession.isComplete}
											>
												<Trash2 class="h-4 w-4" aria-hidden="true" />
											</Button>
										</td>
									</tr>
								{/each}
								{#if sessionPlays.length === 0}
									<tr>
										<td colspan="7" class="px-6 py-8 text-center text-gray-500">
											No plays recorded for this session.
										</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	{/if}

	{#snippet progressStatus(record)}
		{@const status = getProgressStatusLabel(record)}
		<span
			class={[
				'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
				status === 'Paused' && 'bg-amber-100 text-amber-800',
				status === 'Outside quiz' && 'bg-gray-100 text-gray-700',
				status === 'Scheduled' && 'bg-emerald-50 text-emerald-700'
			]}
		>
			{status}
		</span>
	{/snippet}

	{#snippet progressActions(record, showLabels)}
		{@const song = parseSongKey(record)}
		<div
			class={['items-center gap-2', showLabels ? 'grid w-full grid-cols-2' : 'flex justify-end']}
		>
			<Button
				variant="outline"
				size={showLabels ? 'sm' : 'icon'}
				class={[
					'text-blue-700 hover:bg-blue-50 hover:text-blue-900',
					showLabels ? 'min-w-0 flex-1 px-2' : ''
				]}
				onclick={() => markSongDue(record)}
				aria-label={`Mark ${song.title} due for the next training session`}
				title="Schedule for the next training session without changing how well you know it"
			>
				<RotateCcw class="h-4 w-4" aria-hidden="true" />
				{#if showLabels}<span>Mark due</span>{/if}
			</Button>
			<Button
				variant="outline"
				size={showLabels ? 'sm' : 'icon'}
				class={[
					showLabels ? 'min-w-0 flex-1 px-2' : '',
					isSuspended(record)
						? 'border-amber-200 text-amber-700 hover:bg-amber-50'
						: 'text-gray-700 hover:bg-gray-100'
				]}
				onclick={() => setSuspended([record], !isSuspended(record))}
				aria-label={isSuspended(record)
					? `Resume ${song.title} in training`
					: `Pause ${song.title} from training`}
				title={isSuspended(record)
					? 'Let this song return to training'
					: 'Keep this song out of training without deleting its history'}
			>
				{#if isSuspended(record)}
					<PlayCircle class="h-4 w-4" aria-hidden="true" />
					{#if showLabels}<span>Resume</span>{/if}
				{:else}
					<PauseCircle class="h-4 w-4" aria-hidden="true" />
					{#if showLabels}<span>Pause</span>{/if}
				{/if}
			</Button>
			<Button
				variant="outline"
				size={showLabels ? 'sm' : 'icon'}
				class={[
					'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800',
					showLabels ? 'col-span-2 min-w-0 px-2' : ''
				]}
				onclick={() => deleteSong(record)}
				aria-label={`Delete all training history for ${song.title}`}
				disabled={data.sessions.some((session) => !session.isComplete)}
				title={data.sessions.some((session) => !session.isComplete)
					? 'Finish the active training session before deleting song history'
					: "Permanently delete this song's training history"}
			>
				<Trash2 class="h-4 w-4" aria-hidden="true" />
				{#if showLabels}<span>Delete</span>{/if}
			</Button>
		</div>
	{/snippet}

	<!-- Song Progress Table (hidden when viewing session details) -->
	{#if data.progress.length > 0 && !selectedSession}
		<div class="mb-8" transition:slide={{ duration: 300 }}>
			<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<h2 class="text-2xl font-bold text-gray-900">Song Progress</h2>
				<div class="flex flex-wrap gap-2">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class="hidden h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-gray-100 md:inline-flex"
						>
							Columns
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#each table
								.getAllLeafColumns()
								.filter((column) => !['select', 'actions'].includes(column.id)) as column (column.id)}
								<DropdownMenu.CheckboxItem
									checked={column.getIsVisible()}
									onCheckedChange={(checked) => column.toggleVisibility(checked)}
									closeOnSelect={false}
								>
									{column.columnDef.header}
								</DropdownMenu.CheckboxItem>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					{#if data.stats.catchUpQueue >= 100 || data.stats.dueToday >= 100}
						<Button
							onclick={() => (rescheduleDialogOpen = true)}
							variant="default"
							size="sm"
							class="bg-orange-600 hover:bg-orange-700"
							disabled={false}
						>
							<CalendarClock class="mr-2 h-4 w-4" />
							Spread backlog ({data.stats.dueToday})
						</Button>
					{:else if data.stats.dueToday > 5}
						<Button
							onclick={() => (rescheduleDialogOpen = true)}
							variant="outline"
							size="sm"
							class=""
							disabled={false}
						>
							<CalendarClock class="mr-2 h-4 w-4" />
							Spread backlog ({data.stats.dueToday})
						</Button>
					{/if}
				</div>
			</div>

			<!-- Filters and Search -->
			<div
				class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(140px,180px))]"
			>
				<!-- Search Bar -->
				<div class="relative min-w-0 sm:col-span-2 lg:col-span-1">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
					<Input
						type="text"
						bind:value={searchQuery}
						placeholder="Search by song, artist or anime..."
						aria-label="Search song progress by song, artist, or anime"
						class="pl-10"
					/>
				</div>

				<!-- Learning Stage Filter -->
				<Select.Root type="single" bind:value={learningStageFilter}>
					<Select.Trigger class="w-full" aria-label="Filter by learning stage">
						{#if learningStageFilter === 'all'}
							All Stages
						{:else if learningStageFilter === 'new'}
							New
						{:else if learningStageFilter === 'learning'}
							Learning
						{:else if learningStageFilter === 'review'}
							Review
						{:else if learningStageFilter === 'relearning'}
							Relearning
						{:else}
							Learning Stage
						{/if}
					</Select.Trigger>
					<Select.Content class="" portalProps={{}}>
						<Select.Item value="all" label="All Stages" class="">All Stages</Select.Item>
						<Select.Item value="new" label="New" class="">New</Select.Item>
						<Select.Item value="learning" label="Learning" class="">Learning</Select.Item>
						<Select.Item value="review" label="Review" class="">Review</Select.Item>
						<Select.Item value="relearning" label="Relearning" class="">Relearning</Select.Item>
					</Select.Content>
				</Select.Root>

				<!-- Selection Type Filter -->
				<Select.Root type="single" bind:value={selectionTypeFilter}>
					<Select.Trigger class="w-full" aria-label="Filter by selection type">
						{#if selectionTypeFilter === 'all'}
							All Types
						{:else if selectionTypeFilter === 'due'}
							Due
						{:else if selectionTypeFilter === 'new'}
							New
						{:else if selectionTypeFilter === 'revision'}
							Extra practice
						{:else}
							Selection Type
						{/if}
					</Select.Trigger>
					<Select.Content class="" portalProps={{}}>
						<Select.Item value="all" label="All Types" class="">All Types</Select.Item>
						<Select.Item value="due" label="Due" class="">Due</Select.Item>
						<Select.Item value="new" label="New" class="">New</Select.Item>
						<Select.Item value="revision" label="Extra practice" class=""
							>Extra practice</Select.Item
						>
					</Select.Content>
				</Select.Root>

				<Select.Root type="single" bind:value={statusFilter}>
					<Select.Trigger class="w-full" aria-label="Filter by status">
						{#if statusFilter === 'all'}
							All statuses
						{:else if statusFilter === 'in-quiz'}
							Hide outside quiz
						{:else if statusFilter === 'outside'}
							Outside quiz
						{:else if statusFilter === 'paused'}
							Paused
						{:else if statusFilter === 'scheduled'}
							Scheduled
						{:else}
							Status
						{/if}
					</Select.Trigger>
					<Select.Content class="" portalProps={{}}>
						<Select.Item value="all" label="All statuses" class="">All statuses</Select.Item>
						<Select.Item value="in-quiz" label="Hide outside quiz" class=""
							>Hide outside quiz</Select.Item
						>
						<Select.Item value="outside" label="Outside quiz" class="">Outside quiz</Select.Item>
						<Select.Item value="paused" label="Paused" class="">Paused</Select.Item>
						<Select.Item value="scheduled" label="Scheduled" class="">Scheduled</Select.Item>
					</Select.Content>
				</Select.Root>

				<div class="sm:col-span-2 md:hidden">
					<Select.Root
						type="single"
						value={currentProgressSortValue()}
						onValueChange={setProgressSort}
					>
						<Select.Trigger class="w-full" aria-label="Sort song progress">
							Sort: {currentProgressSortValue() === 'default'
								? 'Default'
								: currentProgressSortValue() === 'titleAsc'
									? 'Song A–Z'
									: currentProgressSortValue() === 'titleDesc'
										? 'Song Z–A'
										: currentProgressSortValue() === 'artistAsc'
											? 'Artist A–Z'
											: currentProgressSortValue() === 'artistDesc'
												? 'Artist Z–A'
												: currentProgressSortValue() === 'dueAsc'
													? 'Due soonest'
													: currentProgressSortValue() === 'dueDesc'
														? 'Due latest'
														: currentProgressSortValue() === 'rateDesc'
															? 'Highest success rate'
															: 'Lowest success rate'}
						</Select.Trigger>
						<Select.Content portalProps={{}}>
							<Select.Item value="default" label="Default">Default</Select.Item>
							<Select.Item value="titleAsc" label="Song A–Z">Song A–Z</Select.Item>
							<Select.Item value="titleDesc" label="Song Z–A">Song Z–A</Select.Item>
							<Select.Item value="artistAsc" label="Artist A–Z">Artist A–Z</Select.Item>
							<Select.Item value="artistDesc" label="Artist Z–A">Artist Z–A</Select.Item>
							<Select.Item value="dueAsc" label="Due soonest">Due soonest</Select.Item>
							<Select.Item value="dueDesc" label="Due latest">Due latest</Select.Item>
							<Select.Item value="rateDesc" label="Highest success rate"
								>Highest success rate</Select.Item
							>
							<Select.Item value="rateAsc" label="Lowest success rate"
								>Lowest success rate</Select.Item
							>
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			<!-- Bulk actions (R10). Sort by difficulty, select a range, act on all of
			     them — Cherryish's original proposal, and the reason suspend exists. -->
			{#if selectedSongIds.size > 0}
				<div
					class="sticky bottom-3 z-30 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/95 px-4 py-3 shadow-lg backdrop-blur md:static md:rounded-lg md:shadow-none"
					transition:slide={{ duration: 150 }}
					role="region"
					aria-label="Selected-song actions"
				>
					<span class="text-sm font-medium text-blue-900">
						{selectedSongIds.size} song{selectedSongIds.size === 1 ? '' : 's'} selected
					</span>
					<div class="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={false}
							onclick={() => setSuspended(selectedRecords(), true)}
						>
							<PauseCircle class="mr-2 h-4 w-4" />
							Pause
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={false}
							onclick={() => setSuspended(selectedRecords(), false)}
						>
							<PlayCircle class="mr-2 h-4 w-4" />
							Resume
						</Button>
						<!-- W16, doomchicken Mar 5: same select-and-act interaction, with
						     "add to song list" as the action. Reuses the search and sort
						     already on this table. -->
						<select
							class="h-8 max-w-full rounded-md border border-blue-200 bg-white px-2 text-sm"
							bind:value={bulkTargetListId}
							aria-label="Song list to add selected songs to"
						>
							<option value="">Add to song list…</option>
							{#each mySongLists as list}
								<option value={list.id}>{list.name} ({list.song_count ?? 0})</option>
							{/each}
						</select>
						<Button
							size="sm"
							variant="outline"
							disabled={!bulkTargetListId || isAddingToList}
							onclick={addSelectedToSongList}
						>
							{isAddingToList ? 'Adding…' : 'Add'}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={false}
							onclick={() => (selectedSongIds = new Set())}
						>
							Clear selection
						</Button>
					</div>
					<p role="status" aria-live="polite" aria-atomic="true" class="mt-2 text-sm">
						{bulkAddStatus}
					</p>
				</div>
			{/if}

			<!-- Mobile cards use the same paginated/sorted row model and action snippets as the table. -->
			<div class="space-y-3 md:hidden">
				{#if table.getRowModel().rows?.length}
					<div class="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
						<label class="flex cursor-pointer items-center gap-3 text-sm font-medium">
							<input
								type="checkbox"
								class="h-5 w-5 rounded border-gray-300"
								checked={allVisibleSelected()}
								onchange={toggleAllVisible}
							/>
							Select this page
						</label>
						<span class="text-xs text-gray-500">{table.getRowModel().rows.length} shown</span>
					</div>

					{#each table.getRowModel().rows as row (row.id)}
						{@const record = row.original}
						{@const song = parseSongKey(record)}
						{@const recentRate = getRecentSuccessRate(record)}
						<article
							class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
							aria-labelledby={`progress-song-${row.id}`}
						>
							<div class="space-y-4 p-4">
								<div class="flex items-start gap-3">
									<label
										class="-m-2 flex cursor-pointer items-center justify-center rounded-md p-2"
									>
										<input
											type="checkbox"
											class="h-5 w-5 rounded border-gray-300"
											checked={selectedSongIds.has(rowKey(record))}
											onchange={() => toggleRow(record)}
											aria-label={`Select ${song.title}`}
										/>
									</label>
									<div class="min-w-0 flex-1">
										<h3 id={`progress-song-${row.id}`} class="truncate font-semibold text-gray-950">
											{song.title}
										</h3>
										{#if song.artist}
											<p class="truncate text-sm text-gray-600">{song.artist}</p>
										{/if}
										<p class="mt-1 line-clamp-2 text-sm text-gray-700">
											{song.anime || 'Unknown anime'}
										</p>
									</div>
									{@render progressStatus(record)}
								</div>

								<div class="grid grid-cols-3 divide-x rounded-lg bg-gray-50 py-3 text-center">
									<div class="px-2">
										<p class="text-[11px] font-medium text-gray-500">Due</p>
										<p class="mt-1 text-sm font-semibold text-gray-900">
											{record.fsrs_state?.due ? formatDate(record.fsrs_state.due) : 'New'}
										</p>
									</div>
									<div class="px-2">
										<p class="text-[11px] font-medium text-gray-500">Last result</p>
										<p class="mt-1 truncate text-sm font-semibold text-gray-900">
											{getLastRatingLabel(record)}
										</p>
									</div>
									<div class="px-2">
										<p class="text-[11px] font-medium text-gray-500">Recent</p>
										<p class="mt-1 text-sm font-semibold text-gray-900">
											{recentRate === null ? '—' : `${recentRate}%`}
										</p>
									</div>
								</div>

								<details class="group rounded-lg border border-gray-200 bg-gray-50/60">
									<summary
										class="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
									>
										Training details
										<ChevronDown
											class="h-4 w-4 transition-transform group-open:rotate-180"
											aria-hidden="true"
										/>
									</summary>
									<dl class="grid grid-cols-2 gap-x-4 gap-y-3 border-t px-3 py-3 text-sm">
										<div>
											<dt class="text-gray-500">Stage</dt>
											<dd class="font-medium text-gray-900">{getLearningStageLabel(record)}</dd>
										</div>
										<div>
											<dt class="text-gray-500">Session type</dt>
											<dd class="font-medium text-gray-900">{getSelectionTypeLabel(record)}</dd>
										</div>
										<div>
											<dt class="text-gray-500">Attempts</dt>
											<dd class="font-medium text-gray-900">
												{record.success_count ?? 0} correct · {Math.max(
													0,
													(record.attempt_count ?? 0) - (record.success_count ?? 0)
												)} missed
											</dd>
										</div>
										<div>
											<dt class="text-gray-500">Last attempt</dt>
											<dd class="font-medium text-gray-900">
												{formatDate(record.last_attempt_at)}
											</dd>
										</div>
										<div>
											<dt class="text-gray-500">Difficulty</dt>
											<dd class="font-medium text-gray-900">
												{record.fsrs_state?.difficulty?.toFixed?.(1) ?? '—'}
											</dd>
										</div>
										<div>
											<dt class="text-gray-500">Song ID</dt>
											<dd class="font-mono text-xs font-medium text-gray-900">
												{record.song_ann_id ?? record.annSongId ?? '—'}
											</dd>
										</div>
									</dl>
								</details>

								{@render progressActions(record, true)}
							</div>
						</article>
					{/each}
				{:else}
					<div class="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-gray-600">
						No songs found with current filters.
					</div>
				{/if}

				{#if table.getPageCount() > 1}
					<nav class="rounded-xl border bg-white p-3" aria-label="Song progress pages">
						<p class="mb-3 text-center text-sm text-gray-600">
							Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} ·
							{table.getFilteredRowModel().rows.length} songs
						</p>
						<div class="grid grid-cols-2 gap-3">
							<Button
								onclick={() => table.previousPage()}
								variant="outline"
								disabled={!table.getCanPreviousPage()}
							>
								<ChevronLeft class="h-4 w-4" aria-hidden="true" /> Previous
							</Button>
							<Button
								onclick={() => table.nextPage()}
								variant="outline"
								disabled={!table.getCanNextPage()}
							>
								Next <ChevronRight class="h-4 w-4" aria-hidden="true" />
							</Button>
						</div>
					</nav>
				{/if}
			</div>

			<!-- Desktop TanStack table -->
			<Card class="hidden md:block">
				<CardContent class="p-0">
					<div class="overflow-x-auto">
						<Table.Root class="table-fixed">
							<Table.Header class="">
								{#each table.getHeaderGroups() as headerGroup}
									<Table.Row class="">
										{#each headerGroup.headers as header}
											<Table.Head
												class="relative px-6 py-3 {header.id === 'actions' ? 'text-right' : ''}"
												style={`width: ${header.getSize()}px`}
											>
												{#if header.id === 'select'}
													<label class="flex cursor-pointer items-center justify-center">
														<input
															type="checkbox"
															class="h-5 w-5 rounded border-gray-300"
															checked={allVisibleSelected()}
															onchange={toggleAllVisible}
															aria-label="Select all songs on this page"
														/>
													</label>
												{:else if !header.isPlaceholder}
													{#if header.column.getCanSort()}
														<button
															class="flex items-center gap-2 text-xs font-medium text-gray-700 hover:text-gray-900"
															onclick={() => {
																if (header.column.id === 'song_ann_id') {
																	cycleSongSortMode();
																} else {
																	header.column.toggleSorting();
																}
															}}
														>
															<FlexRender
																attach={header.column.columnDef.header}
																content={header.column.columnDef.header}
																context={header.getContext()}
															/>
															{#if header.column.id === 'song_ann_id'}
																{#if songSortMode === 'titleAsc'}
																	<span class="mr-1 text-[10px] text-gray-500 lowercase">title</span
																	>
																	<ChevronUp class="h-4 w-4" />
																{:else if songSortMode === 'titleDesc'}
																	<span class="mr-1 text-[10px] text-gray-500 lowercase">title</span
																	>
																	<ChevronDown class="h-4 w-4" />
																{:else if songSortMode === 'artistAsc'}
																	<span class="mr-1 text-[10px] text-gray-500 lowercase"
																		>artist</span
																	>
																	<ChevronUp class="h-4 w-4" />
																{:else if songSortMode === 'artistDesc'}
																	<span class="mr-1 text-[10px] text-gray-500 lowercase"
																		>artist</span
																	>
																	<ChevronDown class="h-4 w-4" />
																{:else}
																	<ChevronsUpDown class="h-4 w-4 opacity-50" />
																{/if}
															{:else if header.column.getIsSorted() === 'asc'}
																<ChevronUp class="h-4 w-4" />
															{:else if header.column.getIsSorted() === 'desc'}
																<ChevronDown class="h-4 w-4" />
															{:else}
																<ChevronsUpDown class="h-4 w-4 opacity-50" />
															{/if}
														</button>
													{:else}
														<div class="text-xs font-medium text-gray-700">
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
								{#if table.getRowModel().rows?.length}
									{#each table.getRowModel().rows as row}
										<Table.Row class="">
											{#each row.getVisibleCells() as cell}
												<Table.Cell
													class="px-6 py-4 text-sm {cell.column.id === 'actions'
														? 'text-right'
														: ''}"
													style={`width: ${cell.column.getSize()}px`}
												>
													{#if cell.column.id === 'select'}
														<label class="flex cursor-pointer items-center justify-center">
															<input
																type="checkbox"
																class="h-5 w-5 rounded border-gray-300"
																checked={selectedSongIds.has(rowKey(row.original))}
																onchange={() => toggleRow(row.original)}
																aria-label={`Select ${parseSongKey(row.original).title}`}
															/>
														</label>
													{:else if cell.column.id === 'suspended'}
														{@render progressStatus(row.original)}
													{:else if cell.column.id === 'actions'}
														{@render progressActions(row.original, false)}
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
										<Table.Cell colspan={columns.length} class="h-24 text-center">
											No songs found with current filters.
										</Table.Cell>
									</Table.Row>
								{/if}
							</Table.Body>
						</Table.Root>
					</div>

					<!-- Pagination Controls -->
					{#if table.getPageCount() > 1}
						<nav
							class="flex items-center justify-between border-t px-6 py-4"
							aria-label="Song progress pages"
						>
							<div class="text-sm text-gray-700">
								Showing {table.getState().pagination.pageIndex *
									table.getState().pagination.pageSize +
									1} to
								{Math.min(
									(table.getState().pagination.pageIndex + 1) *
										table.getState().pagination.pageSize,
									table.getFilteredRowModel().rows.length
								)} of {table.getFilteredRowModel().rows.length} songs
							</div>
							<div class="flex gap-2">
								<Button
									onclick={() => table.previousPage()}
									variant="outline"
									size="sm"
									disabled={!table.getCanPreviousPage()}
								>
									<ChevronLeft class="h-4 w-4" />
									Previous
								</Button>
								<div class="flex items-center gap-1">
									{#each Array.from({ length: Math.min(5, table.getPageCount()) }, (_, i) => {
										const start = Math.max(0, Math.min(table.getState().pagination.pageIndex - 2, table.getPageCount() - 5));
										return start + i;
									}) as page}
										<Button
											class="min-w-10"
											onclick={() => table.setPageIndex(page)}
											variant={table.getState().pagination.pageIndex === page
												? 'default'
												: 'outline'}
											size="sm"
											disabled={false}
											aria-label={`Go to song progress page ${page + 1}`}
											aria-current={table.getState().pagination.pageIndex === page
												? 'page'
												: undefined}
										>
											{page + 1}
										</Button>
									{/each}
								</div>
								<Button
									onclick={() => table.nextPage()}
									variant="outline"
									size="sm"
									disabled={!table.getCanNextPage()}
								>
									Next
									<ChevronRight class="h-4 w-4" />
								</Button>
							</div>
						</nav>
					{/if}
				</CardContent>
			</Card>
		</div>
	{:else if data.progress.length === 0 && !selectedSession}
		<Card class="mb-8">
			<CardContent class="py-12 text-center">
				<Calendar class="mx-auto h-12 w-12 text-gray-400" />
				<p class="mt-4 text-gray-600">No training progress yet</p>
				<p class="mt-2 text-sm text-gray-500">
					Start a training session using the AMQ+ Connector to see your progress here
				</p>
			</CardContent>
		</Card>
	{/if}

	{#if !selectedSession && (data.isQuizOwner || data.progress.length > 0)}
		<div class="mb-8">
			<details class="group rounded-lg border border-gray-200 bg-white">
				<summary
					class="cursor-pointer list-none px-4 py-3 font-medium text-gray-900 marker:content-none [&::-webkit-details-marker]:hidden"
				>
					<span class="inline-flex items-center gap-2">
						Training Settings
						<span class="text-sm font-normal text-gray-500">
							— daily goal, limits, same-day reviews
						</span>
					</span>
				</summary>
				<div class="space-y-4 border-t border-gray-200 px-4 py-4">
					<div class="bg-muted/50 flex flex-wrap items-center justify-between gap-4 rounded-lg p-4">
						<div>
							<h4 class="font-medium">Daily review goal</h4>
							<p class="text-muted-foreground text-sm">
								Soft target for due reviews per day. Hitting it shows “Goal met” — it never blocks
								more play. Same song coming back later today counts again. Leave empty to hide the
								goal. The default is 50.
								{boundaryNote}
							</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each [20, 50, 100] as preset}
									<button
										type="button"
										class="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
										onclick={() => applyDailyReviewGoal(preset)}
										disabled={savingDailyReviewGoal}
										aria-label={`Set daily review goal to ${preset}`}
									>
										{preset}
									</button>
								{/each}
								<button
									type="button"
									class="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
									onclick={() => applyDailyReviewGoal('')}
									disabled={savingDailyReviewGoal}
									aria-label="Turn off daily review goal"
								>
									Off
								</button>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<Input
								type="number"
								min="1"
								max="10000"
								placeholder="Off"
								class="w-32"
								bind:value={dailyReviewGoalInput}
								aria-label="Daily review goal"
							/>
							<Button
								onclick={saveDailyReviewGoal}
								variant="outline"
								size="sm"
								class=""
								disabled={savingDailyReviewGoal}
							>
								Save
							</Button>
						</div>
					</div>

					<div class="bg-muted/50 flex flex-wrap items-center justify-between gap-4 rounded-lg p-4">
						<div>
							<h4 class="font-medium">Daily review limit</h4>
							<p class="text-muted-foreground text-sm">
								Hard cap on due songs scheduled per day. Prefer the Daily Goal above unless you want
								a hard stop. Leave empty for unlimited.
								{boundaryNote}
							</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each [50, 100, 200] as preset}
									<button
										type="button"
										class="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
										onclick={() => applyDailyReviewLimit(preset)}
										disabled={savingDailyReviewLimit}
										aria-label={`Set daily review limit to ${preset}`}
									>
										{preset}
									</button>
								{/each}
								<button
									type="button"
									class="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
									onclick={() => applyDailyReviewLimit('')}
									disabled={savingDailyReviewLimit}
									aria-label="Remove daily review limit"
								>
									Unlimited
								</button>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<Input
								type="number"
								min="1"
								max="10000"
								placeholder="Unlimited"
								class="w-32"
								bind:value={dailyReviewLimitInput}
								aria-label="Daily review limit"
							/>
							<Button
								onclick={saveDailyReviewLimit}
								variant="outline"
								size="sm"
								class=""
								disabled={savingDailyReviewLimit}
							>
								Save
							</Button>
						</div>
					</div>

					<div class="bg-muted/50 flex flex-wrap items-center justify-between gap-4 rounded-lg p-4">
						<div>
							<h4 class="font-medium">Daily new-song limit</h4>
							<p class="text-muted-foreground text-sm">
								How many never-practiced songs can enter training per day. Default is 20. Auto mode
								also pauses new songs when you already have enough due.
								{boundaryNote}
							</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each [10, 20, 50] as preset}
									<button
										type="button"
										class="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
										onclick={() => applyDailyNewLimit(preset)}
										disabled={savingDailyNewLimit}
										aria-label={`Set daily new-song limit to ${preset}`}
									>
										{preset}
									</button>
								{/each}
								<button
									type="button"
									class="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
									onclick={() => applyDailyNewLimit('')}
									disabled={savingDailyNewLimit}
									aria-label="Remove daily new-song limit"
								>
									Unlimited
								</button>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<Input
								type="number"
								min="1"
								max="10000"
								placeholder="Unlimited"
								class="w-32"
								bind:value={dailyNewLimitInput}
								aria-label="Daily new-song limit"
							/>
							<Button
								onclick={saveDailyNewLimit}
								variant="outline"
								size="sm"
								class=""
								disabled={savingDailyNewLimit}
							>
								Save
							</Button>
						</div>
					</div>

					<div class="bg-muted/50 flex flex-wrap items-center justify-between gap-4 rounded-lg p-4">
						<div>
							<h4 class="font-medium">Combine duplicate recordings</h4>
							<p class="text-muted-foreground text-sm">
								When the same recording appears under several anime entries, schedule at most one
								copy per session and keep those songs on the same review schedule. Nothing is merged
								or deleted. Turn it off and every entry is trained separately again.
							</p>
						</div>
						<div class="flex items-center gap-2">
							<label
								for="combine-duplicates-toggle"
								class="text-muted-foreground cursor-pointer text-sm font-medium"
							>
								{combineDuplicates ? 'On' : 'Off'}
							</label>
							<Switch
								id="combine-duplicates-toggle"
								aria-label="Combine duplicate recordings"
								checked={combineDuplicates}
								disabled={savingCombineDuplicates}
								onCheckedChange={saveCombineDuplicates}
							/>
						</div>
					</div>

					<div class="bg-muted/50 flex flex-wrap items-center justify-between gap-4 rounded-lg p-4">
						<div>
							<h4 class="font-medium">Same-day reviews</h4>
							<p class="text-muted-foreground text-sm">
								Songs you just missed or just learned can come back later today after a short wait.
								Turn off to push those to tomorrow instead.
							</p>
						</div>
						<div class="flex items-center gap-2">
							<label
								for="same-day-reviews-toggle"
								class="text-muted-foreground cursor-pointer text-sm font-medium"
							>
								{allowSameDayReviews ? 'On' : 'Off'}
							</label>
							<Switch
								id="same-day-reviews-toggle"
								aria-label="Same-day reviews"
								checked={allowSameDayReviews}
								disabled={savingAllowSameDayReviews}
								onCheckedChange={saveAllowSameDayReviews}
							/>
						</div>
					</div>
				</div>
			</details>
		</div>
	{/if}

	<!-- Quiz-owner maintenance actions -->
	{#if !selectedSession && data.isQuizOwner}
		<div class="mb-8">
			<details class="group rounded-lg border border-amber-200 bg-amber-50/40 open:bg-amber-50/60">
				<summary
					class="cursor-pointer list-none px-4 py-3 font-medium text-amber-900 marker:content-none [&::-webkit-details-marker]:hidden"
				>
					<span class="inline-flex items-center gap-2">
						Maintenance
						<span class="text-sm font-normal text-amber-700/80">— refresh pool, merge history</span>
					</span>
				</summary>
				<div class="space-y-4 border-t border-amber-200 px-4 py-4">
					<!-- Refresh Song Pool (N4) -->
					<div class="flex items-center justify-between rounded-lg bg-sky-50 p-4">
						<div>
							<h4 class="font-medium text-sky-800">Refresh song pool</h4>
							<p class="text-sm text-sky-700">
								This also happens automatically when you start a session. Use the button if you
								edited the quiz or a song list it draws from and want training to catch up now,
								without playing. How well you know each song stays the same. Songs that leave the
								pool are set aside and come back if they return.
							</p>
						</div>
						<Button
							onclick={refreshSongPool}
							variant="outline"
							size="sm"
							class="border-sky-300 text-sky-800 hover:bg-sky-100"
							disabled={refreshingPool}
						>
							<RefreshCw class="mr-2 h-4 w-4 {refreshingPool ? 'animate-spin' : ''}" />
							{refreshingPool ? 'Refreshing…' : 'Refresh Song Pool'}
						</Button>
					</div>
					<p
						role="status"
						aria-live="polite"
						class="text-sm {poolRefreshFailed ? 'text-red-700' : 'text-sky-800'}"
					>
						{poolRefreshMessage}
					</p>
					{#if data.mergeSources && data.mergeSources.length > 0}
						<div class="rounded-lg border bg-white p-4">
							<h4 class="font-medium text-gray-900">Merge history into this quiz</h4>
							<p class="text-muted-foreground mt-1 text-sm">
								Select another quiz and merge its training attempts into this quiz. Combines their
								history and updates review dates. Cannot be undone.
							</p>
							<div class="mt-3 flex flex-wrap items-center gap-4">
								<Select.Root type="single" bind:value={mergeSourceId}>
									<Select.Trigger class="w-[280px]" aria-label="Quiz history to merge">
										{#if mergeSourceId}
											{@const selected = data.mergeSources.find((q) => q.id === mergeSourceId)}
											{selected?.name || 'Select quiz'}
										{:else}
											Select quiz
										{/if}
									</Select.Trigger>
									<Select.Content class="" portalProps={{}}>
										{#each data.mergeSources as source}
											<Select.Item value={source.id} label={source.name} class="">
												{source.name}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<Button
									onclick={mergeHistoryFromQuiz}
									disabled={mergeLoading || !mergeSourceId}
									class=""
								>
									{mergeLoading ? 'Merging...' : 'Merge Selected Into This Quiz'}
								</Button>
							</div>
						</div>
					{/if}
				</div>
			</details>
		</div>
	{/if}
</div>

<!-- Spread Backlog Dialog -->
<AlertDialog.Root bind:open={rescheduleDialogOpen}>
	<AlertDialog.Content class="" portalProps={{}}>
		{#snippet children()}
			<AlertDialog.Header class="">
				{#snippet children()}
					<AlertDialog.Title class="">Spread backlog</AlertDialog.Title>
					<AlertDialog.Description class="space-y-3">
						{@const dueCount = data.stats.dueToday}
						{@const perDay = Math.ceil(dueCount / spreadHorizonDays)}
						<p>
							<span class="text-foreground font-semibold">{dueCount} due songs</span> will be spread
							evenly over the next
							<span class="text-foreground font-semibold">{spreadHorizonDays} days</span>
							(~{perDay} songs/day). Most at-risk memories return sooner.
						</p>
						<div class="flex flex-wrap gap-2 pt-1">
							{#each [7, 14, 30] as days}
								<button
									type="button"
									class="rounded-md border px-3 py-1.5 text-sm {spreadHorizonDays === days
										? 'border-orange-600 bg-orange-50 text-orange-800'
										: 'border-gray-200 bg-white text-gray-700'}"
									onclick={() => (spreadHorizonDays = days)}
									aria-pressed={spreadHorizonDays === days}
								>
									{days} days
								</button>
							{/each}
						</div>
						<p class="text-muted-foreground text-sm">
							How well you know each song stays the same. Only the due dates move. This cannot be
							undone.
						</p>
					</AlertDialog.Description>
				{/snippet}
			</AlertDialog.Header>
			<AlertDialog.Footer class="">
				{#snippet children()}
					<AlertDialog.Cancel class="">Cancel</AlertDialog.Cancel>
					<AlertDialog.Action class="" onclick={confirmRescheduleDueSongs}>
						Spread over {spreadHorizonDays} days
					</AlertDialog.Action>
				{/snippet}
			</AlertDialog.Footer>
		{/snippet}
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root
	bind:open={confirmationOpen}
	onOpenChange={(open) => {
		if (!open) settleConfirmation(false);
	}}
>
	<AlertDialog.Content
		class=""
		portalProps={{}}
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			// Restore after the closing dialog and its focus scope have unmounted.
			const opener = confirmationOpener;
			requestAnimationFrame(() => {
				if (!confirmationOpen && opener?.isConnected) opener.focus();
			});
		}}
	>
		<AlertDialog.Header class="">
			<AlertDialog.Title class="">{confirmationMessage.split('\n\n')[0]}</AlertDialog.Title>
			<AlertDialog.Description class="whitespace-pre-line"
				>{confirmationMessage.split('\n\n').slice(1).join('\n\n')}</AlertDialog.Description
			>
		</AlertDialog.Header>
		<AlertDialog.Footer class="">
			<AlertDialog.Cancel class="" onclick={() => settleConfirmation(false)}
				>Cancel</AlertDialog.Cancel
			>
			<AlertDialog.Action class="" onclick={() => settleConfirmation(true)}
				>Confirm</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	:global(body) {
		overflow-y: scroll;
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
