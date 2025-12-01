<script>
	// @ts-nocheck

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
	import * as Pagination from '$lib/components/ui/pagination';
	import {
		List,
		Plus,
		Search,
		Filter,
		Heart,
		ChevronLeft,
		ChevronRight,
		CalendarIcon
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';
	import Calendar from '$lib/components/ui/calendar/calendar.svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { CalendarDate, getLocalTimeZone } from '@internationalized/date';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Loader2, Share2 } from 'lucide-svelte';
	import SongListShareDialog from '$lib/components/amqplus/songlists/SongListShareDialog.svelte';

	/**
	 * @typedef {Object} SongList
	 * @property {string} id - List ID
	 * @property {string} name - List name
	 * @property {string|null} description - List description
	 * @property {boolean} is_public - Whether list is public
	 * @property {string} creator_username - Creator username
	 * @property {string} created_at - Creation timestamp
	 * @property {number} song_count - Number of songs in list
	 */

	/**
	 * @typedef {Object} PageData
	 * @property {Object|null} session - User session
	 * @property {Object|null} user - User object
	 * @property {SongList[]} publicLists - Array of public song lists
	 * @property {string[]} favoriteIds - Array of favorited list IDs
	 * @property {Object} pagination - Pagination data
	 * @property {number} pagination.page - Current page
	 * @property {number} pagination.totalPages - Total pages
	 * @property {number} pagination.total - Total items
	 * @property {number} pagination.limit - Items per page
	 * @property {Object} filters - Filter data
	 * @property {string} [filters.search] - Search query
	 * @property {string} [filters.name] - Name filter
	 * @property {string} [filters.description] - Description filter
	 * @property {string} [filters.creator] - Creator filter
	 * @property {string} [filters.dateFrom] - Date from filter
	 * @property {string} [filters.dateTo] - Date to filter
	 * @property {boolean} [filters.myLists] - My lists filter
	 */

	/** @type {{data: PageData}} */
	let { data } = $props();
	let { session, user } = $derived(data);

	// Redirect non-logged-in users away from "My Lists" page
	$effect(() => {
		const myListsParam = $page.url.searchParams.get('myLists') === 'true';
		if (myListsParam && !session) {
			goto('/songlist?page=1');
		}
	});

	// Determine initial searchBy based on which filter is set
	function getInitialSearchBy() {
		if (data.filters.name) return 'name';
		if (data.filters.description) return 'description';
		if (data.filters.creator) return 'author';
		if (data.filters.dateFrom || data.filters.dateTo) return 'date';
		if (data.filters.search) return 'all';
		return 'all';
	}

	// Helper function to format date for display
	function formatDate(date) {
		if (!date) return '';
		return date.toDate(getLocalTimeZone()).toLocaleDateString('en-US', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});
	}

	// Helper function to convert string to DateValue
	function stringToDateValue(dateStr) {
		if (!dateStr) return undefined;
		const date = new Date(dateStr);
		if (!date || isNaN(date.getTime())) return undefined;
		return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
	}

	// Helper function to convert DateValue to string (YYYY-MM-DD)
	function dateValueToString(dateValue) {
		if (!dateValue) return '';
		const date = dateValue.toDate(getLocalTimeZone());
		return date.toISOString().split('T')[0];
	}

	// Search and filter state
	let searchBy = $state(getInitialSearchBy());
	let searchQuery = $state(data.filters.search || '');
	let nameQuery = $state(data.filters.name || '');
	let descriptionQuery = $state(data.filters.description || '');
	let authorQuery = $state(data.filters.creator || '');
	let creatorFilter = $state(data.filters.creator || '');
	let favoriteFilter = $derived($page.url.searchParams.get('favorite') === 'true');
	let myListsFilter = $derived($page.url.searchParams.get('myLists') === 'true');

	// Date filter state using DateValue
	let dateFromValue = $state(stringToDateValue(data.filters.dateFrom));
	let dateToValue = $state(stringToDateValue(data.filters.dateTo));
	let dateFromOpen = $state(false);
	let dateToOpen = $state(false);

	let showFilters = $state(false);
	let viewMode = $state('public'); // 'public' or 'private'

	// Favorites state
	let favoriteIds = $state(new Set(data.favoriteIds || []));
	let isTogglingFavorite = $state(false);

	// Modal state
	let listModalOpen = $state(false);
	let selectedList = $state(null);
	let shareDialogOpen = $state(false);
	let selectedListForShare = $state(null);

	// Apply filters and navigate
	function applyFilters() {
		const params = new URLSearchParams();
		params.set('page', '1'); // Reset to page 1 when filtering

		// Debug logging for date filtering
		if (searchBy === 'date') {
			console.log('=== Date Filter Debug ===');
			console.log('dateFromValue:', dateFromValue);
			console.log('dateToValue:', dateToValue);
			if (dateFromValue) {
				console.log('dateFrom string:', dateValueToString(dateFromValue));
			}
			if (dateToValue) {
				console.log('dateTo string:', dateValueToString(dateToValue));
			}
			console.log('========================');
		}

		// Handle different search modes
		if (searchBy === 'all' && searchQuery) {
			params.set('search', searchQuery);
		} else if (searchBy === 'name' && nameQuery) {
			params.set('name', nameQuery);
		} else if (searchBy === 'description' && descriptionQuery) {
			params.set('description', descriptionQuery);
		} else if (searchBy === 'author' && authorQuery) {
			params.set('creator', authorQuery);
		} else if (searchBy === 'date') {
			if (dateFromValue) params.set('dateFrom', dateValueToString(dateFromValue));
			if (dateToValue) params.set('dateTo', dateValueToString(dateToValue));
		}

		goto(`/songlist?${params.toString()}`);
	}

	// Handle page change
	function changePage(newPage) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', newPage.toString());

		// Preserve favorite filter if active
		if (favoriteFilter) {
			params.set('favorite', 'true');
		}

		goto(`/songlist?${params.toString()}`);
	}

	// Toggle favorite
	async function toggleFavorite(listId) {
		if (isTogglingFavorite) return;

		isTogglingFavorite = true;
		const isFavorited = favoriteIds.has(listId);

		try {
			const response = await fetch('/api/song-lists/favorites', {
				method: isFavorited ? 'DELETE' : 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ list_id: listId })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to update favorites');
			}

			// Update local state
			if (isFavorited) {
				favoriteIds.delete(listId);
				toast.success('Removed from favorites');
			} else {
				favoriteIds.add(listId);
				toast.success('Added to favorites');
			}
			favoriteIds = new Set(favoriteIds); // Trigger reactivity
		} catch (error) {
			console.error('Error toggling favorite:', error);
			toast.error(error.message);
		} finally {
			isTogglingFavorite = false;
		}
	}

	// Open list modal
	function openListModal(list) {
		selectedList = list;
		listModalOpen = true;
	}

	// Toggle my lists filter
	function toggleMyListsFilter() {
		// If already active, do nothing
		if ($page.url.searchParams.get('myLists') === 'true') return;

		const params = new URLSearchParams();
		params.set('page', '1');
		params.set('myLists', 'true');

		goto(`/songlist?${params.toString()}`);
	}

	// Toggle favorites filter
	function toggleFavoritesFilter() {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', '1');

		if ($page.url.searchParams.get('favorite') === 'true') {
			params.delete('favorite');
		} else {
			params.set('favorite', 'true');
		}

		goto(`/songlist?${params.toString()}`);
	}
