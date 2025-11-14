<script>
	/**
	 * Song List Settings Form Component
	 * Complex form for configuring Song List source nodes.
	 * Supports three modes: Entire Database, User Lists, and Saved Lists.
	 *
	 * @component
	 */

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import { Loader2, AlertCircle, Search, CalendarIcon, Info, ExternalLink } from 'lucide-svelte';
	import Calendar from '$lib/components/ui/calendar/calendar.svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { CalendarDate, getLocalTimeZone } from '@internationalized/date';
	import RangeSlider from 'svelte-range-slider-pips';

	import {
		fetchSavedLists,
		fetchPublicLists,
		loadListSongs,
		getMasterlistMetadata,
		validateSongListConfig
	} from '../utils/songListUtils.js';
	import { processProviderData, PROVIDER_INFO } from '../utils/providerUtils.js';

	/**
	 * @typedef {Object} Props
	 * @property {Object} editedValue - Current settings value being edited
	 * @property {Function} onAutoSave - Callback for auto-saving changes
	 * @property {boolean} isValid - Whether current config is valid
	 * @property {string} validationMessage - Validation error message
	 */

	/** @type {Props} */
	let {
		editedValue = $bindable(),
		onAutoSave = () => {},
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

	// Initialize userListImport if not present when in user-lists mode
	if (editedValue.mode === 'user-lists' && !editedValue.userListImport) {
		editedValue.userListImport = {
			platform: 'anilist',
			username: '',
			selectedLists: {
				completed: true,
				watching: true,
				planning: false,
				on_hold: false,
				dropped: false
			}
		};
	}

	// Initialize providerImport if not present when in provider mode
	if (editedValue.mode === 'provider' && !editedValue.providerImport) {
		editedValue.providerImport = {
			providerType: 'amq-export',
			fileData: null,
			processedData: null
		};
	}

	if (editedValue.songPercentage !== null && editedValue.songPercentage !== undefined) {
		if (typeof editedValue.songPercentage === 'number') {
			editedValue.songPercentage = {
				value: editedValue.songPercentage,
				random: false,
				min: 0,
				max: 100
			};
		} else if (typeof editedValue.songPercentage === 'object') {
			// Ensure new format has all required properties
			if (editedValue.songPercentage.random === undefined) {
				editedValue.songPercentage.random = false;
			}
			if (editedValue.songPercentage.min === undefined) {
				editedValue.songPercentage.min = 0;
			}
			if (editedValue.songPercentage.max === undefined) {
				editedValue.songPercentage.max = 100;
			}
		}
	}

	// State for provider import
	let isProcessingProvider = $state(false);
	let providerError = $state(null);
	let providerFileInput = $state(null);

	// State for saved/public lists
	let savedLists = $state([]);
	let publicLists = $state([]);
	let publicPagination = $state({ page: 1, limit: 10, total: 0, totalPages: 0 });
	let isLoadingLists = $state(false);
	let listsError = $state(null);

	// Search and filter state for public lists
	let searchBy = $state('all');
	let searchQuery = $state('');
	let nameQuery = $state('');
	let descriptionQuery = $state('');
	let authorQuery = $state('');
	let dateFromValue = $state(undefined);
	let dateToValue = $state(undefined);
	let dateFromOpen = $state(false);
	let dateToOpen = $state(false);
	let showMyLists = $state(true); // Show "My Lists" by default

	// Provider type options
	const providerTypes = Object.entries(PROVIDER_INFO).map(([key, info]) => ({
		value: key,
		label: info.name,
		icon: info.icon,
		color: info.color
	}));

	// Helper function to format date for display
	function formatDate(date) {
		if (!date) return '';
		return date.toDate(getLocalTimeZone()).toLocaleDateString('en-US', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});
	}

	// Helper function to convert DateValue to string (YYYY-MM-DD)
	function dateValueToString(dateValue) {
		if (!dateValue) return '';
		const date = dateValue.toDate(getLocalTimeZone());
		return date.toISOString().split('T')[0];
	}

	// Handle mode change
	function handleModeChange(event) {
		const newMode = event.target.value;
		editedValue.mode = newMode;
		validateAndAutoSave();
	}

	// Handle use entire pool toggle
	function handleUseEntirePoolChange(checked) {
		editedValue.useEntirePool = checked;
		onAutoSave(editedValue);
	}

	// Load saved and public lists
	async function loadLists(page = 1) {
		isLoadingLists = true;
		listsError = null;

		try {
			// Build filters for public lists
			const filters = {
				page,
				limit: 10
			};

			// Apply search filters based on searchBy mode
			if (searchBy === 'all' && searchQuery) {
				filters.search = searchQuery;
			} else if (searchBy === 'name' && nameQuery) {
				filters.name = nameQuery;
			} else if (searchBy === 'description' && descriptionQuery) {
				filters.description = descriptionQuery;
			} else if (searchBy === 'author' && authorQuery) {
				filters.creator = authorQuery;
			} else if (searchBy === 'date') {
				if (dateFromValue) filters.dateFrom = dateValueToString(dateFromValue);
				if (dateToValue) filters.dateTo = dateValueToString(dateToValue);
			}

			const [saved, publicResult] = await Promise.all([
				fetchSavedLists(),
				fetchPublicLists(filters)
			]);

			savedLists = saved;
			publicLists = publicResult.lists;
			publicPagination = publicResult.pagination;
		} catch (error) {
			listsError = error.message;
		} finally {
			isLoadingLists = false;
		}
	}

	// Apply search filters
	function applyFilters() {
		loadLists(1); // Reset to page 1 when filtering
	}

	// Handle page change for public lists
	function changePage(newPage) {
		loadLists(newPage);
	}

	// Select a list (single selection only)
	function selectList(listId) {
		editedValue.selectedListId = listId;
		// Also store the list name for display purposes
		const list = displayLists.find((l) => l.id === listId);
		editedValue.selectedListName = list ? list.name : null;
		validateAndAutoSave();
	}

	// Handle provider file upload
	async function handleProviderFileUpload(event) {
		const file = event.target.files[0];
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
				const fileResult = e.target.result;
				if (typeof fileResult !== 'string') {
					throw new Error('Expected string result from FileReader');
				}
				const jsonData = JSON.parse(fileResult);
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

				editedValue.providerImport.fileData = jsonData;
				editedValue.providerImport.processedData = result;
				validateAndAutoSave();
				isProcessingProvider = false;
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
	function clearProviderData() {
		editedValue.providerImport.fileData = null;
		editedValue.providerImport.processedData = null;
		providerError = null;
		if (providerFileInput) {
			providerFileInput.value = '';
		}
		validateAndAutoSave();
	}

	// Validate and auto-save
	function validateAndAutoSave() {
		const validation = validateSongListConfig(editedValue);
		isValid = validation.valid;
		validationMessage = validation.error || '';

		if (isValid) {
			onAutoSave(editedValue);
		}
	}

	// Load lists when switching to saved-lists mode
	$effect(() => {
		if (
			editedValue.mode === 'saved-lists' &&
			savedLists.length === 0 &&
			publicLists.length === 0 &&
			!isLoadingLists
		) {
			loadLists(1);
		}
	});

	// Validate on mount
	$effect(() => {
		if (editedValue) {
			const validation = validateSongListConfig(editedValue);
			isValid = validation.valid;
			validationMessage = validation.error || '';
		}
	});

	// Derived: Display lists (either my lists or public lists)
	const displayLists = $derived(showMyLists ? savedLists : publicLists);

	// Derived: Selected list object
	const selectedList = $derived(
		displayLists.find((list) => list.id === editedValue.selectedListId) || null
	);
</script>

<div class="space-y-6">
	<!-- Mode Selection -->
	<div class="space-y-3">
		<Label class="text-base font-semibold">Song Source Mode</Label>
		<div class="space-y-2">
			<div class="flex items-center space-x-2">
				<input
					type="radio"
					id="mode-masterlist"
					name="mode"
					value="masterlist"
					checked={editedValue.mode === 'masterlist'}
					onchange={handleModeChange}
					class="h-4 w-4 border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
				/>
				<label for="mode-masterlist" class="cursor-pointer text-sm font-medium text-gray-900">
					Entire Database (All songs in database)
				</label>
			</div>
			<div class="flex items-center space-x-2">
				<input
					type="radio"
					id="mode-user-lists"
					name="mode"
					value="user-lists"
					checked={editedValue.mode === 'user-lists'}
					onchange={handleModeChange}
					class="h-4 w-4 border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
				/>
				<label for="mode-user-lists" class="cursor-pointer text-sm font-medium text-gray-900">
					User Lists (Import from AniList/MAL)
				</label>
			</div>
			<div class="flex items-center space-x-2">
				<input
					type="radio"
					id="mode-saved-lists"
					name="mode"
					value="saved-lists"
					checked={editedValue.mode === 'saved-lists'}
					onchange={handleModeChange}
					class="h-4 w-4 border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
				/>
				<label for="mode-saved-lists" class="cursor-pointer text-sm font-medium text-gray-900">
					Saved Lists (Your saved lists or public lists)
				</label>
			</div>
			<div class="flex items-center space-x-2">
				<input
					type="radio"
					id="mode-provider"
					name="mode"
					value="provider"
					checked={editedValue.mode === 'provider'}
					onchange={handleModeChange}
					class="h-4 w-4 border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
				/>
				<label for="mode-provider" class="cursor-pointer text-sm font-medium text-gray-900">
					Provider Import (AMQ, Joseph Song UI, etc.)
				</label>
			</div>
		</div>
	</div>

	<Separator class="" />

	<!-- Masterlist Mode -->
	{#if editedValue.mode === 'masterlist'}
		<div class="space-y-4">
			<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
				<div class="flex items-start gap-3">
					<div class="text-2xl">📋</div>
					<div>
						<div class="font-semibold text-blue-900">Entire Database</div>
						<div class="mt-1 text-sm text-blue-700">
							All songs available in the AnimeMusicQuiz database will be used as the base pool.
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- User Lists Mode -->
	{#if editedValue.mode === 'user-lists'}
		<div class="space-y-4">
			<div class="rounded-lg border border-blue-200 bg-blue-50 p-3">
				<p class="text-sm text-blue-800">
					Configure the username and list settings. The lists will be imported automatically from the server when generating the quiz.
				</p>
			</div>

			<!-- Platform and Username Configuration -->
			<div class="grid grid-cols-2 gap-4">
				<div>
					<Label class="">Profile Type</Label>
					<Select.Root
						value={editedValue.userListImport?.platform || 'anilist'}
						onValueChange={(val) => {
							editedValue.userListImport.platform = val;
							onAutoSave(editedValue);
						}}
						type="single"
					>
						<Select.Trigger class="w-full">
							{editedValue.userListImport?.platform === 'mal' ? 'MyAnimeList' : 'AniList'}
						</Select.Trigger>
						<Select.Content class="" portalProps={{}}>
							<Select.Item value="anilist" label="AniList" class="">
								AniList
							</Select.Item>
							<Select.Item value="mal" label="MyAnimeList" class="">
								MyAnimeList
							</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
				<div>
					<Label class="">Username</Label>
					<Input
						bind:value={editedValue.userListImport.username}
						placeholder="Enter username..."
						onchange={() => onAutoSave(editedValue)}
						type="text"
						class=""
					/>
				</div>
			</div>

			<!-- List Types to Import -->
			<div>
				<Label class="text-sm font-medium">List Types to Import</Label>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each Object.entries(editedValue.userListImport?.selectedLists || {}) as [status, checked]}
						<label class="flex items-center space-x-2">
							<Checkbox
								checked={editedValue.userListImport.selectedLists[status]}
								onCheckedChange={(checked) => {
									editedValue.userListImport.selectedLists[status] = checked;
									onAutoSave(editedValue);
								}}
								class=""
							/>
							<span class="text-sm capitalize">{status.replace('_', ' ')}</span>
						</label>
					{/each}
					</div>
				</div>
		</div>
	{/if}

	<!-- Saved Lists Mode -->
	{#if editedValue.mode === 'saved-lists'}
		<div class="space-y-4">
			<!-- View Toggle: My Lists vs Public Lists -->
			<div class="flex items-center gap-2">
				<Button
					variant={showMyLists ? 'default' : 'outline'}
					size="sm"
					onclick={() => {
						showMyLists = true;
						searchBy = 'all';
						searchQuery = '';
						nameQuery = '';
						descriptionQuery = '';
						authorQuery = '';
						dateFromValue = undefined;
						dateToValue = undefined;
					}}
					class=""
					disabled={false}
				>
					My Lists
				</Button>
				<Button
					variant={!showMyLists ? 'default' : 'outline'}
					size="sm"
					onclick={() => {
						showMyLists = false;
					}}
					class=""
					disabled={false}
				>
					Public Lists
				</Button>
			</div>

			<!-- Search & Filter (only for public lists) -->
			{#if !showMyLists}
				<div class="space-y-3 rounded-lg border p-4">
					<div class="flex items-center gap-2">
						<Search class="h-4 w-4 text-gray-500" />
						<Label class="text-sm font-semibold">Search & Filter</Label>
					</div>

					<!-- Search Type Buttons -->
					<div class="flex flex-wrap items-center gap-2">
						<Label class="text-xs">Search by:</Label>
						{#each ['all', 'name', 'description', 'author', 'date'] as type}
							<Button
								variant={searchBy === type ? 'default' : 'outline'}
								size="sm"
								onclick={() => (searchBy = type)}
								class=""
								disabled={false}
							>
								{type.charAt(0).toUpperCase() + type.slice(1)}
							</Button>
						{/each}
					</div>

					<!-- Search Inputs -->
					{#if searchBy === 'date'}
						<div class="flex flex-col gap-3 sm:flex-row">
							<!-- From Date -->
							<div class="flex flex-1 flex-col gap-2">
								<Label for="date-from" class="text-xs">From Date</Label>
								<Popover.Root bind:open={dateFromOpen}>
									<Popover.Trigger id="date-from" class="">
										{#snippet child({ props })}
											<Button
												{...props}
												variant="outline"
												size="sm"
												class="w-full justify-start text-left font-normal"
											>
												<CalendarIcon class="mr-2 h-4 w-4" />
												{dateFromValue ? formatDate(dateFromValue) : 'Select start date'}
											</Button>
										{/snippet}
									</Popover.Trigger>
									<Popover.Content class="w-auto p-0" align="start" portalProps={{}}>
										<Calendar
											type="single"
											bind:value={dateFromValue}
											onValueChange={() => {
												dateFromOpen = false;
											}}
											class="rounded-lg border shadow-sm"
											months={[]}
											years={[]}
											monthFormat=""
											day={null}
										/>
									</Popover.Content>
								</Popover.Root>
							</div>

							<!-- To Date -->
							<div class="flex flex-1 flex-col gap-2">
								<Label for="date-to" class="text-xs">To Date</Label>
								<Popover.Root bind:open={dateToOpen}>
									<Popover.Trigger id="date-to" class="">
										{#snippet child({ props })}
											<Button
												{...props}
												variant="outline"
												size="sm"
												class="w-full justify-start text-left font-normal"
											>
												<CalendarIcon class="mr-2 h-4 w-4" />
												{dateToValue ? formatDate(dateToValue) : 'Select end date'}
											</Button>
										{/snippet}
									</Popover.Trigger>
									<Popover.Content class="w-auto p-0" align="start" portalProps={{}}>
										<Calendar
											type="single"
											bind:value={dateToValue}
											onValueChange={() => {
												dateToOpen = false;
											}}
											class="rounded-lg border shadow-sm"
											months={[]}
											years={[]}
											monthFormat=""
											day={null}
										/>
									</Popover.Content>
								</Popover.Root>
							</div>

							<!-- Apply Button -->
							<div class="flex items-end">
								<Button size="sm" onclick={applyFilters} class="" disabled={false}>Apply</Button>
							</div>
						</div>
					{:else}
						<div class="flex gap-2">
							<div class="flex-1">
								{#if searchBy === 'all'}
									<Input
										bind:value={searchQuery}
										placeholder="Search by name, description, or author..."
										onkeydown={(e) => e.key === 'Enter' && applyFilters()}
										type="text"
										class=""
									/>
								{:else if searchBy === 'name'}
									<Input
										bind:value={nameQuery}
										placeholder="Search by list name..."
										onkeydown={(e) => e.key === 'Enter' && applyFilters()}
										type="text"
										class=""
									/>
								{:else if searchBy === 'description'}
									<Input
										bind:value={descriptionQuery}
										placeholder="Search by description..."
										onkeydown={(e) => e.key === 'Enter' && applyFilters()}
										type="text"
										class=""
									/>
								{:else if searchBy === 'author'}
									<Input
										bind:value={authorQuery}
										placeholder="Search by author..."
										onkeydown={(e) => e.key === 'Enter' && applyFilters()}
										type="text"
										class=""
									/>
								{/if}
							</div>
							<Button size="sm" onclick={applyFilters} class="" disabled={false}>
								<Search class="mr-2 h-4 w-4" />
								Search
							</Button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Lists Display -->
			{#if isLoadingLists}
				<div class="py-8 text-center">
					<Loader2 class="mx-auto h-8 w-8 animate-spin text-gray-400" />
					<div class="mt-2 text-sm text-gray-600">Loading lists...</div>
				</div>
			{:else if listsError}
				<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
					<AlertCircle class="mr-2 inline h-4 w-4" />
					{listsError}
				</div>
			{:else if displayLists.length === 0}
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
					<div class="text-gray-600">
						{showMyLists ? 'No saved lists found' : 'No public lists found'}
					</div>
					<div class="mt-1 text-sm text-gray-500">
						{showMyLists
							? 'Create lists in the Song List Creator to use them here'
							: 'Try adjusting your search filters'}
					</div>
				</div>
			{:else}
				<div class="space-y-2">
					<Label class="text-sm font-medium">
						Select a List {selectedList
							? `(${selectedList.name} selected)`
							: '(none selected)'}
					</Label>
					<div class="max-h-96 space-y-2 overflow-y-auto overflow-x-hidden rounded-lg border p-3">
						{#each displayLists as list}
							<button
								type="button"
								class="flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-gray-50 overflow-hidden min-w-0"
								class:bg-blue-50={editedValue.selectedListId === list.id}
								class:border-blue-300={editedValue.selectedListId === list.id}
								onclick={() => selectList(list.id)}
							>
								<div
									class="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
									class:border-blue-500={editedValue.selectedListId === list.id}
									class:bg-blue-500={editedValue.selectedListId === list.id}
								>
									{#if editedValue.selectedListId === list.id}
										<div class="h-2 w-2 rounded-full bg-white"></div>
									{/if}
								</div>
								<div class="min-w-0 flex-1 overflow-hidden">
									<div class="flex items-center gap-2 flex-wrap min-w-0">
									<span 
										class="font-medium text-gray-900 break-all min-w-0"
										style="word-break: break-all; overflow-wrap: anywhere;"
									>
										{list.name}
									</span>
										{#if list.is_public !== undefined}
											{#if list.is_public}
												<Badge variant="default" class="text-xs shrink-0" href="">Public</Badge>
											{:else}
												<Badge variant="secondary" class="text-xs shrink-0" href="">Private</Badge>
											{/if}
										{/if}
									</div>
									{#if list.description}
										<div 
											class="mt-1 text-sm text-gray-600 break-all overflow-hidden"
											style="word-break: break-all; overflow-wrap: anywhere;"
										>
											{list.description}
										</div>
									{/if}
									<div class="mt-1 text-xs text-gray-500">
										{list.song_count || 0} songs
										{#if list.creator_username}
											• by {list.creator_username}
										{/if}
									</div>
								</div>
							</button>
						{/each}
					</div>

					<!-- Pagination (only for public lists) -->
					{#if !showMyLists && publicPagination.totalPages > 1}
						<div class="flex items-center justify-between pt-2">
							<div class="text-xs text-gray-600">
								Page {publicPagination.page} of {publicPagination.totalPages} ({publicPagination.total}
								total)
							</div>
							<div class="flex gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={publicPagination.page <= 1}
									onclick={() => changePage(publicPagination.page - 1)}
									class=""
								>
									Previous
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={publicPagination.page >= publicPagination.totalPages}
									onclick={() => changePage(publicPagination.page + 1)}
									class=""
								>
									Next
								</Button>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Provider Mode -->
	{#if editedValue.mode === 'provider'}
		<div class="space-y-4">
			<!-- Info Box -->
			<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
				<div class="flex items-start gap-3">
					<Info class="mt-0.5 h-5 w-5 text-blue-600" />
					<div class="space-y-2">
						<h4 class="font-medium text-blue-900">Provider Import Not Available Here</h4>
						<p class="text-sm text-blue-800">
							Provider files (AMQ exports, Joseph Song UI, etc.) can only be uploaded in the
							<strong>Song List Creator</strong>. Please follow these steps:
						</p>
						<ol class="ml-2 list-inside list-decimal space-y-1 text-sm text-blue-800">
							<li>Go to <strong>Song Lists → Create New List</strong></li>
							<li>Upload your provider JSON file there</li>
							<li>Save it as a custom list</li>
							<li>Return here and select your saved list</li>
						</ol>
						<div class="mt-3">
							<a
								href="/songlist/create"
								class="inline-flex items-center gap-2 text-sm font-medium text-blue-600 underline hover:text-blue-800"
							>
								<ExternalLink class="h-4 w-4" />
								Go to Song List Creator
							</a>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<Separator class="" />

	<!-- Use Entire Pool Option -->
	<div class="space-y-3">
		<div class="flex items-center space-x-2">
			<Checkbox
				bind:checked={editedValue.useEntirePool}
				onCheckedChange={handleUseEntirePoolChange}
				id="use-entire-pool"
				class=""
			/>
			<Label for="use-entire-pool" class="cursor-pointer font-semibold text-yellow-900">
				Use the entire pool - ignore all options
			</Label>
		</div>

		{#if editedValue.useEntirePool}
			<div class="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-4">
				<div class="flex items-start gap-3">
					<div class="text-2xl">⚠️</div>
					<div>
						<div class="font-semibold text-yellow-900">Warning: All Filters Bypassed</div>
						<div class="mt-1 text-sm text-yellow-800">
							When this option is enabled, ALL songs from this source will bypass ALL filters in the
							configuration. They will be added directly to the final song pool without any
							filtering applied.
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<Separator class="" />

	<!-- Node-level Percentage -->
	<div class="space-y-3">
		<Label for="song-percentage" class="text-base font-semibold">
			Node-level percentage (Optional)
		</Label>
		<div class="space-y-3">
			{#if editedValue.songPercentage}
				<!-- Random toggle and remove button -->
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-2">
						<Checkbox 
							id="song-percentage-random" 
							bind:checked={editedValue.songPercentage.random}
							onCheckedChange={() => validateAndAutoSave()}
							class=""
						/>
						<Label for="song-percentage-random" class="text-sm font-normal">
							Use random range
						</Label>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={false}
						onclick={() => {
							editedValue.songPercentage = null;
							validateAndAutoSave();
						}}
						class="text-xs"
					>
						Remove
					</Button>
				</div>
				
				{#if editedValue.songPercentage.random}
					<!-- Random range slider -->
					<div class="space-y-3">
						<div class="px-2">
							<RangeSlider
								values={[
									editedValue.songPercentage.min ?? 0,
									editedValue.songPercentage.max ?? 100
								]}
								min={0}
								max={100}
								step={1}
								range
								pushy
								pips
								pipstep={10}
								all="label"
								on:change={(e) => {
									editedValue.songPercentage.min = e.detail.values[0];
									editedValue.songPercentage.max = e.detail.values[1];
									validateAndAutoSave();
								}}
								--slider="#6366f1"
								--handle="#6366f1"
								--range="#6366f1"
							/>
						</div>
						<div class="flex items-center justify-center gap-2 text-sm">
							<Input
								class="h-8 w-16 text-center"
								type="number"
								min={0}
								max={100}
								value={editedValue.songPercentage.min ?? 0}
								oninput={(e) => {
									editedValue.songPercentage.min = Math.max(0, Math.min(100, Number(e.target.value) || 0));
									validateAndAutoSave();
								}}
							/>
							<span class="text-gray-600">to</span>
							<Input
								class="h-8 w-16 text-center"
								type="number"
								min={0}
								max={100}
								value={editedValue.songPercentage.max ?? 100}
								oninput={(e) => {
									editedValue.songPercentage.max = Math.max(0, Math.min(100, Number(e.target.value) || 100));
									validateAndAutoSave();
								}}
							/>
							<span class="text-gray-600">%</span>
						</div>
					</div>
				{:else}
					<!-- Static value slider -->
					<div class="space-y-3">
						<div class="px-2">
							<RangeSlider
								values={[editedValue.songPercentage.value ?? 0]}
								min={0}
								max={100}
								step={1}
								pips
								pipstep={25}
								all="label"
								on:change={(e) => {
									editedValue.songPercentage.value = e.detail.values[0];
									validateAndAutoSave();
								}}
								--slider="#6366f1"
								--handle="#6366f1"
								--range="#6366f1"
							/>
						</div>
						<div class="flex items-center justify-center gap-2 text-sm">
							<Input
								class="h-8 w-16 text-center"
								type="number"
								min={0}
								max={100}
								placeholder="0"
								value={editedValue.songPercentage.value ?? ''}
								oninput={(e) => {
									const val = e.target.value === '' ? null : Number(e.target.value);
									editedValue.songPercentage.value = val !== null ? Math.max(0, Math.min(100, val)) : null;
									validateAndAutoSave();
								}}
							/>
							<span class="text-gray-600">%</span>
						</div>
					</div>
				{/if}
			{:else}
				<!-- Initialize button -->
				<Button
					type="button"
					variant="outline"
					disabled={false}
					onclick={() => {
						editedValue.songPercentage = { value: null, random: false, min: 0, max: 100 };
						validateAndAutoSave();
					}}
					class="w-full"
				>
					Set Node-level percentage
				</Button>
			{/if}
			
			<p class="text-xs text-gray-600">
				Specify what percentage of the total songs should come from this list (0-100). 
				If any source list has a percentage set, all source lists must have percentages that sum to 100%.
			</p>
			<div class="rounded-lg border border-blue-200 bg-blue-50 p-3">
				<div class="flex items-start gap-2">
					<Info class="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
					<div class="text-xs text-blue-800">
						<strong>Example:</strong> If you have 2 Song Lists with 60% and 40%, and the quiz needs 20 songs,
						this list will contribute 12 songs (60% of 20) or 8 songs (40% of 20) respectively.
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Validation Error -->
	{#if !isValid && validationMessage}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
			<AlertCircle class="mr-2 inline h-4 w-4" />
			{validationMessage}
		</div>
	{/if}
</div>
