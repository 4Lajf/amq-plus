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
		FileDown,
		Calendar,
		Search,
		ChevronLeft,
		ChevronRight,
		ChevronUp,
		ChevronDown,
		ChevronsUpDown
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
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
	let pagination = $state({ pageIndex: 0, pageSize: 100 });

	// Filter states
	let searchQuery = $state('');
	let learningStageFilter = $state('all'); // all, learning, review, mastered
	let selectionTypeFilter = $state('all'); // all, due, new, revision

	// Session pagination state
	let currentSessionPage = $state(1);
	const SESSIONS_PER_PAGE = 10;

	let totalSessionPages = $derived(Math.ceil(data.sessions.length / SESSIONS_PER_PAGE));
	let paginatedSessions = $derived(
		data.sessions.slice(
			(currentSessionPage - 1) * SESSIONS_PER_PAGE,
			currentSessionPage * SESSIONS_PER_PAGE
		)
	);

	// Table data with derived filtering
	let tableData = $derived.by(() => {
		const now = new Date();
		return data.progress.filter((record) => {
			// Search filter
			if (searchQuery.trim()) {
				const song = parseSongKey(record.song_key);
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
			accessorKey: 'song_key',
			header: 'Song',
			cell: (info) => {
				const record = info.row.original;
				const song = parseSongKey(record.song_key);
				return `
					<div>
						<p class="font-medium text-gray-900">${song.title}</p>
						<p class="text-sm text-gray-500">${song.artist}</p>
					</div>
				`;
			},
			sortingFn: (rowA, rowB) => {
				const songA = parseSongKey(rowA.original.song_key);
				const songB = parseSongKey(rowB.original.song_key);
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
		},
		{
			id: 'actions',
			header: '',
			cell: (info) => {
				const record = info.row.original;
				return `<button class="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded" onclick="window.deleteSong('${record.song_key}')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>`;
			},
			enableSorting: false
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

	// Expose delete function globally for onclick handler
	if (typeof window !== 'undefined') {
		// @ts-ignore
		window.deleteSong = deleteSongProgress;
	}

	onMount(() => {
		initCharts();
	});

	function initCharts() {
		// Accuracy Line Chart
		if (accuracyChartContainer && data.performanceOverTime.length > 0) {
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

	function parseSongKey(songKey) {
		// Format: "Artist_SongName" or annSongId
		if (!songKey) return { artist: 'Unknown', title: 'Unknown' };
		const parts = songKey.split('_');
		if (parts.length >= 2) {
			return {
				artist: parts[0],
				title: parts.slice(1).join('_')
			};
		}
		return { artist: 'Unknown', title: songKey };
	}

	async function deleteAllProgress() {
		if (
			!confirm(
				`Are you sure you want to delete all training progress for "${data.quiz.name}"?\n\nThis action cannot be undone.`
			)
		) {
			return;
		}

		try {
			const response = await fetch(`/api/training/${data.quiz.id}/progress`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete progress');
			}

			toast.success('All training progress deleted');
			window.location.href = '/training';
		} catch (error) {
			console.error('Error deleting progress:', error);
			toast.error('Failed to delete progress');
		}
	}

	async function deleteSongProgress(songKey) {
		if (!confirm(`Delete training progress for this song?\n\nThis action cannot be undone.`)) {
			return;
		}

		try {
			const response = await fetch(
				`/api/training/${data.quiz.id}/progress/${encodeURIComponent(songKey)}`,
				{
					method: 'DELETE'
				}
			);

			if (!response.ok) {
				throw new Error('Failed to delete song progress');
			}

			toast.success('Song progress deleted');
			window.location.reload();
		} catch (error) {
			console.error('Error deleting song progress:', error);
			toast.error('Failed to delete song progress');
		}
	}

	async function deleteSession(sessionId) {
		if (!confirm(`Delete this training session?\n\nThis action cannot be undone.`)) {
			return;
		}

		try {
			const response = await fetch(`/api/training/session/${sessionId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete session');
			}

			toast.success('Session deleted');
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

	function exportProgress() {
		const dataStr = JSON.stringify(data.progress, null, 2);
		const dataBlob = new Blob([dataStr], { type: 'application/json' });
		const url = URL.createObjectURL(dataBlob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `training-${data.quiz.name}-${new Date().toISOString().split('T')[0]}.json`;
		link.click();
		URL.revokeObjectURL(url);
		toast.success('Progress exported');
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
	{#if data.progress.length > 0}
		<div class="mb-8">
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

	<!-- Song Progress Table -->
	{#if data.progress.length > 0}
		<div class="mb-8">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-2xl font-bold text-gray-900">Song Progress</h2>
				<div class="flex gap-2">
					{#if data.stats.dueToday > 5}
						<Button onclick={resetDueSongs} variant="outline" size="sm" class="" disabled={false}>
							<Clock class="mr-2 h-4 w-4" />
							Reset Backlog ({data.stats.dueToday})
						</Button>
					{/if}
					<Button onclick={exportProgress} variant="outline" size="sm" class="" disabled={false}>
						<FileDown class="mr-2 h-4 w-4" />
						Export Progress
					</Button>
					<Button
						onclick={deleteAllProgress}
						variant="destructive"
						size="sm"
						class=""
						disabled={false}
					>
						<Trash2 class="mr-2 h-4 w-4" />
						Delete All
					</Button>
				</div>
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
	{:else}
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

	<!-- Recent Sessions -->
	{#if data.sessions.length > 0}
		<div class="mb-8">
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
											<Button
												class="text-red-600 hover:bg-red-50 hover:text-red-700"
												size="sm"
												variant="ghost"
												onclick={() => deleteSession(session.id)}
												disabled={false}
											>
												<Trash2 class="h-4 w-4" />
											</Button>
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
									}) as page}
										<Button
											class="min-w-10"
											onclick={() => (currentSessionPage = page)}
											variant={currentSessionPage === page ? 'default' : 'outline'}
											size="sm"
											disabled={false}
										>
											{page}
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
</div>

<style>
	:global(body) {
		overflow-y: scroll;
	}
</style>