</script>

<svelte:head>
	<title>Song List Hub - AMQ Plus</title>
	<meta name="description" content="Discover and create public song lists for AMQ." />
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="mb-2 text-3xl font-bold">Song List Hub</h1>
			<p class="text-gray-600">Discover public song lists created by the community.</p>
		</div>
		<Button href="/songlist/create">
			<Plus class="mr-2 h-4 w-4" />
			Create New List
		</Button>
	</div>

	<!-- Two Column Layout: Filters Sidebar and Results -->
	<div class="grid gap-6 lg:grid-cols-4">
		<!-- Filters Sidebar -->
		<div class="lg:col-span-1">
			<Card>
				<CardHeader>
					<CardTitle class="flex items-center gap-2">
						<Filter class="h-5 w-5" />
						Filters
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<!-- View Filter -->
					<div class="space-y-2">
						<Label>View</Label>
						<div class="flex flex-col gap-2">
							<Button
								variant={!myListsFilter ? 'default' : 'outline'}
								size="sm"
								onclick={() => {
									if ($page.url.searchParams.get('myLists') === 'true') {
										goto('/songlist?page=1');
									}
								}}
								class="w-full justify-start"
							>
								Public Lists
							</Button>
							{#if session}
								<Button
									variant={myListsFilter ? 'default' : 'outline'}
									size="sm"
									onclick={toggleMyListsFilter}
									class="w-full justify-start"
								>
									My Lists
								</Button>
								<Button
									variant={favoriteFilter ? 'default' : 'outline'}
									size="sm"
									onclick={toggleFavoritesFilter}
									class="w-full justify-start"
								>
									<Heart class="mr-2 h-4 w-4" />
									Favorites
								</Button>
							{/if}
						</div>
					</div>

					<!-- Search By -->
					<div class="space-y-2">
						<Label>Search By</Label>
						<div class="flex flex-col gap-2">
							{#each ['all', 'name', 'description', 'author', 'date'] as type}
								<Button
									variant={searchBy === type ? 'default' : 'outline'}
									size="sm"
									onclick={() => (searchBy = type)}
									class="w-full justify-start text-xs"
								>
									{type.charAt(0).toUpperCase() + type.slice(1)}
								</Button>
							{/each}
						</div>
					</div>

					<!-- Search Input -->
					<div class="space-y-2">
						{#if searchBy === 'all'}
							<Label>Search All</Label>
							<Input
								bind:value={searchQuery}
								placeholder="Search..."
								onkeydown={(e) => e.key === 'Enter' && applyFilters()}
							/>
						{:else if searchBy === 'name'}
							<Label>Name</Label>
							<Input
								bind:value={nameQuery}
								placeholder="List name..."
								onkeydown={(e) => e.key === 'Enter' && applyFilters()}
							/>
						{:else if searchBy === 'description'}
							<Label>Description</Label>
							<Input
								bind:value={descriptionQuery}
								placeholder="Description..."
								onkeydown={(e) => e.key === 'Enter' && applyFilters()}
							/>
						{:else if searchBy === 'author'}
							<Label>Author</Label>
							<Input
								bind:value={authorQuery}
								placeholder="Author name..."
								onkeydown={(e) => e.key === 'Enter' && applyFilters()}
							/>
						{:else if searchBy === 'date'}
							<div class="space-y-2">
								<Label>From Date</Label>
								<Popover.Root bind:open={dateFromOpen}>
									<Popover.Trigger asChild let:builder>
										<Button
											variant="outline"
											class="w-full justify-start text-left font-normal"
											builders={[builder]}
										>
											<CalendarIcon class="mr-2 h-4 w-4" />
											{dateFromValue ? formatDate(dateFromValue) : 'Pick a date'}
										</Button>
									</Popover.Trigger>
									<Popover.Content class="w-auto p-0">
										<Calendar
											type="single"
											bind:value={dateFromValue}
											onValueChange={() => {
												dateFromOpen = false;
											}}
										/>
									</Popover.Content>
								</Popover.Root>

								<Label>To Date</Label>
								<Popover.Root bind:open={dateToOpen}>
									<Popover.Trigger asChild let:builder>
										<Button
											variant="outline"
											class="w-full justify-start text-left font-normal"
											builders={[builder]}
										>
											<CalendarIcon class="mr-2 h-4 w-4" />
											{dateToValue ? formatDate(dateToValue) : 'Pick a date'}
										</Button>
									</Popover.Trigger>
									<Popover.Content class="w-auto p-0">
										<Calendar
											type="single"
											bind:value={dateToValue}
											onValueChange={() => {
												dateToOpen = false;
											}}
										/>
									</Popover.Content>
								</Popover.Root>
							</div>
						{/if}
					</div>

					<Button onclick={applyFilters} class="w-full">
						<Search class="mr-2 h-4 w-4" />
						Search
					</Button>

					<Button
						variant="outline"
						onclick={() => {
							searchQuery = '';
							nameQuery = '';
							descriptionQuery = '';
							authorQuery = '';
							dateFromValue = null;
							dateToValue = null;
							goto('/songlist?page=1');
						}}
						class="w-full">Clear Filters</Button
					>
				</CardContent>
			</Card>
		</div>

		<!-- Results -->
		<div class="lg:col-span-3">
			<Card>
				{@const filteredLists =
					favoriteFilter && data.publicLists
						? data.publicLists.filter((list) => favoriteIds.has(list.id))
						: data.publicLists || []}

				{@const currentPage = data.pagination.page}
				{@const itemsPerPage = data.pagination.limit}
				{@const totalFilteredItems = favoriteFilter ? filteredLists.length : data.pagination.total}
				{@const totalFilteredPages = Math.ceil(totalFilteredItems / itemsPerPage)}
				{@const startIndex = (currentPage - 1) * itemsPerPage}
				{@const endIndex = Math.min(
					startIndex + itemsPerPage,
					favoriteFilter ? filteredLists.length : data.pagination.total
				)}
				{@const paginatedLists = favoriteFilter
					? filteredLists.slice(startIndex, endIndex)
					: filteredLists}

				<CardHeader>
					<CardTitle>
						{favoriteFilter ? 'Favorite Lists' : myListsFilter ? 'My Lists' : 'Public Lists'}
					</CardTitle>
					<CardDescription>
						{totalFilteredItems} list{totalFilteredItems !== 1 ? 's' : ''} found
					</CardDescription>
				</CardHeader>
				<CardContent>
					{#if totalFilteredItems > 0}
						<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{#each paginatedLists as list}
								<div
									class="relative cursor-pointer rounded-lg border p-4 pr-12 transition-colors hover:bg-gray-50"
									role="button"
									tabindex="0"
									onclick={() => openListModal(list)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											openListModal(list);
										}
									}}
								>
									<!-- Favorite Button -->
									<button
										onclick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											toggleFavorite(list.id);
										}}
										class="absolute top-2 right-2 rounded-full p-2 transition-colors hover:bg-gray-200"
										disabled={isTogglingFavorite}
										title={favoriteIds.has(list.id) ? 'Remove from favorites' : 'Add to favorites'}
									>
										<Heart
											class="h-5 w-5 {favoriteIds.has(list.id)
												? 'fill-red-500 text-red-500'
												: 'text-gray-400'}"
										/>
									</button>

									<div class="block">
										<!-- Title on its own line -->
										<h3
											class="mb-2 line-clamp-2 font-semibold break-all"
											style="word-break: break-all; overflow-wrap: break-word;"
											title={list.name}
										>
											{list.name}
										</h3>

										<!-- Description preview -->
										{#if list.description}
											<p
												class="mb-3 text-sm break-all text-gray-600"
												style="word-break: break-all; overflow-wrap: break-word;"
											>
												{list.description.length > 86
													? list.description.substring(0, 86) + '...'
													: list.description}
											</p>
										{/if}

										<!-- Metadata badges -->
										<div class="flex flex-wrap items-center gap-2">
											{#if myListsFilter && 'is_public' in list}
												<Badge variant={list.is_public ? 'default' : 'secondary'} class="text-xs">
													{list.is_public ? 'Public' : 'Private'}
												</Badge>
											{/if}
											<Badge variant="outline" class="text-xs" href="">
												{list.song_count || 0} songs
											</Badge>
											{#if !myListsFilter}
												<Badge variant="outline" class="text-xs" href="">
													{list.creator_username || 'Unknown'}
												</Badge>
											{/if}
											<Badge variant="outline" class="text-xs text-gray-500" href="">
												{new Date(list.created_at).toLocaleDateString()}
											</Badge>
										</div>
									</div>
								</div>
							{/each}
						</div>

						<!-- Pagination -->
						{#if (favoriteFilter ? totalFilteredPages : data.pagination.totalPages) > 1}
							<div class="mt-6 flex justify-center">
								<Pagination.Root
									count={favoriteFilter ? totalFilteredItems : data.pagination.total}
									perPage={itemsPerPage}
									page={currentPage}
									siblingCount={1}
									onPageChange={(newPage) => changePage(newPage)}
								>
									{#snippet children({ pages, currentPage })}
										<Pagination.Content>
											<Pagination.Item>
												<Pagination.PrevButton>
													<ChevronLeft class="size-4" />
													<span class="hidden sm:block">Previous</span>
												</Pagination.PrevButton>
											</Pagination.Item>
											{#each pages as page (page.key)}
												{#if page.type === 'ellipsis'}
													<Pagination.Item>
														<Pagination.Ellipsis />
													</Pagination.Item>
												{:else}
													<Pagination.Item>
														<Pagination.Link {page} isActive={currentPage === page.value}>
															{page.value}
														</Pagination.Link>
													</Pagination.Item>
												{/if}
											{/each}
											<Pagination.Item>
												<Pagination.NextButton>
													<span class="hidden sm:block">Next</span>
													<ChevronRight class="size-4" />
												</Pagination.NextButton>
											</Pagination.Item>
										</Pagination.Content>
									{/snippet}
								</Pagination.Root>
							</div>
						{/if}
					{:else}
						<div class="py-12 text-center text-gray-500">
							<p class="mb-2 text-lg font-medium">No lists found</p>
							<p class="text-sm">
								{#if favoriteFilter}
									You haven't favorited any lists yet
								{:else if myListsFilter}
									You haven't created any lists yet
								{:else}
									Try adjusting your search filters
								{/if}
							</p>
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</div>

<!-- List Selection Modal -->
<AlertDialog.Root bind:open={listModalOpen}>
	<AlertDialog.Content class="" portalProps={{}} closeOnOutsideClick={true}>
		{#snippet children()}
			<AlertDialog.Header class="">
				{#snippet children()}
					<AlertDialog.Title
						class="break-all"
						style="word-break: break-all; overflow-wrap: break-word;"
						>{selectedList ? selectedList.name : 'Song List'}</AlertDialog.Title
					>
					<AlertDialog.Description class="">Choose an action for this list</AlertDialog.Description>
				{/snippet}
			</AlertDialog.Header>
			<div class="py-4">
				{#if selectedList}
					<!-- Description (if present) -->
					{#if selectedList.description}
						<div
							class="mb-4 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3"
						>
							<p class="text-xs font-semibold text-gray-700">Description</p>
							<p
								class="text-sm break-all text-gray-600"
								style="word-break: break-all; overflow-wrap: break-word;"
							>
								{selectedList.description}
							</p>
						</div>
					{/if}

					<!-- Actions -->
					<div class="flex flex-col gap-2">
						<Button
							variant="default"
							href={`/songlist/create?fromList=${selectedList.id}`}
							class="w-full"
							disabled={false}
						>
							Open List
						</Button>
						
						{#if myListsFilter && session}
							<Button
								variant="outline"
								class="w-full"
								onclick={() => {
									selectedListForShare = selectedList;
									shareDialogOpen = true;
									listModalOpen = false;
								}}
							>
								<Share2 class="mr-2 h-4 w-4" />
								Share List
							</Button>
						{/if}
					</div>
				{/if}
			</div>
			<AlertDialog.Footer class="">
				{#snippet children()}
					<AlertDialog.Cancel class="">Close</AlertDialog.Cancel>
				{/snippet}
			</AlertDialog.Footer>
		{/snippet}
	</AlertDialog.Content>
</AlertDialog.Root>

<SongListShareDialog 
	bind:open={shareDialogOpen} 
	listId={selectedListForShare?.id} 
	listName={selectedListForShare?.name} 
/>
