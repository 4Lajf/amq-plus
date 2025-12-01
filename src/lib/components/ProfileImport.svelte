<script>
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { User, Loader2, RefreshCw } from 'lucide-svelte';
	import { importUserList } from '$lib/components/amqplus/editor/utils/songListUtils.js';
	import { batchFetchAnimeMetadataByAnilistIds } from '$lib/utils/anilist.js';

	/**
	 * @typedef {Object} SelectedLists
	 * @property {boolean} completed - Completed list selected
	 * @property {boolean} watching - Watching list selected
	 * @property {boolean} planning - Planning list selected
	 * @property {boolean} on_hold - On hold list selected
	 * @property {boolean} dropped - Dropped list selected
	 */

	/**
	 * @typedef {Object} ConfigData
	 * @property {'anilist'|'mal'} platform - Platform name
	 * @property {string} username - Username
	 * @property {SelectedLists} selectedLists - Selected list states
	 */

	/**
	 * @typedef {Object} ImportResult
	 * @property {any[]} animeList - Array of anime items
	 * @property {any[]} songsList - Array of songs
	 * @property {any} cacheInfo - Cache information
	 */

	/**
	 * Component props
	 * @type {{
	 *   disabled: boolean,
	 *   onImportComplete: (result: ImportResult) => void,
	 *   onImportError: (error: Error) => void,
	 *   onConfigChange: (config: ConfigData) => void,
	 *   showTitle: boolean,
	 *   initialPlatform: 'anilist'|'mal',
	 *   initialUsername: string,
	 *   initialSelectedLists: SelectedLists
	 * }}
	 */
	let {
		disabled = false,
		onImportComplete = () => {},
		onImportError = () => {},
		onConfigChange = () => {},
		showTitle = true,
		initialPlatform = 'anilist',
		initialUsername = '',
		initialSelectedLists = {
			completed: true,
			watching: true,
			planning: false,
			on_hold: false,
			dropped: false
		}
	} = $props();

	// Profile import state - initialized from props
	let profileUsername = $state(initialUsername);
	let profileType = $state(initialPlatform);
	let isImporting = $state(false);
	let importError = $state(null);
	let importProgress = $state({ eta: 0 });
	/** @type {{completed: boolean, watching: boolean, planning: boolean, on_hold: boolean, dropped: boolean}} */
	let selectedLists = $state({
		completed: initialSelectedLists.completed,
		watching: initialSelectedLists.watching,
		planning: initialSelectedLists.planning,
		on_hold: initialSelectedLists.on_hold,
		dropped: initialSelectedLists.dropped
	});
	let cacheInfo = $state(null);

	// Sync props when they change (only on mount or when external props change)
	let initialized = $state(false);
	$effect(() => {
		if (!initialized) {
			// Only sync on initial mount
			profileUsername = initialUsername;
			profileType = initialPlatform;
			selectedLists = {
				completed: initialSelectedLists.completed,
				watching: initialSelectedLists.watching,
				planning: initialSelectedLists.planning,
				on_hold: initialSelectedLists.on_hold,
				dropped: initialSelectedLists.dropped
			};
			initialized = true;
		}
	});

	// Helper function to emit config changes
	function emitConfigChange() {
		onConfigChange({
			platform: profileType,
			username: profileUsername,
			selectedLists: {
				completed: selectedLists.completed,
				watching: selectedLists.watching,
				planning: selectedLists.planning,
				on_hold: selectedLists.on_hold,
				dropped: selectedLists.dropped
			}
		});
	}

	// Profile type options
	const profileTypes = [
		{ value: 'anilist', label: 'AniList' },
		{ value: 'mal', label: 'MyAnimeList' }
	];

	// Derived content for profile type select trigger
	const profileTypeTriggerContent = $derived(
		profileTypes.find((p) => p.value === profileType)?.label ?? 'Select profile type'
	);

	/**
	 * Format ETA seconds into human-readable format
	 * @param {number} seconds - Number of seconds
	 * @returns {string} Formatted ETA string
	 */
	function formatETA(seconds) {
		if (seconds <= 0) return '0s';

		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const remainingSeconds = Math.floor(seconds % 60);

		let etaString = '';
		if (hours > 0) {
			etaString += `${hours}h `;
		}
		if (minutes > 0) {
			etaString += `${minutes}m `;
		}
		if (remainingSeconds > 0 || (hours === 0 && minutes === 0)) {
			etaString += `${remainingSeconds}s`;
		}

		return etaString.trim();
	}

	/**
	 * Import songs from user profile
	 * @param {boolean} [forceRefresh=false] - Force refresh of cached data
	 * @returns {Promise<void>}
	 */
	async function importFromProfile(forceRefresh = false) {
		if (!profileUsername.trim()) {
			importError = 'Please enter a username';
			return;
		}

		isImporting = true;
		importError = null;

		try {
			if (forceRefresh) {
				console.log('Clearing cache and refreshing from API...');
			} else {
				console.log(
					`Started importing from ${profileType === 'anilist' ? 'AniList' : 'MyAnimeList'}...`
				);
			}

			// Use the unified importUserList function
			const result = await importUserList(
				profileType,
				profileUsername.trim(),
				selectedLists,
				forceRefresh,
				(eta) => {
					importProgress = { eta };
				}
			);

			// For MAL imports, enrich with AniList metadata using AniList IDs from anisongdb
			if (profileType === 'mal' && result.songsList.length > 0) {
				// Extract unique AniList IDs from the songs' linked_ids
				const anilistIdsFromSongs = [
					...new Set(result.songsList.map((song) => song.linked_ids?.anilist).filter(Boolean))
				];

				if (anilistIdsFromSongs.length > 0) {
					console.log(
						`Found ${anilistIdsFromSongs.length} unique AniList IDs from ${result.songsList.length} songs`
					);

					// Progress callback for AniList enrichment
					const onEnrichmentProgress = (current, total, eta) => {
						importProgress = { eta };
					};

					// Fetch AniList metadata using AniList IDs (not MAL IDs)
					const anilistMetadataMap = await batchFetchAnimeMetadataByAnilistIds(
						anilistIdsFromSongs,
						onEnrichmentProgress
					);

					// Create a map of MAL ID -> AniList metadata
					// by using the anilistMetadata.idMal field
					const malToAnilistMap = new Map();
					for (const [anilistId, metadata] of anilistMetadataMap.entries()) {
						if (metadata.idMal) {
							malToAnilistMap.set(metadata.idMal, metadata);
						}
					}

					// Enrich the anime list with AniList metadata
					result.animeList = result.animeList.map((anime) => {
						const anilistData = malToAnilistMap.get(anime.malId);
						if (anilistData) {
							return {
								...anime,
								anilistId: anilistData.id,
								format: anilistData.format || anime.format,
								mediaStatus: anilistData.status,
								startDate: anilistData.startDate,
								duration: anilistData.duration,
								source: anilistData.source,
								genres: anilistData.genres || anime.genres,
								tags: (anilistData.tags || []).map((tag) => ({
									name: tag.name,
									rank: tag.rank
								})),
								averageScore: anilistData.averageScore || anime.averageScore,
								popularity: anilistData.popularity || anime.popularity,
								favourites: anilistData.favourites || anime.favourites
							};
						}
						return anime;
					});

					importProgress = { eta: 0 };
				}
			}

			cacheInfo = result.cacheInfo;
			importProgress = { eta: 0 };

			// Call the completion callback with the result
			onImportComplete(result);
		} catch (error) {
			console.error('Error importing profile:', error);
			importError = error.message;
			onImportError(error);
		} finally {
			isImporting = false;
		}
	}
