<script>
	import { untrack } from 'svelte';
	import {
		updateSourceAt,
		updateNegativeSourceAt,
		removeSource,
		removeNegativeSource
	} from './editor2State.svelte.js';
	import { fetchSavedLists, fetchPublicLists } from '$lib/utils/songListUtils.js';
	import { createDebouncedLatest } from '$lib/utils/debouncedLatest.js';
	import { BATCH_USER_LIST_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';

	/**
	 * @type {{ route: any, isNegative?: boolean, sourceIndex?: number }}
	 */
	let { route, isNegative = false, sourceIndex = 0 } = $props();

	let expanded = $state(false);
	let savedLists = $state([]);
	let publicLists = $state([]);
	let publicPagination = $state({ page: 1, limit: 8, total: 0, totalPages: 0 });
	let isLoadingLists = $state(false);
	let listsError = $state('');
	let showMyLists = $state(true);
	let searchQuery = $state('');
	let lastListLoadKey = $state('');
	let listLoadGeneration = 0;
	/** @type {AbortController | null} */
	let listLoadController = null;

	// W15: quiz-as-a-source.
	let myQuizzes = $state([]);
	let isLoadingQuizzes = $state(false);
	let quizzesError = $state('');
	let lastQuizLoadKey = $state('');

	let source = $derived.by(() => {
		if (isNegative) {
			const negatives = Array.isArray(route.negativeSources)
				? route.negativeSources
				: [route.negativeSource].filter(Boolean);
			return negatives[sourceIndex] || null;
		}
		const sources = Array.isArray(route.sources) ? route.sources : [route.source].filter(Boolean);
		return sources[sourceIndex] || null;
	});

	let sourceType = $derived(source?.sourceType || (isNegative ? 'negative-song-list' : 'song-list'));
	let color = $derived(
		isNegative ? '#f97316'
			: sourceType === 'batch-user-list' ? '#8b5cf6'
			: '#3b82f6'
	);
	let icon = $derived(
		isNegative ? '🚫'
			: sourceType === 'batch-user-list' ? '👥'
			: '📋'
	);
	let title = $derived(
		isNegative ? `Negative Source ${sourceIndex + 1}`
			: sourceType === 'batch-user-list' ? `Batch User Source ${sourceIndex + 1}`
			: `Song Source ${sourceIndex + 1}`
	);

	let modeDisplay = $derived.by(() => {
		if (!source) return 'Not configured';
		if (sourceType === 'batch-user-list') {
			const users = Array.isArray(source.userEntries)
				? source.userEntries.filter((u) => u.username?.trim()).length
				: 0;
			return source.mode === 'live' ? 'Live Sync' : `${users || 0} user${users === 1 ? '' : 's'}`;
		}
		switch (source.mode) {
			case 'masterlist': return 'Entire Database';
			case 'user-lists': {
				const u = source.userListImport?.username;
				const p = source.userListImport?.platform || 'anilist';
				return u ? `${u} (${p})` : 'User List';
			}
			case 'saved-lists': return source.selectedListName || 'Saved List';
			case 'quiz': return source.selectedQuizName || 'Quiz';
			case 'provider': return `Provider (${source.providerImport?.providerType || 'amq-export'})`;
			default: return 'Unknown';
		}
	});

	function setMode(mode) {
		const updated = JSON.parse(JSON.stringify(source));
		updated.mode = mode;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	const displayLists = $derived(showMyLists ? savedLists : publicLists);

	function getListLoadKey(page = 1) {
		return `${route.id}|${isNegative ? 'neg' : 'src'}|${sourceIndex}|${source?.mode}|${showMyLists ? 'mine' : 'public'}|${searchQuery.trim()}|${page}`;
	}

	async function loadLists(page = 1, force = false, signal) {
		const loadKey = getListLoadKey(page);
		if (!force && lastListLoadKey === loadKey) return;
		lastListLoadKey = loadKey;

		const gen = ++listLoadGeneration;
		listLoadController?.abort();
		listLoadController = new AbortController();
		const localSignal = listLoadController.signal;
		if (signal) {
			if (signal.aborted) localSignal.abort();
			else signal.addEventListener('abort', () => localSignal.abort(), { once: true });
		}
		signal = localSignal;

		const keepVisible = showMyLists ? savedLists.length > 0 : publicLists.length > 0;
		if (!keepVisible) isLoadingLists = true;
		listsError = '';
		try {
			if (showMyLists) {
				savedLists = await fetchSavedLists();
			} else {
				const filters = { page, limit: 8 };
				if (searchQuery.trim()) filters.search = searchQuery.trim();
				const result = await fetchPublicLists(filters, signal);
				if (gen !== listLoadGeneration || signal.aborted) return;
				publicLists = result?.lists || [];
				publicPagination = result?.pagination || { page: 1, limit: 8, total: 0, totalPages: 0 };
			}
		} catch (error) {
			if (error?.name === 'AbortError' || gen !== listLoadGeneration) return;
			listsError = error?.message || 'Failed to load lists';
			if (showMyLists) savedLists = [];
			else publicLists = [];
		} finally {
			if (gen === listLoadGeneration) isLoadingLists = false;
		}
	}

	const debouncedPublicSearch = createDebouncedLatest(async (_query, signal) => {
		await loadLists(1, true, signal);
	}, 250);

	function onPublicSearchInput(event) {
		searchQuery = event.currentTarget.value;
		debouncedPublicSearch(searchQuery);
	}

	function submitPublicSearch() {
		debouncedPublicSearch.cancel();
		loadLists(1, true);
	}

	function selectSavedList(list) {
		const updated = JSON.parse(JSON.stringify(source));
		updated.selectedListId = list.id;
		updated.selectedListName = list.name;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function setUsername(value) {
		const updated = JSON.parse(JSON.stringify(source));
		updated.userListImport.username = value;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function setPlatform(value) {
		const updated = JSON.parse(JSON.stringify(source));
		updated.userListImport.platform = value;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function toggleList(listKey) {
		const updated = JSON.parse(JSON.stringify(source));
		updated.userListImport.selectedLists[listKey] = !updated.userListImport.selectedLists[listKey];
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function toggleEntirePool() {
		const updated = JSON.parse(JSON.stringify(source));
		updated.useEntirePool = !updated.useEntirePool;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function ensureSongPercentageConfig(updated) {
		if (!updated.songPercentage || typeof updated.songPercentage !== 'object') {
			updated.songPercentage = { value: null, random: false, min: 0, max: 100 };
		} else {
			if (updated.songPercentage.random === undefined) updated.songPercentage.random = false;
			if (updated.songPercentage.min === undefined) updated.songPercentage.min = 0;
			if (updated.songPercentage.max === undefined) updated.songPercentage.max = 100;
			if (updated.songPercentage.value === undefined) updated.songPercentage.value = null;
		}
	}

	function setSongPercentageEnabled(enabled) {
		const updated = JSON.parse(JSON.stringify(source));
		if (enabled) ensureSongPercentageConfig(updated);
		else updated.songPercentage = null;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function setSongPercentageRandom(random) {
		const updated = JSON.parse(JSON.stringify(source));
		ensureSongPercentageConfig(updated);
		updated.songPercentage.random = random;
		if (!random && updated.songPercentage.value === null) {
			updated.songPercentage.value = updated.songPercentage.min ?? 0;
		}
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function setSongPercentageField(field, value) {
		const updated = JSON.parse(JSON.stringify(source));
		ensureSongPercentageConfig(updated);
		const v = Math.max(0, Math.min(100, Number(value) || 0));
		if (field === 'min') {
			updated.songPercentage.min = v;
			if ((updated.songPercentage.max ?? 100) < v) updated.songPercentage.max = v;
		} else if (field === 'max') {
			updated.songPercentage.max = v;
			if ((updated.songPercentage.min ?? 0) > v) updated.songPercentage.min = v;
		} else if (field === 'value') {
			updated.songPercentage.value = v;
		}
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function setBatchMode(mode) {
		const updated = JSON.parse(JSON.stringify(source));
		updated.mode = mode;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function setBatchUsername(index, value) {
		const updated = JSON.parse(JSON.stringify(source));
		if (!Array.isArray(updated.userEntries) || !updated.userEntries[index]) return;
		updated.userEntries[index].username = value;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function setBatchPlatform(index, value) {
		const updated = JSON.parse(JSON.stringify(source));
		if (!Array.isArray(updated.userEntries) || !updated.userEntries[index]) return;
		updated.userEntries[index].platform = value;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function toggleBatchList(index, listKey) {
		const updated = JSON.parse(JSON.stringify(source));
		if (!Array.isArray(updated.userEntries) || !updated.userEntries[index]) return;
		updated.userEntries[index].selectedLists[listKey] = !updated.userEntries[index].selectedLists[listKey];
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function addBatchUser() {
		const updated = JSON.parse(JSON.stringify(source));
		const entry = structuredClone(BATCH_USER_LIST_DEFAULT_SETTINGS.userEntries[0]);
		entry.id = crypto.randomUUID();
		updated.userEntries = [...(updated.userEntries || []), entry];
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function removeBatchUser(index) {
		const updated = JSON.parse(JSON.stringify(source));
		updated.userEntries.splice(index, 1);
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function setMinSharedUsers(value) {
		const updated = JSON.parse(JSON.stringify(source));
		updated.minSharedUsers = Math.max(0, parseInt(value, 10) || 0);
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	function removeCurrentSource(e) {
		e.stopPropagation();
		if (isNegative) removeNegativeSource(route.id, sourceIndex);
		else removeSource(route.id, sourceIndex);
	}

	function gridReveal(node, { duration = 260 } = {}) {
		return {
			duration,
			easing: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
			css: (t) => `display:grid;grid-template-rows:${t}fr;overflow:hidden`
		};
	}

	$effect(() => {
		if (!expanded || sourceType === 'batch-user-list' || source?.mode !== 'saved-lists') return;
		// searchQuery is read inside loadLists. Untrack it so each keystroke
		// does not fire a request — typing goes through debouncedPublicSearch.
		untrack(() => {
			loadLists(1, false);
		});
	});

	$effect(() => {
		return () => {
			debouncedPublicSearch.cancel();
			listLoadController?.abort();
		};
	});

	async function loadMyQuizzes() {
		const key = `${route.id}|${isNegative ? 'neg' : 'src'}|${sourceIndex}`;
		if (lastQuizLoadKey === key) return;
		lastQuizLoadKey = key;
		isLoadingQuizzes = true;
		quizzesError = '';
		try {
			// Returns the signed-in user's own quizzes only.
			const res = await fetch('/api/quiz-configurations');
			if (!res.ok) throw new Error(`Request failed (${res.status})`);
			const data = await res.json();
			myQuizzes = data.data || [];
		} catch (e) {
			quizzesError = e instanceof Error ? e.message : 'Could not load your quizzes.';
		} finally {
			isLoadingQuizzes = false;
		}
	}

	function selectQuiz(quiz) {
		const updated = JSON.parse(JSON.stringify(source));
		updated.selectedQuizId = quiz.id;
		updated.selectedQuizName = quiz.name;
		if (isNegative) updateNegativeSourceAt(route.id, sourceIndex, updated);
		else updateSourceAt(route.id, sourceIndex, updated);
	}

	$effect(() => {
		if (expanded && sourceType !== 'batch-user-list' && source?.mode === 'quiz') {
			loadMyQuizzes();
		}
	});
</script>

<div class="source-line border-b border-ed-border" style="--accent: {color}" role="group" aria-label={title}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="source-bar" role="button" aria-label={`${title}: ${modeDisplay}`} aria-expanded={expanded} tabindex="0" onclick={() => expanded = !expanded} onkeydown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); expanded = !expanded; } }}>
		<div class="source-accent"></div>
		<span class="text-[13px] ml-2 shrink-0">{icon}</span>
		<span class="font-dm text-xs font-semibold text-ed-fg shrink-0">{title}</span>
		<span class="font-jb text-[11px] text-ed-fg-subtle ml-1 truncate flex-1">{modeDisplay}</span>
		{#if source?.useEntirePool}
			<span class="font-jb text-[9px] font-bold text-amber-500 bg-amber-500/9 border border-amber-500/27 px-1.5 py-px rounded-[3px] tracking-[0.5px] shrink-0">BYPASS</span>
		{/if}
		<span class="flex items-center gap-1 mr-3 shrink-0">
			<button aria-label={`Remove ${title.toLowerCase()}`} class="flex items-center justify-center size-5 text-sm bg-transparent border-none rounded-[3px] cursor-pointer text-ed-fg-subtle transition-all duration-120 hover:text-ed-red hover:bg-ed-red/13" onclick={removeCurrentSource}>×</button>
			<span class="text-xs text-ed-fg-subtle leading-none transition-transform duration-200 {expanded ? 'rotate-180' : ''}">▾</span>
		</span>
	</div>

	{#if expanded && source}
		<div transition:gridReveal>
		<div class="source-expanded">
			<!-- Mode selector -->
			{#if sourceType === 'batch-user-list'}
				<div class="flex items-center gap-2.5">
					<span class="font-dm text-[11px] font-medium text-ed-fg-subtle w-[50px] shrink-0">Mode</span>
					<div class="flex gap-1">
						<button class="mode-btn" class:active={source.mode === 'manual'} onclick={() => setBatchMode('manual')}>Manual</button>
						<button class="mode-btn" class:active={source.mode === 'live'} onclick={() => setBatchMode('live')}>Live</button>
					</div>
				</div>
			{:else}
				<div class="flex items-center gap-2.5">
					<span class="font-dm text-[11px] font-medium text-ed-fg-subtle w-[50px] shrink-0">Source</span>
					<div class="flex gap-1">
						{#each [
							{ id: 'masterlist', label: 'Database' },
							{ id: 'user-lists', label: 'User List' },
							{ id: 'saved-lists', label: 'Saved List' },
							{ id: 'quiz', label: 'Quiz' },
							{ id: 'provider', label: 'Provider' }
						] as m}
							<button class="mode-btn" class:active={source.mode === m.id} onclick={() => setMode(m.id)}>{m.label}</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- User list config -->
			{#if sourceType === 'batch-user-list' && source.mode === 'manual'}
				<div class="batch-user-fields flex min-w-0 flex-col gap-3 sm:pl-[60px]">
					{#each source.userEntries || [] as entry, index (entry.id ?? index)}
						<fieldset class="min-w-0 rounded border border-ed-border p-3">
							<legend class="cfg-label px-1">User {index + 1}</legend>
							<div class="flex min-w-0 flex-col gap-2">
								<label class="batch-user-field">Platform
									<select class="cfg-select" aria-label={`User ${index + 1} platform`} value={entry.platform || 'anilist'} onchange={(e) => setBatchPlatform(index, e.currentTarget.value)}>
										<option value="anilist">AniList</option>
										<option value="mal">MyAnimeList</option>
									</select>
								</label>
								<label class="batch-user-field">Username
									<input class="cfg-input min-w-0 w-full" type="text" aria-label={`User ${index + 1} username`} value={entry.username || ''} placeholder="Enter username..." oninput={(e) => setBatchUsername(index, e.currentTarget.value)} />
								</label>
								<div class="flex flex-wrap gap-1">
									{#each Object.entries(entry.selectedLists || {}) as [key, val]}
										<button class="list-toggle" aria-label={`User ${index + 1} ${key.replace('_', ' ')} list`} aria-pressed={val} class:active={val} onclick={() => toggleBatchList(index, key)}>{key.replace('_', ' ')}</button>
									{/each}
								</div>
								<button class="mode-btn self-start" aria-label={`Remove user ${index + 1}`} onclick={() => removeBatchUser(index)}>Remove user</button>
							</div>
						</fieldset>
					{/each}
					<button class="mode-btn self-start" onclick={addBatchUser}>Add user</button>
				</div>
			{/if}

		{#if sourceType === 'batch-user-list'}
			<div class="pl-[60px] flex flex-col gap-1.5">
				<div class="flex items-center gap-2">
					<span class="cfg-label">Min Shared</span>
					<input class="cfg-input w-16" type="number" aria-label="Minimum shared users" min="0" step="1" value={source.minSharedUsers ?? 0} oninput={(e) => setMinSharedUsers(e.currentTarget.value)} />
					<span class="font-dm text-[11px] text-ed-fg-subtle">users</span>
				</div>
				<p class="font-dm text-[11px] text-ed-fg-subtle italic">
					Songs appearing on at least this many user lists get top priority. 0 = no prioritization (random).
				</p>
			</div>
		{/if}

			{#if sourceType === 'batch-user-list' && source.mode === 'live'}
				<div class="pl-[60px]">
					<p class="font-dm text-[11px] text-ed-fg-subtle italic">
						Live mode syncs player lists from the AMQ lobby through AMQ+ Connector. User entries are managed in-game and mirrored here.
					</p>
				</div>
			{/if}

			{#if sourceType !== 'batch-user-list' && source.mode === 'user-lists'}
				<div class="pl-[60px] flex flex-col gap-1.5">
					<div class="flex items-center gap-2">
						<span class="cfg-label">Platform</span>
						<select class="cfg-select" value={source.userListImport.platform} onchange={(e) => setPlatform(e.currentTarget.value)}>
							<option value="anilist">AniList</option>
							<option value="mal">MyAnimeList</option>
						</select>
					</div>
					<div class="flex items-center gap-2">
						<span class="cfg-label">Username</span>
						<input class="cfg-input" type="text" value={source.userListImport.username} placeholder="Enter username..." oninput={(e) => setUsername(e.currentTarget.value)} />
					</div>
					<div class="flex items-start gap-2">
						<span class="cfg-label">Lists</span>
						<div class="flex flex-wrap gap-1">
							{#each Object.entries(source.userListImport.selectedLists) as [key, val]}
								<button class="list-toggle" class:active={val} onclick={() => toggleList(key)}>{key.replace('_', ' ')}</button>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			{#if sourceType !== 'batch-user-list' && source.mode === 'masterlist'}
				<div class="pl-[60px]">
					<p class="font-dm text-[11px] text-ed-fg-subtle italic">Uses the entire AMQ song database as the source pool.</p>
				</div>
			{/if}

			{#if sourceType !== 'batch-user-list' && source.mode === 'quiz'}
				<div class="pl-[60px] flex flex-col gap-1.5">
					<p class="font-dm text-[11px] text-ed-fg-subtle italic m-0">
						Uses another quiz's filters as this source. Unlike a saved list, this is a
						<strong>rule, not a snapshot</strong> — the other quiz is re-resolved every time this
						one generates, so editing it changes this quiz too.
					</p>

					{#if isLoadingQuizzes}
						<div class="font-dm text-[11px] text-ed-fg-subtle border border-ed-border-muted bg-ed-canvas-default rounded-sm p-2">Loading your quizzes...</div>
					{:else if quizzesError}
						<div class="font-dm text-[11px] text-ed-red border border-ed-red/27 bg-ed-red/7 rounded-sm p-2">{quizzesError}</div>
					{:else if myQuizzes.length === 0}
						<div class="font-dm text-[11px] text-ed-fg-subtle border border-ed-border-muted bg-ed-canvas-default rounded-sm p-2">You have no other quizzes yet.</div>
					{:else}
						<div class="flex flex-col gap-1.5 max-h-[260px] overflow-auto pr-0.5">
							{#each myQuizzes as quiz}
								<button
									class="scope-btn text-left"
									class:active={source.selectedQuizId === quiz.id}
									onclick={() => selectQuiz(quiz)}
								>
									{quiz.name}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#if sourceType !== 'batch-user-list' && source.mode === 'saved-lists'}
				<div class="pl-[60px] flex flex-col gap-1.5">
					<div class="flex gap-1.5">
						<button class="scope-btn" class:active={showMyLists} onclick={() => { showMyLists = true; loadLists(1, true); }}>My Lists</button>
						<button class="scope-btn" class:active={!showMyLists} onclick={() => { showMyLists = false; loadLists(1, true); }}>Public Lists</button>
					</div>

					{#if !showMyLists}
						<div class="flex gap-1.5">
							<input class="cfg-input max-w-[260px]" type="text" value={searchQuery} placeholder="Search public lists..." oninput={onPublicSearchInput} onkeydown={(e) => { if (e.key === 'Enter') submitPublicSearch(); }} />
							<button class="scope-btn text-[10px] px-[7px] py-[3px]" onclick={submitPublicSearch}>Search</button>
						</div>
					{/if}

					{#if isLoadingLists}
						<div class="font-dm text-[11px] text-ed-fg-subtle border border-ed-border-muted bg-ed-canvas-default rounded-sm p-2">Loading lists...</div>
					{:else if listsError}
						<div class="font-dm text-[11px] text-ed-red border border-ed-red/27 bg-ed-red/7 rounded-sm p-2">{listsError}</div>
					{:else if displayLists.length === 0}
						<div class="font-dm text-[11px] text-ed-fg-subtle border border-ed-border-muted bg-ed-canvas-default rounded-sm p-2">
							{showMyLists ? 'No saved lists found.' : 'No public lists match your filters.'}
						</div>
					{:else}
						<div class="flex flex-col gap-1.5 max-h-[260px] overflow-auto pr-0.5">
							{#each displayLists as list}
								<button
									class="saved-list-item"
									class:selected={source.selectedListId === list.id}
									onclick={() => selectSavedList(list)}
									title={list.name}
								>
									<div class="min-w-0">
										<div class="font-dm text-xs font-semibold text-ed-fg break-all">{list.name}</div>
										{#if list.description}
											<div class="mt-0.5 font-dm text-[11px] text-ed-fg-subtle break-all">{list.description}</div>
										{/if}
									</div>
									<div class="flex flex-wrap gap-2 font-jb text-[10px] text-ed-fg-subtle">
										<span>{list.song_count || 0} songs</span>
										{#if list.creator_username}
											<span>by {list.creator_username}</span>
										{/if}
									</div>
								</button>
							{/each}
						</div>

						{#if !showMyLists && publicPagination.totalPages > 1}
							<div class="flex items-center justify-between gap-2">
								<span class="font-jb text-[10px] text-ed-fg-subtle">Page {publicPagination.page}/{publicPagination.totalPages}</span>
								<div class="flex gap-1.5">
									<button class="scope-btn text-[10px] px-[7px] py-[3px]" disabled={publicPagination.page <= 1} onclick={() => loadLists(publicPagination.page - 1, true)}>Prev</button>
									<button class="scope-btn text-[10px] px-[7px] py-[3px]" disabled={publicPagination.page >= publicPagination.totalPages} onclick={() => loadLists(publicPagination.page + 1, true)}>Next</button>
								</div>
							</div>
						{/if}
					{/if}
				</div>
			{/if}

			{#if sourceType !== 'batch-user-list' && source.mode === 'provider'}
				<div class="pl-[60px] flex flex-col gap-1.5">
					<p class="font-dm text-[11px] text-ed-fg-subtle italic">
						Provider upload is handled in Song List Creator: create a list there, upload your provider JSON, save it, then pick that saved list here.
					</p>
					<a class="font-dm text-[11px] text-ed-blue underline hover:text-ed-blue-bright" href="/songlist/create">Go to Song List Creator</a>
				</div>
			{/if}

			<div class="pl-[60px] flex flex-col gap-1.5">
				<div class="flex items-center gap-2">
					<span class="cfg-label">Song %</span>
					<div class="flex flex-wrap gap-1">
						<button class="list-toggle" class:active={!!source.songPercentage} onclick={() => setSongPercentageEnabled(!source.songPercentage)}>
							{source.songPercentage ? 'Enabled' : 'Disabled'}
						</button>
						{#if source.songPercentage}
							<button class="list-toggle" class:active={source.songPercentage.random} onclick={() => setSongPercentageRandom(!source.songPercentage.random)}>Range</button>
						{/if}
					</div>
				</div>
				{#if source.songPercentage}
					<div class="flex items-center gap-2">
						<span class="cfg-label">Value</span>
						<div class="inline-flex items-center gap-1.5">
							<input class="cfg-input w-[68px] max-w-[68px] text-center" type="number" min="0" max="100"
								value={source.songPercentage.random ? (source.songPercentage.min ?? 0) : (source.songPercentage.value ?? 0)}
								oninput={(e) => setSongPercentageField(source.songPercentage.random ? 'min' : 'value', e.currentTarget.value)} />
							<span class="font-jb text-[11px] text-ed-fg-subtle">-</span>
							<input class="cfg-input w-[68px] max-w-[68px] text-center" type="number" min="0" max="100"
								disabled={!source.songPercentage.random}
								value={source.songPercentage.random ? (source.songPercentage.max ?? 100) : (source.songPercentage.value ?? 0)}
								oninput={(e) => setSongPercentageField('max', e.currentTarget.value)} />
							<span class="font-jb text-[11px] text-ed-fg-subtle">%</span>
						</div>
					</div>
					<p class="font-dm text-[11px] text-ed-fg-subtle italic">
						If multiple sources use Song %, their totals should sum to 100%.
					</p>
				{/if}
			</div>

			<!-- Bypass toggle -->
			<div class="pl-[60px]">
				<button
					class="inline-flex items-center gap-1.5 font-dm text-[11px] font-medium px-2.5 py-1 rounded-[5px] border cursor-pointer transition-all duration-150 {source.useEntirePool ? 'text-amber-500 border-amber-500/33 bg-amber-500/7' : 'text-ed-fg-subtle bg-ed-border border-ed-border-muted hover:bg-ed-border-muted'}"
					onclick={toggleEntirePool}
				>
					<span class="text-[11px] w-3 text-center">{source.useEntirePool ? '✓' : ''}</span>
					Bypass all filters (use entire pool)
				</button>
			</div>
		</div>
		</div>
	{/if}
</div>

<style>
	/* Source bar uses color-mix with --accent */
	.source-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 0;
		height: 38px;
		background: color-mix(in srgb, var(--accent) 5%, #161b22);
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
		text-align: left;
	}
	.source-bar:hover {
		background: color-mix(in srgb, var(--accent) 10%, #161b22);
	}

	.source-accent {
		width: 4px;
		height: 100%;
		background: var(--accent);
		flex-shrink: 0;
		border-radius: 0 2px 2px 0;
	}

	.source-expanded {
		min-height: 0;
		padding: 12px 16px 12px 20px;
		background: #0d111766;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Mode button uses color-mix for active state */
	.mode-btn {
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		font-weight: 500;
		color: #8b949e;
		background: #21262d;
		border: 1px solid #30363d;
		border-radius: 4px;
		padding: 3px 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.mode-btn:hover { background: #30363d; color: #c9d1d9; }
	.mode-btn.active {
		background: color-mix(in srgb, var(--accent) 20%, #21262d);
		border-color: var(--accent);
		color: var(--accent);
	}

	.cfg-label {
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 11px;
		color: #8b949e;
		width: 60px;
		flex-shrink: 0;
	}
	.cfg-input {
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		color: #c9d1d9;
		background: #0d1117;
		border: 1px solid #21262d;
		border-radius: 4px;
		padding: 4px 8px;
		outline: none;
		flex: 1;
		max-width: 200px;
	}
	.cfg-input:focus { border-color: var(--accent); }
	.cfg-input::placeholder { color: #8b949e; }

	.cfg-select {
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		color: #c9d1d9;
		background: #0d1117;
		border: 1px solid #21262d;
		border-radius: 4px;
		padding: 4px 8px;
		outline: none;
		cursor: pointer;
	}
	.cfg-select:focus { border-color: var(--accent); }

	.list-toggle {
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		font-weight: 500;
		color: #8b949e;
		background: #21262d;
		border: 1px solid #30363d;
		border-radius: 4px;
		padding: 3px 7px;
		cursor: pointer;
		text-transform: capitalize;
		transition: all 0.15s ease;
	}
	.list-toggle:hover { background: #30363d; }
	.list-toggle.active {
		color: #3fb950;
		border-color: #3fb95055;
		background: #3fb95011;
	}

	.scope-btn {
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		color: #8b949e;
		background: #21262d;
		border: 1px solid #30363d;
		border-radius: 4px;
		padding: 3px 8px;
		cursor: pointer;
	}
	.scope-btn:hover { background: #30363d; color: #c9d1d9; }
	.scope-btn.active {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 70%, #30363d);
		background: color-mix(in srgb, var(--accent) 16%, #21262d);
	}
	.scope-btn:disabled { opacity: 0.45; cursor: not-allowed; }

	.saved-list-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		text-align: left;
		padding: 8px;
		border-radius: 6px;
		border: 1px solid #30363d;
		background: #161b22;
		cursor: pointer;
	}
	.saved-list-item:hover {
		border-color: #3d444d;
		background: #1b222d;
	}
	.saved-list-item.selected {
		border-color: color-mix(in srgb, var(--accent) 75%, #30363d);
		background: color-mix(in srgb, var(--accent) 10%, #161b22);
	}

	.batch-user-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #8b949e; }
</style>
