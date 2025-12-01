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
		XCircle
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
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

	// @ts-ignore
	let { data } = $props();

	let accuracyChartContainer = $state();
	let masteryChartContainer = $state();
	let forecastChartContainer = $state();

	// Table state for song progress
	let sorting = $state([]);
	let columnFilters = $state([]);
	let columnVisibility = $state({});
	let pagination = $state({ pageIndex: 0, pageSize: 20 });

	// Filter states
	let searchQuery = $state('');
	let learningStageFilter = $state('all'); // all, learning, review, mastered
	let selectionTypeFilter = $state('all'); // all, due, new, revision

	// Session pagination state
	let currentSessionPage = $state(1);
	const SESSIONS_PER_PAGE = 5;

	let totalSessionPages = $derived(Math.ceil(data.sessions.length / SESSIONS_PER_PAGE));
	let paginatedSessions = $derived(
		data.sessions.slice(
			(currentSessionPage - 1) * SESSIONS_PER_PAGE,
			currentSessionPage * SESSIONS_PER_PAGE
		)
	);

	// Selected session details (from server data)
	let selectedSession = $derived(data.selectedSession);
	let sessionPlays = $derived(data.sessionPlays || []);

	// Table data with derived filtering
	let tableData = $derived.by(() => {
		const now = new Date();
		return data.progress.filter((record) => {
			// Search filter
			if (searchQuery.trim()) {
				const song = parseSongKey(record);
				const query = searchQuery.toLowerCase();
				if (
					!song.title.toLowerCase().includes(query) &&
					!song.artist.toLowerCase().includes(query)
				) {
					return false;
				}
			}

			// Learning stage filter
			if (learningStageFilter !== 'all') {
				const fsrsState = record.fsrs_state?.state;
				if (learningStageFilter === 'learning' && fsrsState !== 0 && fsrsState !== 1) {
					return false;
				}
				if (learningStageFilter === 'review' && fsrsState !== 2) {
					return false;
				}
				if (learningStageFilter === 'mastered' && fsrsState !== 3) {
					return false;
				}
			}

			// Selection type filter
			if (selectionTypeFilter !== 'all') {
				const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
				if (selectionTypeFilter === 'due' && (!dueDate || dueDate > now)) {
					return false;
				}
				if (selectionTypeFilter === 'new' && record.fsrs_state?.state !== undefined) {
					return false;
				}
				if (
					selectionTypeFilter === 'revision' &&
					(!dueDate || dueDate <= now || !record.fsrs_state)
				) {
					return false;
				}
			}

			return true;
		});
	});

	// Column definitions for TanStack Table
	const columns = [
		{
			accessorKey: 'song_ann_id',
			header: 'Song',
			cell: (info) => {
				const record = info.row.original;
				const song = parseSongKey(record);
				return `
					<div>
						<p class="font-medium text-gray-900">${song.title}</p>
						${song.artist ? `<p class="text-sm text-gray-500">${song.artist}</p>` : ''}
					</div>
				`;
			},
			sortingFn: (rowA, rowB) => {
				const songA = parseSongKey(rowA.original);
				const songB = parseSongKey(rowB.original);
				return songA.title.localeCompare(songB.title);
			}
		},
		{
			accessorKey: 'attempt_count',
			header: 'Attempts',
			cell: (info) => {
				const record = info.row.original;
				const failCount = record.attempt_count - record.success_count;
				return `<span class="text-green-600">${record.success_count}</span><span class="text-gray-400">/</span><span class="text-red-600">${failCount}</span>`;
			}
		},
		{
			id: 'success_rate',
			header: 'Success Rate',
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
			cell: (info) => {
				const streak = info.getValue();
				const variant = streak > 0 ? 'success' : 'secondary';
				return `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${variant === 'success' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}">${streak}</span>`;
			}
		},
		{
			accessorKey: 'last_attempt_at',
			header: 'Last Attempt',
			cell: (info) => formatDate(info.getValue())
		},
		{
			id: 'next_review',
			header: 'Next Review',
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
		}
	];

	// Create TanStack Table instance
	const table = createSvelteTable({
		get data() {
			return tableData;
		},
		columns,
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
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	});

	onMount(() => {
		if (!selectedSession) {
			initCharts();
		}
	});

	// Reinitialize charts when navigating back from session details
	$effect(() => {
		if (!selectedSession && data.progress.length > 0) {
			// Use a small timeout to ensure DOM elements are rendered after transition
			setTimeout(() => {
				initCharts();
			}, 350);
		}
	});

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
							Learning: 'Songs being actively learned',
							Review: 'Songs in spaced repetition',
							Mastered: 'Fully learned songs'
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
							{ value: dist.mastered, name: 'Mastered', itemStyle: { color: '#34d399' } }
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
		// Format as MM/DD/YYYY for consistency
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const year = date.getFullYear();
		return `${month}/${day}/${year}`;
	}

	function formatDuration(minutes) {
		if (!minutes) return '-';
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return `${hours}h ${mins}m`;
	}

	function parseSongKey(record) {
		// Handle record object with potential song_ann_id and legacy annSongId
		if (!record) return { artist: 'Unknown', title: 'Unknown' };
		
		// For plays, use correct_answer if available (contains the actual song name)
		if (record.correct_answer) {
			return { 
				artist: '', 
				title: record.correct_answer 
			};
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

	async function deleteSession(sessionId) {
		if (
			!confirm(
				`Delete this training session?\n\nThis will also delete all play records from this session and recalculate your song progress accordingly.\n\nThis action cannot be undone.`
			)
		) {
			return;
		}

		try {
			const response = await fetch(`/api/training/session/${sessionId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete session');
			}

			const result = await response.json();
			toast.success(result.message || 'Session and play records deleted');
			window.location.reload();
		} catch (error) {
			console.error('Error deleting session:', error);
			toast.error('Failed to delete session');
		}
	}

	async function resetDueSongs() {
		const dueCount = data.stats.dueToday;
		if (
			!confirm(
				`Reset ${dueCount} due songs?\n\nThis will spread them over the next 30 days to help manage your backlog.\n\nThis action cannot be undone.`
			)
		) {
			return;
		}

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/reset-due`, {
				method: 'POST'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to reset due songs');
			}

			toast.success(result.message || `Reset ${result.resetCount} songs`);
			window.location.reload();
		} catch (error) {
			console.error('Error resetting due songs:', error);
			toast.error('Failed to reset due songs');
		}
	}

	function viewSessionDetails(sessionId) {
		goto(`/training/${data.quiz.id}?session=${sessionId}`, { replaceState: false });
	}

	function closeSessionDetails() {
		goto(`/training/${data.quiz.id}`, { replaceState: false });
	}

	async function deletePlay(playId) {
		if (
			!confirm(
				"Delete this attempt?\n\nThis will remove it from history and recalculate the song's SRS learning state."
			)
		)
			return;

		try {
			const res = await fetch(`/api/training/session/${selectedSession.id}/plays/${playId}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message || 'Failed to delete play');
			}

			toast.success('Attempt deleted successfully');
			window.location.reload();
		} catch (e) {
			console.error(e);
			toast.error(e.message || 'Error deleting play');
		}
	}

	function formatDateTime(dateString) {
		if (!dateString) return '-';
		return new Date(dateString).toLocaleString();
	}

	function formatTime(dateString) {
		if (!dateString) return '-';
		return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
		<h1 class="text-3xl font-bold text-gray-900">{data.quiz.name}</h1>
		<p class="mt-2 text-gray-600">{data.quiz.description || 'No description'}</p>
	</div>

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
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm font-medium text-gray-600">Due Today</p>
						<p class="mt-2 text-3xl font-bold text-orange-600">{data.stats.dueToday}</p>
						<p class="mt-1 text-xs text-gray-500">songs need review</p>
					</div>
					<Clock class="h-8 w-8 text-orange-500" />
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
			<div class="grid gap-6 md:grid-cols-2">
				<!-- Accuracy Over Time -->
				{#if data.performanceOverTime.length > 0}
					<Card class="">
						<CardHeader class="">
							<CardTitle class="">Accuracy Over Time</CardTitle>
							<CardDescription class="">Your performance trend</CardDescription>
						</CardHeader>
						<CardContent class="">
							<div bind:this={accuracyChartContainer} style="height: 300px;"></div>
						</CardContent>
					</Card>
				{/if}

				<!-- Mastery Distribution -->
				<Card class="">
					<CardHeader class="">
						<CardTitle class="">Mastery Distribution</CardTitle>
						<CardDescription class="">Songs by learning stage</CardDescription>
					</CardHeader>
					<CardContent class="">
						<div bind:this={masteryChartContainer} style="height: 300px;"></div>
					</CardContent>
				</Card>

				<!-- Review Forecast -->
				{#if data.forecast.length > 0}
					<Card class="md:col-span-2">
						<CardHeader class="">
							<CardTitle class="">Review Forecast</CardTitle>
							<CardDescription class="">Songs due in the next 7 days</CardDescription>
						</CardHeader>
						<CardContent class="">
							<div bind:this={forecastChartContainer} style="height: 300px;"></div>
						</CardContent>
					</Card>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Recent Sessions (moved above Song Progress) -->
	{#if data.sessions.length > 0 && !selectedSession}
		<div class="mb-8" transition:slide={{ duration: 300 }}>
			<h2 class="mb-4 text-2xl font-bold text-gray-900">Recent Sessions</h2>
			<Card class="">
				<CardContent class="p-0">
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead class="border-b bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase"
										>Date</th
									>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase"
										>Duration</th
									>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase"
										>Songs</th
									>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase"
										>Pool Size</th
									>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase"
										>Correct</th
									>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase"
										>Incorrect</th
									>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase"
										>Accuracy</th
									>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase"
										>Actions</th
									>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each paginatedSessions as session}
									<tr class="hover:bg-gray-50">
										<td class="px-6 py-4 text-sm text-gray-700">
											{formatDate(session.endedAt)}
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
												>
													<Eye class="h-4 w-4" />
												</Button>
												<Button
													class="text-red-600 hover:bg-red-50 hover:text-red-700"
													size="sm"
													variant="ghost"
													onclick={() => deleteSession(session.id)}
													disabled={false}
													title="Delete Session"
												>
													<Trash2 class="h-4 w-4" />
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
						<div class="flex items-center justify-between border-t px-6 py-4">
							<div class="text-sm text-gray-700">
								Showing {(currentSessionPage - 1) * SESSIONS_PER_PAGE + 1} to {Math.min(
									currentSessionPage * SESSIONS_PER_PAGE,
									data.sessions.length
								)} of {data.sessions.length} sessions
							</div>
							<div class="flex gap-2">
								<Button
									class=""
									onclick={() => (currentSessionPage = Math.max(1, currentSessionPage - 1))}
									variant="outline"
									size="sm"
									disabled={currentSessionPage === 1}
								>
									<ChevronLeft class="h-4 w-4" />
									Previous
								</Button>
								<div class="flex items-center gap-1">
									{#each Array.from({ length: Math.min(5, totalSessionPages) }, (_, i) => {
										const start = Math.max(1, Math.min(currentSessionPage - 2, totalSessionPages - 4));
										return start + i;
									}) as pageNum}
										<Button
											class="min-w-10"
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
									class=""
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
		<div class="mb-8" transition:slide={{ duration: 300 }}>
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-4">
					<Button onclick={closeSessionDetails} variant="outline" size="sm" disabled={false}>
						<ArrowLeft class="mr-2 h-4 w-4" />
						Back to Sessions
					</Button>
					<h2 class="text-2xl font-bold text-gray-900">Session Details</h2>
				</div>
			</div>

			<!-- Session Stats Cards -->
			<div class="mb-6 grid gap-4 md:grid-cols-4">
				<Card class="">
					<CardContent class="flex items-center justify-between p-6">
						<div>
							<p class="text-sm font-medium text-gray-500">Duration</p>
							<p class="text-2xl font-bold">
								{selectedSession.duration !== null ? selectedSession.duration + 'm' : 'In Progress'}
							</p>
						</div>
						<Timer class="h-8 w-8 text-blue-500" />
					</CardContent>
				</Card>

				<Card class="">
					<CardContent class="flex items-center justify-between p-6">
						<div>
							<p class="text-sm font-medium text-gray-500">Songs Played</p>
							<p class="text-2xl font-bold">{selectedSession.totalSongs}</p>
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
								{selectedSession.totalSongs - selectedSession.correctSongs}
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
								<span class="font-medium">{selectedSession.composition.due || 0}</span> Due (Review)
							</div>
							<div class="flex items-center gap-2">
								<span class="h-3 w-3 rounded-full bg-purple-500"></span>
								<span class="font-medium">{selectedSession.composition.new || 0}</span> New
							</div>
							<div class="flex items-center gap-2">
								<span class="h-3 w-3 rounded-full bg-orange-500"></span>
								<span class="font-medium">{selectedSession.composition.revision || 0}</span> Revision
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
									<th class="px-6 py-3 text-left font-medium">Speed</th>
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
												<span class="font-medium text-red-600">Again (1)</span>
											{:else if play.rating === 2}
												<span class="font-medium text-orange-600">Hard (2)</span>
											{:else if play.rating === 3}
												<span class="font-medium text-blue-600">Good (3)</span>
											{:else if play.rating === 4}
												<span class="font-medium text-green-600">Easy (4)</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-gray-500">
											{play.time_spent_ms ? (play.time_spent_ms / 1000).toFixed(1) + 's' : '-'}
										</td>
										<td class="px-6 py-4 text-right">
											<Button
												variant="ghost"
												size="icon"
												class="text-red-500 hover:bg-red-50 hover:text-red-700"
												onclick={() => deletePlay(play.id)}
												title="Delete attempt"
												disabled={false}
											>
												<Trash2 class="h-4 w-4" />
											</Button>
										</td>
									</tr>
								{/each}
								{#if sessionPlays.length === 0}
									<tr>
										<td colspan="8" class="px-6 py-8 text-center text-gray-500">
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

	<!-- Song Progress Table (hidden when viewing session details) -->
	{#if data.progress.length > 0 && !selectedSession}
		<div class="mb-8" transition:slide={{ duration: 300 }}>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-2xl font-bold text-gray-900">Song Progress</h2>
				{#if data.stats.dueToday > 5}
					<Button onclick={resetDueSongs} variant="outline" size="sm" class="" disabled={false}>
						<Clock class="mr-2 h-4 w-4" />
						Reset Backlog ({data.stats.dueToday})
					</Button>
				{/if}
			</div>

			<!-- Filters and Search -->
			<div class="mb-4 flex flex-wrap gap-4">
				<!-- Search Bar -->
				<div class="relative min-w-[250px] flex-1">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
					<Input
						type="text"
						bind:value={searchQuery}
						placeholder="Search by song name or artist..."
						class="pl-10"
					/>
				</div>

				<!-- Learning Stage Filter -->
				<Select.Root type="single" bind:value={learningStageFilter}>
					<Select.Trigger class="w-[180px]">
						{#if learningStageFilter === 'all'}
							All Stages
						{:else if learningStageFilter === 'learning'}
							Learning
						{:else if learningStageFilter === 'review'}
							Review
						{:else if learningStageFilter === 'mastered'}
							Mastered
						{:else}
							Learning Stage
						{/if}
					</Select.Trigger>
					<Select.Content class="" portalProps={{}}>
						<Select.Item value="all" label="All Stages" class="">All Stages</Select.Item>
						<Select.Item value="learning" label="Learning" class="">Learning</Select.Item>
						<Select.Item value="review" label="Review" class="">Review</Select.Item>
						<Select.Item value="mastered" label="Mastered" class="">Mastered</Select.Item>
					</Select.Content>
				</Select.Root>

				<!-- Selection Type Filter -->
				<Select.Root type="single" bind:value={selectionTypeFilter}>
					<Select.Trigger class="w-[180px]">
						{#if selectionTypeFilter === 'all'}
							All Types
						{:else if selectionTypeFilter === 'due'}
							Due
						{:else if selectionTypeFilter === 'new'}
							New
						{:else if selectionTypeFilter === 'revision'}
							Revision
						{:else}
							Selection Type
						{/if}
					</Select.Trigger>
					<Select.Content class="" portalProps={{}}>
						<Select.Item value="all" label="All Types" class="">All Types</Select.Item>
						<Select.Item value="due" label="Due" class="">Due</Select.Item>
						<Select.Item value="new" label="New" class="">New</Select.Item>
						<Select.Item value="revision" label="Revision" class="">Revision</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>

			<!-- TanStack Table -->
			<Card class="">
				<CardContent class="p-0">
					<div class="overflow-x-auto">
						<Table.Root class="">
							<Table.Header class="">
								{#each table.getHeaderGroups() as headerGroup}
									<Table.Row class="">
										{#each headerGroup.headers as header}
											<Table.Head class="px-6 py-3">
												{#if !header.isPlaceholder}
													{#if header.column.getCanSort()}
														<button
															class="flex items-center gap-2 text-xs font-medium text-gray-700 uppercase hover:text-gray-900"
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
														<div class="text-xs font-medium text-gray-700 uppercase">
															<FlexRender
																attach={header.column.columnDef.header}
																content={header.column.columnDef.header}
																context={header.getContext()}
															/>
														</div>
													{/if}
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
												<Table.Cell class="px-6 py-4 text-sm">
													{@html typeof cell.column.columnDef.cell === 'function'
														? cell.column.columnDef.cell(cell.getContext())
														: cell.column.columnDef.cell}
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
						<div class="flex items-center justify-between border-t px-6 py-4">
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
									class=""
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
										>
											{page + 1}
										</Button>
									{/each}
								</div>
								<Button
									class=""
									onclick={() => table.nextPage()}
									variant="outline"
									size="sm"
									disabled={!table.getCanNextPage()}
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
</div>

<style>
	:global(body) {
		overflow-y: scroll;
	}
</style>