</script>

<Card class="">
	{#if showTitle}
		<CardHeader class="">
			<CardTitle class="flex items-center gap-2">
				<User class="h-5 w-5" />
				Import from Profile
			</CardTitle>
			<CardDescription class="">Import songs from AniList or MyAnimeList profile</CardDescription>
		</CardHeader>
	{/if}
	<CardContent class="space-y-4">
		<div class="grid grid-cols-2 gap-4">
			<div>
				<Label class="">Profile Type</Label>
				<Select
					value={profileType}
					onValueChange={(val) => {
						profileType = /** @type {'anilist'|'mal'} */ (val);
						emitConfigChange();
					}}
					{disabled}
					type="single"
				>
					<SelectTrigger class="w-full">
						{profileTypeTriggerContent}
					</SelectTrigger>
					<SelectContent class="" portalProps={{}}>
						{#each profileTypes as type (type.value)}
							<SelectItem value={type.value} label={type.label} class="">
								{type.label}
							</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
			<div>
				<Label class="">Username</Label>
				<Input
					bind:value={profileUsername}
					placeholder="Enter username..."
					onkeydown={(e) => e.key === 'Enter' && importFromProfile()}
					onchange={() => emitConfigChange()}
					{disabled}
					type="text"
					class=""
				/>
			</div>
		</div>

		<div>
			<Label class="text-sm font-medium">List Types to Import</Label>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each Object.entries(selectedLists) as [status, checked]}
					<label class="flex items-center space-x-2">
						<Checkbox
							checked={selectedLists[status]}
							onCheckedChange={(checked) => {
								selectedLists[status] = checked;
								emitConfigChange();
							}}
							{disabled}
							class=""
						/>
						<span class="text-sm capitalize">{status.replace('_', ' ')}</span>
					</label>
				{/each}
			</div>
		</div>

		<div class="flex gap-2">
			<Button
				onclick={() => importFromProfile(false)}
				disabled={isImporting || disabled}
				class="flex-1"
			>
				{#if isImporting}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					Importing...
					{#if importProgress.eta > 0}
						(ETA: {formatETA(importProgress.eta)})
					{/if}
				{:else}
					Import from {profileType === 'anilist' ? 'AniList' : 'MyAnimeList'}
				{/if}
			</Button>

			{#if cacheInfo && cacheInfo.cached}
				<Button
					onclick={() => importFromProfile(true)}
					disabled={isImporting || disabled}
					variant="outline"
					class="px-3"
					title="Refresh from API (bypass cache)"
				>
					<RefreshCw class="h-4 w-4" />
				</Button>
			{/if}
		</div>

		{#if cacheInfo}
			<div class="text-muted-foreground text-xs">
				{#if cacheInfo.cached}
					{#if cacheInfo.cachedStatuses && cacheInfo.cachedStatuses.length > 0}
						✓ Cached: {cacheInfo.cachedStatuses.join(', ')}
					{:else}
						✓ Using cached data (24h cache)
					{/if}
					{#if cacheInfo.uncachedStatuses && cacheInfo.uncachedStatuses.length > 0}
						<br />
						⚠ Fetched fresh: {cacheInfo.uncachedStatuses.join(', ')}
					{/if}
				{:else if cacheInfo.expiresAt}
					✓ Fresh data cached until {new Date(cacheInfo.expiresAt).toLocaleString()}
				{/if}
			</div>
		{/if}

		{#if importError}
			<div class="text-sm text-red-600">{importError}</div>
		{/if}
	</CardContent>
</Card>
