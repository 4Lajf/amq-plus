<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import * as Pagination from '$lib/components/ui/pagination';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		Search,
		Heart,
		ChevronLeft,
		ChevronRight,
		Calendar as CalendarIcon,
		Filter,
		Plus,
		Copy,
		Trash2,
		Loader2,
		MoreVertical,
		ThumbsUp,
		Play,
		TrendingUp,
		Clock
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { CalendarDate, parseDate } from '@internationalized/date';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	// Import centralized types
	/** @typedef {import('../../types/types.js').Quiz} Quiz */
	/** @typedef {import('../../types/types.js').Session} Session */
	/** @typedef {import('../../types/types.js').User} User */
	/** @typedef {import('../../types/types.js').Pagination} Pagination */
	/** @typedef {import('../../types/types.js').QuizFilters} QuizFilters */

	/**
	 * @typedef {Object} PageData
	 * @property {Session|null} session
	 * @property {User|null} user
	 * @property {Quiz[]} quizzes
	 * @property {string[]} favoriteIds
	 * @property {Pagination} pagination
	 * @property {QuizFilters} filters
	 */

	/** @type {{data: PageData}} */
	let { data } = $props();
	let { session, user } = $derived(data);

	// Redirect non-logged-in users away from "My Quizzes" page
	$effect(() => {
		const myQuizzesParam = $page.url.searchParams.get('myQuizzes') === 'true';
		if (myQuizzesParam && !session) {
			goto('/quizzes?page=1');
		}
	});

	// State from URL
	let currentPage = $derived(data.pagination.page);
	let totalPages = $derived(data.pagination.totalPages);
	let totalItems = $derived(data.pagination.totalItems);
	let paginatedQuizzes = $state(data.quizzes || []);
	let deletedQuizIds = $state(new Set());

	// Sync paginatedQuizzes when data.quizzes changes (e.g., when switching between Public/My Quizzes)
	$effect(() => {
		if (data.quizzes) {
			// Filter out locally deleted quizzes
			paginatedQuizzes = data.quizzes.filter((quiz) => !deletedQuizIds.has(quiz.id));
		}
	});

	// Search state
	let searchBy = $state('all');
	let searchQuery = $state(data.filters.search || '');
	let nameQuery = $state(data.filters.name || '');
	let descriptionQuery = $state(data.filters.description || '');
	let authorQuery = $state(data.filters.creator || '');
	let dateFromValue = $state(data.filters.dateFrom ? parseDate(data.filters.dateFrom) : null);
	let dateToValue = $state(data.filters.dateTo ? parseDate(data.filters.dateTo) : null);
	let sortBy = $state(data.filters.sortBy || 'newest');

	// Filter state
	let myQuizzesFilter = $derived($page.url.searchParams.get('myQuizzes') === 'true');
	let favoriteFilter = $derived($page.url.searchParams.get('favorite') === 'true');
	let favoriteIds = $state(new Set(data.favoriteIds || []));
	let isTogglingFavorite = $state(false);
	let isCopyingLink = $state(null);
	let isDeletingId = $state(null);
	let deleteDialogOpen = $state(false);
	let quizToDelete = $state(null);
	let quizModalOpen = $state(false);
	let selectedQuiz = $state(null);
	let contextMenuOpen = $state(null);

	// Track expanded descriptions by quiz ID
	let expandedDescriptions = $state(new Set());

	/**
	 * Helper to convert CalendarDate to string
	 * @param {CalendarDate|null} dateValue - CalendarDate object with year, month, day properties
	 * @returns {string} Formatted date string in YYYY-MM-DD format
	 */
	function dateValueToString(dateValue) {
		if (!dateValue) return '';
		return `${dateValue.year}-${String(dateValue.month).padStart(2, '0')}-${String(dateValue.day).padStart(2, '0')}`;
	}

	// Filtered items for favorites
	let filteredItems = $derived(
		!favoriteFilter ? paginatedQuizzes : paginatedQuizzes.filter((quiz) => favoriteIds.has(quiz.id))
	);

	let totalFilteredItems = $derived(favoriteFilter ? filteredItems.length : totalItems);
	let totalFilteredPages = $derived(
		favoriteFilter ? Math.ceil(filteredItems.length / data.pagination.limit) : totalPages
	);

	/**
	 * Handle search functionality and update URL parameters
	 * @returns {void}
	 */
	function handleSearch() {
		const params = new URLSearchParams();
		params.set('page', '1'); // Reset to first page on new search

		// Preserve my quizzes filter if active
		if (myQuizzesFilter) {
			params.set('myQuizzes', 'true');
		}

		// Preserve sort order
		if (sortBy) {
			params.set('sortBy', sortBy);
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

		// proposal: maybe change this to replacehistory to possibly run faster?
		goto(`/quizzes?${params.toString()}`);
	}

	/**
	 * Handle sort change and update URL parameters
	 * @param {string} newSortBy
	 * @returns {void}
	 */
	function handleSortChange(newSortBy) {
		sortBy = newSortBy;
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', '1'); // Reset to first page
		params.set('sortBy', newSortBy);
		goto(`/quizzes?${params.toString()}`);
	}

	/**
	 * Handle page change and update URL parameters
	 * @param {number} newPage
	 * @returns {void}
	 */
	function changePage(newPage) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', newPage.toString());

		// Preserve favorite filter if active
		if (favoriteFilter) {
			params.set('favorite', 'true');
		}

		goto(`/quizzes?${params.toString()}`);
	}

	/**
	 * Toggle favorite status for a quiz
	 * @param {string} quizId
	 * @returns {Promise<void>}
	 */
	async function toggleFavorite(quizId) {
		if (isTogglingFavorite) return;

		isTogglingFavorite = true;
		const isFavorited = favoriteIds.has(quizId);
		toast.info(isFavorited ? 'Removing from favorites...' : 'Adding to favorites...');

		try {
			const response = await fetch('/api/quiz-configurations/favorites', {
				method: isFavorited ? 'DELETE' : 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ quiz_id: quizId })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to update favorites');
			}

			// Update local state
			if (isFavorited) {
				favoriteIds.delete(quizId);
				toast.success('Removed from favorites');
			} else {
				favoriteIds.add(quizId);
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

	/**
	 * Copy quiz play link to clipboard
	 * @param {Quiz} quiz
	 * @returns {Promise<void>}
	 */
	async function copyPlayLink(quiz) {
		isCopyingLink = quiz.id;
		try {
			const playUrl = getPlayUrl(quiz);
			await navigator.clipboard.writeText(playUrl);
			toast.success('Play link copied to clipboard!');
		} catch (error) {
			console.error('Error copying link:', error);
			toast.error('Failed to copy link');
		} finally {
			isCopyingLink = null;
		}
	}

	/**
	 * Get the play URL for a quiz
	 * @param {Quiz} quiz
	 * @returns {string} Full play URL
	 * @throws {Error} If play_token is not available
	 */
	function getPlayUrl(quiz) {
		if (!quiz.play_token) {
			throw new Error('Quiz play_token is required to generate play URL');
		}
		const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
		return `${baseUrl}/play/${quiz.play_token}`;
	}

	/**
	 * Safely get the play URL for a quiz, returning empty string if play_token is not available
	 * @param {Quiz|null} quiz - Quiz object with play_token
	 * @returns {string} Full play URL or empty string if play_token is missing
	 */
	function getPlayUrlSafe(quiz) {
		if (!quiz) return '';
		try {
			return getPlayUrl(quiz);
		} catch {
			return '';
		}
	}

	/**
	 * Open quiz selection modal
	 * @param {Quiz} quiz - Quiz object
	 * @returns {void}
	 */
	function openQuizModal(quiz) {
		selectedQuiz = quiz;
		quizModalOpen = true;
	}

	/**
	 * Open delete confirmation dialog
	 * @param {string} quizId - ID of the quiz to delete
	 * @returns {void}
	 */
	function openDeleteDialog(quizId) {
		quizToDelete = quizId;
		deleteDialogOpen = true;
	}

	/**
	 * Delete a quiz configuration
	 * @returns {Promise<void>}
	 */
	async function confirmDeleteQuiz() {
		if (!quizToDelete) return;

		isDeletingId = quizToDelete;
		deleteDialogOpen = false;
		toast.info('Deleting quiz...');

		try {
			const response = await fetch(`/api/quiz-configurations/${quizToDelete}`, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to delete quiz');
			}

			toast.success('Quiz deleted successfully');

			// Track deleted quiz ID so it doesn't reappear when data updates
			deletedQuizIds.add(quizToDelete);
			deletedQuizIds = new Set(deletedQuizIds);

			paginatedQuizzes = paginatedQuizzes.filter((quiz) => quiz.id !== quizToDelete);

			if (favoriteIds.has(quizToDelete)) {
				favoriteIds.delete(quizToDelete);
				favoriteIds = new Set(favoriteIds);
			}
		} catch (error) {
			console.error('Error deleting quiz:', error);
			toast.error(`Error deleting quiz: ${error.message}`);
		} finally {
			isDeletingId = null;
			quizToDelete = null;
		}
	}

	/**
	 * Toggle my quizzes filter and update URL parameters
	 * @returns {void}
	 */
	function toggleMyQuizzesFilter() {
		// If already active, do nothing
		if ($page.url.searchParams.get('myQuizzes') === 'true') return;

		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', '1');
		params.set('myQuizzes', 'true');

		goto(`/quizzes?${params.toString()}`);
	}

	/**
	 * Toggle favorites filter and update URL parameters
	 * @returns {void}
	 */
	function toggleFavoritesFilter() {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', '1');

		if ($page.url.searchParams.get('favorite') === 'true') {
			params.delete('favorite');
		} else {
			params.set('favorite', 'true');
		}

		goto(`/quizzes?${params.toString()}`);
	}

	/**
	 * Clear all search filters and reset form values
	 * @returns {void}
	 */
	function clearFilters() {
		searchQuery = '';
		nameQuery = '';
		descriptionQuery = '';
		authorQuery = '';
		dateFromValue = null;
		dateToValue = null;

		goto('/quizzes?page=1');
	}
</script>

<svelte:head>
	<title>Quizzes - AMQ Plus</title>
	<meta name="description" content="Browse and discover quiz configurations for AMQ" />
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mb-8">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="mb-2 text-3xl font-bold">Quiz Configurations</h1>
				<p class="text-gray-600">Browse and discover quiz configurations for AMQ</p>
			</div>
			<Button href="/quizzes/create" class="flex items-center gap-2" disabled={false}>
				<Plus class="h-4 w-4" />
				Create New Quiz
			</Button>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-4">
		<!-- Filters Sidebar -->
		<div class="lg:col-span-1">
			<Card class="">
				<CardHeader class="">
					<CardTitle class="flex items-center gap-2">
						<Filter class="h-5 w-5" />
						Filters
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<!-- View Filter -->
					{#if session}
						<div class="space-y-2">
							<Label class="">View</Label>
							<div class="flex flex-col gap-2">
								<Button
									variant={!myQuizzesFilter ? 'default' : 'outline'}
									size="sm"
									onclick={() => {
										if (myQuizzesFilter) {
											goto('/quizzes?page=1');
										}
									}}
									class="w-full justify-start"
									disabled={false}
								>
									Public Quizzes
								</Button>
								<Button
									variant={myQuizzesFilter ? 'default' : 'outline'}
									size="sm"
									onclick={toggleMyQuizzesFilter}
									class="w-full justify-start"
									disabled={false}
								>
									My Quizzes
								</Button>
								<Button
									variant={favoriteFilter ? 'default' : 'outline'}
									size="sm"
									onclick={toggleFavoritesFilter}
									class="w-full justify-start"
									disabled={false}
								>
									<Heart class="mr-2 h-4 w-4" />
									Favorites
								</Button>
							</div>
						</div>
					{/if}

					<!-- Search By -->
					<div class="space-y-2">
						<Label class="">Search By</Label>
						<div class="flex flex-col gap-2">
							{#each ['all', 'name', 'description', 'author', 'date'] as type}
								<Button
									variant={searchBy === type ? 'default' : 'outline'}
									size="sm"
									onclick={() => (searchBy = type)}
									class="w-full justify-start text-xs"
									disabled={false}
								>
									{type.charAt(0).toUpperCase() + type.slice(1)}
								</Button>
							{/each}
						</div>
					</div>

					<!-- Search Input -->
					<div class="space-y-2">
						{#if searchBy === 'all'}
							<Label class="">Search All</Label>
							<Input
								bind:value={searchQuery}
								placeholder="Search..."
								onkeydown={(e) => e.key === 'Enter' && handleSearch()}
								type="text"
								class=""
							/>
						{:else if searchBy === 'name'}
							<Label class="">Name</Label>
							<Input
								bind:value={nameQuery}
								placeholder="Quiz name..."
								onkeydown={(e) => e.key === 'Enter' && handleSearch()}
								type="text"
								class=""
							/>
						{:else if searchBy === 'description'}
							<Label class="">Description</Label>
							<Input
								bind:value={descriptionQuery}
								placeholder="Description..."
								onkeydown={(e) => e.key === 'Enter' && handleSearch()}
								type="text"
								class=""
							/>
						{:else if searchBy === 'author'}
							<Label class="">Author</Label>
							<Input
								bind:value={authorQuery}
								placeholder="Author name..."
								onkeydown={(e) => e.key === 'Enter' && handleSearch()}
								type="text"
								class=""
							/>
						{:else if searchBy === 'date'}
							<div class="space-y-2">
								<Label class="">From Date</Label>
								<Popover.Root>
									<Popover.Trigger class="">
										<Button
											variant="outline"
											class="w-full justify-start text-left font-normal"
											disabled={false}
										>
											<CalendarIcon class="mr-2 h-4 w-4" />
											{dateFromValue ? dateValueToString(dateFromValue) : 'Pick a date'}
										</Button>
									</Popover.Trigger>
									<Popover.Content class="w-auto p-0" portalProps={{}}>
										<Calendar
											bind:value={dateFromValue}
											class=""
											months={[]}
											years={[]}
											monthFormat="long"
											day={null}
										/>
									</Popover.Content>
								</Popover.Root>

								<Label class="">To Date</Label>
								<Popover.Root>
									<Popover.Trigger class="">
										<Button
											variant="outline"
											class="w-full justify-start text-left font-normal"
											disabled={false}
										>
											<CalendarIcon class="mr-2 h-4 w-4" />
											{dateToValue ? dateValueToString(dateToValue) : 'Pick a date'}
										</Button>
									</Popover.Trigger>
									<Popover.Content class="w-auto p-0" portalProps={{}}>
										<Calendar
											bind:value={dateToValue}
											class=""
											months={[]}
											years={[]}
											monthFormat="long"
											day={null}
										/>
									</Popover.Content>
								</Popover.Root>
							</div>
						{/if}
					</div>

					<Button onclick={handleSearch} class="w-full" disabled={false}>
						<Search class="mr-2 h-4 w-4" />
						Search
					</Button>

					<Button variant="outline" onclick={clearFilters} class="w-full" disabled={false}
						>Clear Filters</Button
					>
				</CardContent>
			</Card>
		</div>

		<!-- Quiz List -->
		<div class="lg:col-span-3">
			<Card class="">
				<CardHeader class="">
					<div class="flex items-center justify-between">
						<div>
							<CardTitle class="">
								{favoriteFilter
									? 'Favorite Quizzes'
									: myQuizzesFilter
										? 'My Quizzes'
										: 'Public Quizzes'}
							</CardTitle>
							<CardDescription class="">
								{totalFilteredItems} quiz{totalFilteredItems !== 1 ? 'zes' : ''} found
							</CardDescription>
						</div>
						<!-- Sort Dropdown -->
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								<Button
									variant="outline"
									size="sm"
									disabled={false}
									class="flex items-center gap-2"
								>
									{#if sortBy === 'newest'}
										<Clock class="h-4 w-4" />
									{:else if sortBy === 'trending'}
										<TrendingUp class="h-4 w-4" />
									{:else if sortBy === 'mostLiked'}
										<ThumbsUp class="h-4 w-4" />
									{:else if sortBy === 'mostPlayed'}
										<Play class="h-4 w-4" />
									{:else}
										<TrendingUp class="h-4 w-4" />
									{/if}
									{sortBy === 'newest'
										? 'Newest'
										: sortBy === 'trending'
											? 'Trending'
											: sortBy === 'mostLiked'
												? 'Most Liked'
												: sortBy === 'mostPlayed'
													? 'Most Played'
													: 'Sort'}
								</Button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content class="" portalProps={{}}>
								<DropdownMenu.Item
									class={sortBy === 'newest' ? 'bg-accent' : ''}
									inset={false}
									onclick={() => handleSortChange('newest')}
								>
									<Clock class="mr-2 h-4 w-4" />
									Newest
								</DropdownMenu.Item>
								<DropdownMenu.Item
									class={sortBy === 'trending' ? 'bg-accent' : ''}
									inset={false}
									onclick={() => handleSortChange('trending')}
								>
									<TrendingUp class="mr-2 h-4 w-4" />
									Trending
								</DropdownMenu.Item>
								<DropdownMenu.Item
									class={sortBy === 'mostLiked' ? 'bg-accent' : ''}
									inset={false}
									onclick={() => handleSortChange('mostLiked')}
								>
									<ThumbsUp class="mr-2 h-4 w-4" />
									Most Liked
								</DropdownMenu.Item>
								<DropdownMenu.Item
									class={sortBy === 'mostPlayed' ? 'bg-accent' : ''}
									inset={false}
									onclick={() => handleSortChange('mostPlayed')}
								>
									<Play class="mr-2 h-4 w-4" />
									Most Played
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</CardHeader>
				<CardContent class="">
					{#if totalFilteredItems > 0}
						<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{#each filteredItems as quiz}
								<div
									class="relative cursor-pointer rounded-lg border p-4 pr-20 transition-colors hover:bg-gray-50"
									role="button"
									tabindex="0"
									onclick={() => openQuizModal(quiz)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											openQuizModal(quiz);
										}
									}}
								>
									<!-- Action Buttons -->
									{#if session}
										<div class="absolute top-2 right-2 flex gap-1">
											<!-- Heart/Favorite Button -->
											<button
												onclick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													if (isTogglingFavorite) return;
													toggleFavorite(quiz.id);
												}}
												class="rounded-full p-2 transition-colors hover:bg-gray-200 {isTogglingFavorite
													? 'cursor-not-allowed opacity-50'
													: ''}"
												title={favoriteIds.has(quiz.id)
													? 'Remove from favorites'
													: 'Add to favorites'}
											>
												{#if isTogglingFavorite}
													<Loader2 class="h-5 w-5 animate-spin text-gray-400" />
												{:else}
													<Heart
														class="h-5 w-5 {favoriteIds.has(quiz.id)
															? 'fill-red-500 text-red-500'
															: 'text-gray-400'}"
													/>
												{/if}
											</button>

											<!-- Context Menu -->
											<DropdownMenu.Root>
												<DropdownMenu.Trigger
													class="rounded-full p-2 transition-colors hover:bg-gray-200"
													title="More options"
												>
													<MoreVertical class="h-5 w-5 text-gray-400" />
												</DropdownMenu.Trigger>
												<DropdownMenu.Content class="" portalProps={{}}>
													<DropdownMenu.Item
														class=""
														inset={false}
														onclick={(e) => {
															e.preventDefault();
															e.stopPropagation();
															if (isCopyingLink === quiz.id) return;
															copyPlayLink(quiz);
														}}
														disabled={isCopyingLink === quiz.id}
													>
														{#if isCopyingLink === quiz.id}
															<Loader2 class="mr-2 h-4 w-4 animate-spin" />
														{:else}
															<Copy class="mr-2 h-4 w-4" />
														{/if}
														Copy Play Link
													</DropdownMenu.Item>
													{#if myQuizzesFilter}
														<DropdownMenu.Separator class="" />
														<DropdownMenu.Item
															class="text-red-600 focus:text-red-600"
															inset={false}
															onclick={(e) => {
																e.preventDefault();
																e.stopPropagation();
																if (isDeletingId === quiz.id) return;
																openDeleteDialog(quiz.id);
															}}
															disabled={isDeletingId === quiz.id}
														>
															{#if isDeletingId === quiz.id}
																<Loader2 class="mr-2 h-4 w-4 animate-spin" />
															{:else}
																<Trash2 class="mr-2 h-4 w-4" />
															{/if}
															Delete Quiz
														</DropdownMenu.Item>
													{/if}
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										</div>
									{/if}

									<!-- Quiz card content -->
									<div class="block">
										<!-- Title on its own line -->
										<h3
											class="mb-2 line-clamp-2 font-semibold break-all"
											style="word-break: break-all; overflow-wrap: break-word;"
										>
											{quiz.name}
										</h3>

										<!-- Description preview -->
										{#if quiz.description}
											<p
												class="mb-3 text-sm break-all text-gray-600"
												style="word-break: break-all; overflow-wrap: break-word;"
											>
												{quiz.description.length > 86
													? quiz.description.substring(0, 86) + '...'
													: quiz.description}
											</p>
										{/if}

										<!-- Metadata badges -->
										<div class="flex flex-wrap items-center gap-2">
											{#if myQuizzesFilter && 'is_public' in quiz}
												<Badge
													variant={quiz.is_public ? 'default' : 'secondary'}
													class="text-xs"
													href=""
												>
													{quiz.is_public ? 'Public' : 'Private'}
												</Badge>
											{/if}
											{#if !myQuizzesFilter}
												<Badge variant="outline" class="text-xs" href="">
													{quiz.creator_username || 'Unknown'}
												</Badge>
											{/if}
											{#if quiz.allow_remixing === true}
												<Badge variant="outline" class="text-xs text-green-600" href="">
													Remixable
												</Badge>
											{/if}
											<Badge variant="outline" class="text-xs text-gray-500" href="">
												{new Date(quiz.created_at).toLocaleDateString()}
											</Badge>
											{#if quiz.likes !== undefined}
												<Badge
													variant="outline"
													class="text-xs text-purple-600"
													href=""
													title="Likes"
												>
													<ThumbsUp class="mr-1 inline h-3 w-3" />
													{quiz.likes || 0}
												</Badge>
											{/if}
											{#if quiz.plays !== undefined}
												<Badge
													variant="outline"
													class="text-xs text-green-600"
													href=""
													title="Plays"
												>
													<Play class="mr-1 inline h-3 w-3" />
													{quiz.plays || 0}
												</Badge>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>

						<!-- Pagination -->
						{#if (favoriteFilter ? totalFilteredPages : totalPages) > 1}
							<div class="mt-6 flex justify-center">
								<Pagination.Root
									count={favoriteFilter ? filteredItems.length : totalItems}
									perPage={data.pagination.limit}
									page={currentPage}
									onPageChange={changePage}
									siblingCount={1}
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
														<Pagination.Link {page} isActive={currentPage === page.value} class="">
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
					{:else}
						<div class="py-12 text-center text-gray-500">
							<p class="mb-2 text-lg font-medium">No quizzes found</p>
							<p class="text-sm">
								{#if favoriteFilter}
									You haven't favorited any quizzes yet
								{:else if myQuizzesFilter}
									You haven't created any quizzes yet
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

<!-- Delete Confirmation Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content class="" portalProps={{}}>
		{#snippet children()}
			<AlertDialog.Header class="">
				{#snippet children()}
					<AlertDialog.Title class="">Delete Quiz</AlertDialog.Title>
					<AlertDialog.Description class="">
						Are you sure you want to delete this quiz? This action cannot be undone.
					</AlertDialog.Description>
				{/snippet}
			</AlertDialog.Header>
			<AlertDialog.Footer class="">
				{#snippet children()}
					<AlertDialog.Cancel class="">Cancel</AlertDialog.Cancel>
					<AlertDialog.Action
						class="bg-red-600 text-white hover:bg-red-700"
						onclick={confirmDeleteQuiz}
					>
						Delete
					</AlertDialog.Action>
				{/snippet}
			</AlertDialog.Footer>
		{/snippet}
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Quiz Selection Modal -->
<AlertDialog.Root bind:open={quizModalOpen}>
	<AlertDialog.Content class="" portalProps={{}} closeOnOutsideClick={true}>
		{#snippet children()}
			<AlertDialog.Header class="">
				{#snippet children()}
					<AlertDialog.Title
						class="break-all"
						style="word-break: break-all; overflow-wrap: break-word;"
						>{selectedQuiz?.name || 'Quiz'}</AlertDialog.Title
					>
					<AlertDialog.Description class="">Choose an action for this quiz</AlertDialog.Description>
				{/snippet}
			</AlertDialog.Header>
			<div class="py-4">
				{#if selectedQuiz}
					<!-- Description (if present) -->
					{#if selectedQuiz.description}
						<div
							class="mb-4 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3"
						>
							<p class="text-xs font-semibold text-gray-700">Description</p>
							<p
								class="text-sm break-all text-gray-600"
								style="word-break: break-all; overflow-wrap: break-word;"
							>
								{selectedQuiz.description}
							</p>
						</div>
					{/if}

					<!-- Quiz Metadata -->
					{#if selectedQuiz.quiz_metadata}
						{@const liveNode = selectedQuiz.quiz_metadata.sourceNodes?.find(
							(n) => n.type === 'liveNode'
						)}
						{@const batchUserListNode = selectedQuiz.quiz_metadata.sourceNodes?.find(
							(n) => n.type === 'batchUserList'
						)}
						{@const sourceNodeWithMode = liveNode || batchUserListNode}
						{@const songTypesMode = selectedQuiz.quiz_metadata.songTypes
							? selectedQuiz.quiz_metadata.songTypes.openings?.count !== undefined ||
								selectedQuiz.quiz_metadata.songTypes.openings?.minCount !== undefined ||
								selectedQuiz.quiz_metadata.songTypes.endings?.count !== undefined ||
								selectedQuiz.quiz_metadata.songTypes.endings?.minCount !== undefined ||
								selectedQuiz.quiz_metadata.songTypes.inserts?.count !== undefined ||
								selectedQuiz.quiz_metadata.songTypes.inserts?.minCount !== undefined
								? 'count'
								: 'percentage'
							: null}
						<div class="mb-4">
							<div class="flex flex-wrap items-center gap-2">
								<!-- Number of Songs -->
								{#if selectedQuiz.quiz_metadata.estimatedSongs}
									<Badge variant="outline" class="text-xs" href="">
										{#if selectedQuiz.quiz_metadata.estimatedSongs.min === 'unknown'}
											🎶 Unknown songs
										{:else if selectedQuiz.quiz_metadata.estimatedSongs.min === selectedQuiz.quiz_metadata.estimatedSongs.max}
											🎶 {selectedQuiz.quiz_metadata.estimatedSongs.min} songs
										{:else}
											🎶 {selectedQuiz.quiz_metadata.estimatedSongs.min}-{selectedQuiz.quiz_metadata
												.estimatedSongs.max} songs
										{/if}
									</Badge>
								{/if}

								<!-- Song Types -->
								{#if selectedQuiz.quiz_metadata.songTypes && songTypesMode}
									{@const openingsValue =
										songTypesMode === 'count'
											? (selectedQuiz.quiz_metadata.songTypes.openings?.count !== undefined
												? selectedQuiz.quiz_metadata.songTypes.openings.count
												: selectedQuiz.quiz_metadata.songTypes.openings?.minCount !== undefined
													? selectedQuiz.quiz_metadata.songTypes.openings.minCount
													: null)
											: selectedQuiz.quiz_metadata.songTypes.openings?.percentage}
									{@const endingsValue =
										songTypesMode === 'count'
											? (selectedQuiz.quiz_metadata.songTypes.endings?.count !== undefined
												? selectedQuiz.quiz_metadata.songTypes.endings.count
												: selectedQuiz.quiz_metadata.songTypes.endings?.minCount !== undefined
													? selectedQuiz.quiz_metadata.songTypes.endings.minCount
													: null)
											: selectedQuiz.quiz_metadata.songTypes.endings?.percentage}
									{@const insertsValue =
										songTypesMode === 'count'
											? (selectedQuiz.quiz_metadata.songTypes.inserts?.count !== undefined
												? selectedQuiz.quiz_metadata.songTypes.inserts.count
												: selectedQuiz.quiz_metadata.songTypes.inserts?.minCount !== undefined
													? selectedQuiz.quiz_metadata.songTypes.inserts.minCount
													: null)
											: selectedQuiz.quiz_metadata.songTypes.inserts?.percentage}
									{#if selectedQuiz.quiz_metadata.songTypes.openings?.enabled && (openingsValue !== null && openingsValue !== undefined || (selectedQuiz.quiz_metadata.songTypes.openings?.random && selectedQuiz.quiz_metadata.songTypes.openings?.minCount !== undefined && selectedQuiz.quiz_metadata.songTypes.openings?.maxCount !== undefined))}
										<Badge variant="outline" class="text-xs text-green-600" href="">
											🎵 OP
											{#if songTypesMode === 'count'}
												{#if selectedQuiz.quiz_metadata.songTypes.openings.random && selectedQuiz.quiz_metadata.songTypes.openings.minCount !== undefined && selectedQuiz.quiz_metadata.songTypes.openings.maxCount !== undefined}
													{selectedQuiz.quiz_metadata.songTypes.openings.minCount}-{selectedQuiz
														.quiz_metadata.songTypes.openings.maxCount}
												{:else if selectedQuiz.quiz_metadata.songTypes.openings.count !== undefined}
													{selectedQuiz.quiz_metadata.songTypes.openings.count}
												{/if}
											{:else}
												{selectedQuiz.quiz_metadata.songTypes.openings.percentage || 0}%
												{#if selectedQuiz.quiz_metadata.songTypes.openings.random}
													({selectedQuiz.quiz_metadata.songTypes.openings.minPercentage ||
														0}-{selectedQuiz.quiz_metadata.songTypes.openings.maxPercentage || 0})
												{/if}
											{/if}
										</Badge>
									{/if}
									{#if selectedQuiz.quiz_metadata.songTypes.endings?.enabled && (endingsValue !== null && endingsValue !== undefined || (selectedQuiz.quiz_metadata.songTypes.endings?.random && selectedQuiz.quiz_metadata.songTypes.endings?.minCount !== undefined && selectedQuiz.quiz_metadata.songTypes.endings?.maxCount !== undefined))}
										<Badge variant="outline" class="text-xs text-blue-600" href="">
											🎵 ED
											{#if songTypesMode === 'count'}
												{#if selectedQuiz.quiz_metadata.songTypes.endings.random && selectedQuiz.quiz_metadata.songTypes.endings.minCount !== undefined && selectedQuiz.quiz_metadata.songTypes.endings.maxCount !== undefined}
													{selectedQuiz.quiz_metadata.songTypes.endings.minCount}-{selectedQuiz
														.quiz_metadata.songTypes.endings.maxCount}
												{:else if selectedQuiz.quiz_metadata.songTypes.endings.count !== undefined}
													{selectedQuiz.quiz_metadata.songTypes.endings.count}
												{/if}
											{:else}
												{selectedQuiz.quiz_metadata.songTypes.endings.percentage || 0}%
												{#if selectedQuiz.quiz_metadata.songTypes.endings.random}
													({selectedQuiz.quiz_metadata.songTypes.endings.minPercentage ||
														0}-{selectedQuiz.quiz_metadata.songTypes.endings.maxPercentage || 0})
												{/if}
											{/if}
										</Badge>
									{/if}
									{#if selectedQuiz.quiz_metadata.songTypes.inserts?.enabled && (insertsValue !== null && insertsValue !== undefined || (selectedQuiz.quiz_metadata.songTypes.inserts?.random && selectedQuiz.quiz_metadata.songTypes.inserts?.minCount !== undefined && selectedQuiz.quiz_metadata.songTypes.inserts?.maxCount !== undefined))}
										<Badge variant="outline" class="text-xs text-purple-600" href="">
											🎵 IN
											{#if songTypesMode === 'count'}
												{#if selectedQuiz.quiz_metadata.songTypes.inserts.random && selectedQuiz.quiz_metadata.songTypes.inserts.minCount !== undefined && selectedQuiz.quiz_metadata.songTypes.inserts.maxCount !== undefined}
													{selectedQuiz.quiz_metadata.songTypes.inserts.minCount}-{selectedQuiz
														.quiz_metadata.songTypes.inserts.maxCount}
												{:else if selectedQuiz.quiz_metadata.songTypes.inserts.count !== undefined}
													{selectedQuiz.quiz_metadata.songTypes.inserts.count}
												{/if}
											{:else}
												{selectedQuiz.quiz_metadata.songTypes.inserts.percentage || 0}%
												{#if selectedQuiz.quiz_metadata.songTypes.inserts.random}
													({selectedQuiz.quiz_metadata.songTypes.inserts.minPercentage ||
														0}-{selectedQuiz.quiz_metadata.songTypes.inserts.maxPercentage || 0})
												{/if}
											{/if}
										</Badge>
									{/if}
								{/if}

								<!-- Difficulty -->
								{#if selectedQuiz.quiz_metadata.difficulty}
									{#if selectedQuiz.quiz_metadata.difficulty.mode === 'basic'}
										{@const difficultyMode =
											selectedQuiz.quiz_metadata.difficulty.levels.easy?.count !== undefined ||
											selectedQuiz.quiz_metadata.difficulty.levels.easy?.minCount !== undefined ||
											selectedQuiz.quiz_metadata.difficulty.levels.medium?.count !== undefined ||
											selectedQuiz.quiz_metadata.difficulty.levels.medium?.minCount !== undefined ||
											selectedQuiz.quiz_metadata.difficulty.levels.hard?.count !== undefined ||
											selectedQuiz.quiz_metadata.difficulty.levels.hard?.minCount !== undefined
												? 'count'
												: 'percentage'}
										{@const easyValue =
											difficultyMode === 'count'
												? selectedQuiz.quiz_metadata.difficulty.levels.easy?.count ||
													selectedQuiz.quiz_metadata.difficulty.levels.easy?.minCount
												: selectedQuiz.quiz_metadata.difficulty.levels.easy?.percentage}
										{@const mediumValue =
											difficultyMode === 'count'
												? selectedQuiz.quiz_metadata.difficulty.levels.medium?.count ||
													selectedQuiz.quiz_metadata.difficulty.levels.medium?.minCount
												: selectedQuiz.quiz_metadata.difficulty.levels.medium?.percentage}
										{@const hardValue =
											difficultyMode === 'count'
												? selectedQuiz.quiz_metadata.difficulty.levels.hard?.count ||
													selectedQuiz.quiz_metadata.difficulty.levels.hard?.minCount
												: selectedQuiz.quiz_metadata.difficulty.levels.hard?.percentage}
										{#if selectedQuiz.quiz_metadata.difficulty.levels.easy?.enabled && easyValue}
											<Badge variant="outline" class="text-xs text-green-600" href="">
												⭐ Easy
												{#if difficultyMode === 'count'}
													{#if selectedQuiz.quiz_metadata.difficulty.levels.easy.minCount !== undefined && selectedQuiz.quiz_metadata.difficulty.levels.easy.maxCount !== undefined}
														{selectedQuiz.quiz_metadata.difficulty.levels.easy
															.minCount}-{selectedQuiz.quiz_metadata.difficulty.levels.easy
															.maxCount}
													{:else if selectedQuiz.quiz_metadata.difficulty.levels.easy.count !== undefined}
														{selectedQuiz.quiz_metadata.difficulty.levels.easy.count}
													{/if}
												{:else}
													{selectedQuiz.quiz_metadata.difficulty.levels.easy.percentage || 0}%
													{#if selectedQuiz.quiz_metadata.difficulty.levels.easy.random}
														({selectedQuiz.quiz_metadata.difficulty.levels.easy.minPercentage ||
															0}-{selectedQuiz.quiz_metadata.difficulty.levels.easy.maxPercentage ||
															0})
													{/if}
												{/if}
											</Badge>
										{/if}
										{#if selectedQuiz.quiz_metadata.difficulty.levels.medium?.enabled && mediumValue}
											<Badge variant="outline" class="text-xs text-yellow-600" href="">
												⭐ Medium
												{#if difficultyMode === 'count'}
													{#if selectedQuiz.quiz_metadata.difficulty.levels.medium.minCount !== undefined && selectedQuiz.quiz_metadata.difficulty.levels.medium.maxCount !== undefined}
														{selectedQuiz.quiz_metadata.difficulty.levels.medium
															.minCount}-{selectedQuiz.quiz_metadata.difficulty.levels.medium
															.maxCount}
													{:else if selectedQuiz.quiz_metadata.difficulty.levels.medium.count !== undefined}
														{selectedQuiz.quiz_metadata.difficulty.levels.medium.count}
													{/if}
												{:else}
													{selectedQuiz.quiz_metadata.difficulty.levels.medium.percentage || 0}%
													{#if selectedQuiz.quiz_metadata.difficulty.levels.medium.random}
														({selectedQuiz.quiz_metadata.difficulty.levels.medium.minPercentage ||
															0}-{selectedQuiz.quiz_metadata.difficulty.levels.medium
															.maxPercentage || 0})
													{/if}
												{/if}
											</Badge>
										{/if}
										{#if selectedQuiz.quiz_metadata.difficulty.levels.hard?.enabled && hardValue}
											<Badge variant="outline" class="text-xs text-red-600" href="">
												⭐ Hard
												{#if difficultyMode === 'count'}
													{#if selectedQuiz.quiz_metadata.difficulty.levels.hard.minCount !== undefined && selectedQuiz.quiz_metadata.difficulty.levels.hard.maxCount !== undefined}
														{selectedQuiz.quiz_metadata.difficulty.levels.hard
															.minCount}-{selectedQuiz.quiz_metadata.difficulty.levels.hard
															.maxCount}
													{:else if selectedQuiz.quiz_metadata.difficulty.levels.hard.count !== undefined}
														{selectedQuiz.quiz_metadata.difficulty.levels.hard.count}
													{/if}
												{:else}
													{selectedQuiz.quiz_metadata.difficulty.levels.hard.percentage || 0}%
													{#if selectedQuiz.quiz_metadata.difficulty.levels.hard.random}
														({selectedQuiz.quiz_metadata.difficulty.levels.hard.minPercentage ||
															0}-{selectedQuiz.quiz_metadata.difficulty.levels.hard.maxPercentage ||
															0})
													{/if}
												{/if}
											</Badge>
										{/if}
									{:else if selectedQuiz.quiz_metadata.difficulty.mode === 'advanced'}
										{#each selectedQuiz.quiz_metadata.difficulty.ranges as range}
											{#if range.count}
												<Badge variant="outline" class="text-xs text-orange-600" href="">
													⭐ {range.from}-{range.to} ({range.count})
												</Badge>
											{/if}
										{/each}
									{/if}
								{/if}

								<!-- Song Selection -->
								{#if selectedQuiz.quiz_metadata.songSelection}
									{@const songSelectionMode =
										selectedQuiz.quiz_metadata.songSelection.random?.count !== undefined ||
										selectedQuiz.quiz_metadata.songSelection.random?.minCount !== undefined ||
										selectedQuiz.quiz_metadata.songSelection.watched?.count !== undefined ||
										selectedQuiz.quiz_metadata.songSelection.watched?.minCount !== undefined
											? 'count'
											: 'percentage'}
									{@const randomValue =
										songSelectionMode === 'count'
											? selectedQuiz.quiz_metadata.songSelection.random?.count ||
												selectedQuiz.quiz_metadata.songSelection.random?.minCount
											: selectedQuiz.quiz_metadata.songSelection.random?.percentage}
									{@const watchedValue =
										songSelectionMode === 'count'
											? selectedQuiz.quiz_metadata.songSelection.watched?.count ||
												selectedQuiz.quiz_metadata.songSelection.watched?.minCount
											: selectedQuiz.quiz_metadata.songSelection.watched?.percentage}
									{#if selectedQuiz.quiz_metadata.songSelection.random?.enabled && randomValue}
										<Badge variant="outline" class="text-xs text-indigo-600" href="">
											🎲 Random
											{#if songSelectionMode === 'count'}
												{#if selectedQuiz.quiz_metadata.songSelection.random.minCount !== undefined && selectedQuiz.quiz_metadata.songSelection.random.maxCount !== undefined && selectedQuiz.quiz_metadata.songSelection.random.random && selectedQuiz.quiz_metadata.songSelection.random.minCount < selectedQuiz.quiz_metadata.songSelection.random.maxCount}
													{selectedQuiz.quiz_metadata.songSelection.random.minCount}-{selectedQuiz
														.quiz_metadata.songSelection.random.maxCount}
												{:else if selectedQuiz.quiz_metadata.songSelection.random.count !== undefined}
													{selectedQuiz.quiz_metadata.songSelection.random.count}
												{/if}
											{:else}
												{selectedQuiz.quiz_metadata.songSelection.random.percentage || 0}%
											{/if}
										</Badge>
									{/if}
									{#if selectedQuiz.quiz_metadata.songSelection.watched?.enabled && watchedValue}
										<Badge variant="outline" class="text-xs text-teal-600" href="">
											👁️ Watched
											{#if songSelectionMode === 'count'}
												{#if selectedQuiz.quiz_metadata.songSelection.watched.minCount !== undefined && selectedQuiz.quiz_metadata.songSelection.watched.maxCount !== undefined && selectedQuiz.quiz_metadata.songSelection.watched.random && selectedQuiz.quiz_metadata.songSelection.watched.minCount < selectedQuiz.quiz_metadata.songSelection.watched.maxCount}
													{selectedQuiz.quiz_metadata.songSelection.watched.minCount}-{selectedQuiz
														.quiz_metadata.songSelection.watched.maxCount}
												{:else if selectedQuiz.quiz_metadata.songSelection.watched.count !== undefined}
													{selectedQuiz.quiz_metadata.songSelection.watched.count}
												{/if}
											{:else}
												{selectedQuiz.quiz_metadata.songSelection.watched.percentage || 0}%
											{/if}
										</Badge>
									{/if}
								{/if}
								<!-- Live Node Status -->
								{#if liveNode}
									<Badge
										variant="outline"
										class="text-xs text-pink-600"
										href=""
										title="Live Node - Uses player lists from lobby"
									>
										🔴 Live Node
									</Badge>
								{/if}
								<!-- List Distribution Mode -->
								{#if sourceNodeWithMode?.songSelectionMode}
									{@const modeNames = {
										default: 'Random',
										'many-lists': 'All Shared',
										'few-lists': 'No Shared'
									}}
									{@const modeTooltips = {
										default:
											'Random: Songs are selected randomly without prioritizing based on list overlap',
										'many-lists':
											'All Shared: Prioritizes songs that appear on the most user lists (songs everyone knows)',
										'few-lists':
											'No Shared: Prioritizes songs that appear on the fewest user lists (unique/rare songs)'
									}}
									{@const modeName =
										modeNames[sourceNodeWithMode.songSelectionMode] ||
										sourceNodeWithMode.songSelectionMode}
									{@const modeTooltip =
										modeTooltips[sourceNodeWithMode.songSelectionMode] || 'List Distribution Mode'}
									<Badge
										variant="outline"
										class="text-xs text-indigo-600"
										href=""
										title={modeTooltip}
									>
										📊 {modeName}
									</Badge>
								{/if}
								<!-- Guess Time -->
								{#if selectedQuiz.quiz_metadata?.guessTime}
									{@const gt = selectedQuiz.quiz_metadata.guessTime.guessTime}
									{@const egt = selectedQuiz.quiz_metadata.guessTime.extraGuessTime}
									<Badge
										variant="outline"
										class="text-xs text-blue-600"
										href=""
										title="Guess Time"
									>
										<Clock class="mr-1 inline h-3 w-3" />
										{#if gt.useRange}
											{gt.min}-{gt.max}s
										{:else}
											{gt.staticValue !== undefined ? gt.staticValue : gt.min}s
										{/if}
										{#if egt && ((egt.useRange && (egt.min > 0 || egt.max > 0)) || (!egt.useRange && (egt.staticValue !== undefined ? egt.staticValue > 0 : egt.min > 0)))}
											{' '}+
											{#if egt.useRange}
												{egt.min}-{egt.max}s
											{:else}
												{egt.staticValue !== undefined ? egt.staticValue : egt.min}s
											{/if}
										{/if}
									</Badge>
								{/if}
							</div>
						</div>

						<!-- Live Node Player Alert -->
						{#if liveNode}
							<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
								<div class="flex items-start gap-2">
									<div class="flex-1 text-xs text-amber-800">
										<p>Player lists will be synced from the lobby when the quiz is played.</p>
									</div>
								</div>
							</div>
						{/if}
					{/if}

					<!-- Play Link -->
					<div class="mb-4">
						<Label class="mb-2 block text-sm font-medium">Play Link</Label>
						<div class="flex gap-2">
							<Input
								readonly
								type="text"
								value={getPlayUrlSafe(selectedQuiz)}
								class="flex-1 font-mono text-xs"
							/>
							<Button
								variant="outline"
								size="sm"
								class=""
								onclick={() => copyPlayLink(selectedQuiz)}
								disabled={isCopyingLink === selectedQuiz.id}
							>
								{#if isCopyingLink === selectedQuiz.id}
									<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								{:else}
									<Copy class="mr-2 h-4 w-4" />
								{/if}
								Copy
							</Button>
						</div>
						<!-- Companion Script Notice -->
						<div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
							<div class="flex items-start gap-2">
								<svg
									class="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path
										fill-rule="evenodd"
										d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
										clip-rule="evenodd"
									/>
								</svg>
								<div class="flex-1 text-xs text-amber-800">
									<p class="mb-1 font-semibold">Required: Companion Script</p>
									<p class="text-amber-700">
										To play this quiz in AMQ, you need to install the AMQ+ companion script. First,
										install <a
											href="https://www.tampermonkey.net/"
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold underline hover:text-amber-900">Tampermonkey</a
										>
										(required), then
										<a
											href="https://github.com/4Lajf/amq-scripts/raw/refs/heads/main/amqPlusConnector.user.js"
											target="_blank"
											rel="noopener noreferrer"
											class="font-semibold underline hover:text-amber-900">download the script</a
										>.
									</p>
								</div>
							</div>
						</div>
					</div>

					<!-- Actions -->
					<div class="flex flex-col gap-2">
						{#if selectedQuiz.allow_remixing === false && !myQuizzesFilter}
							<Button
								variant="outline"
								disabled={true}
								class="w-full cursor-not-allowed opacity-50"
							>
								Editor Unavailable (Remixing Disabled)
							</Button>
						{:else}
							<Button
								variant="default"
								href={`/quizzes/create?loadQuiz=${selectedQuiz.id}`}
								class="w-full"
								disabled={false}
							>
								Open in Editor
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
