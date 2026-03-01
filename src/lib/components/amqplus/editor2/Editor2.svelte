<script>
	import '$lib/filters/index.js';

	import RouteManager from './RouteManager.svelte';
	import FilterPalette from './FilterPalette.svelte';
	import SongCard from './SongCard.svelte';
	import {
		routes,
		getTotalPercentage,
		addRoute,
		getRoutesSnapshot,
		setRoutes,
		getCurrentQuizInfo,
		setCurrentQuizInfo,
		resetEditor
	} from './editor2State.svelte.js';
	import { toast } from 'svelte-sonner';
	import { simulateQuizFromRoutes } from '$lib/utils/simulation.js';

	let { session = null, user = null, loadQuizId = null, shareToken = null } = $props();

	let paletteCollapsed = $state(false);
	let totalPercentage = $derived(getTotalPercentage());

	function slideH(node, { duration = 260, width = 280 } = {}) {
		return {
			duration,
			easing: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
			css: (t) => `width:${t * width}px;flex-shrink:0;overflow:hidden`
		};
	}

	// Save modal state
	let showSaveModal = $state(false);
	let saveName = $state('');
	let saveDescription = $state('');
	let saveIsPublic = $state(false);
	let saveAllowRemixing = $state(false);
	let isSaving = $state(false);

	// Share dropdown state
	let showShareMenu = $state(false);
	let isCopyingViewLink = $state(false);
	let isCopyingEditLink = $state(false);

	// Load modal state
	let showLoadModal = $state(false);
	let isLoadingList = $state(false);
	let quizList = $state([]);
	let isLoadingQuiz = $state(false);

	// Song generation state
	let showSongsPanel = $state(false);
	let isGenerating = $state(false);
	let generatedSongs = $state(null);
	let generationMetadata = $state(null);
	let generationError = $state(null);
	let showTechDetails = $state(false);
	let savedPlayToken = $state(null);

	// Track current quiz
	let quizInfo = $derived(getCurrentQuizInfo());

	$effect(() => {
		if (loadQuizId) {
			loadQuizById(loadQuizId, shareToken);
		}
	});

	function openSaveModal() {
		const info = getCurrentQuizInfo();
		saveName = info.name || '';
		saveDescription = info.description || '';
		saveIsPublic = info.isPublic ?? false;
		saveAllowRemixing = info.allowRemixing ?? false;
		showSaveModal = true;
	}

	async function getOrFetchShareToken(info) {
		if (info.shareToken) return info.shareToken;
		const res = await fetch(`/api/quiz-configurations/${info.id}/share`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		if (!res.ok) {
			const errData = await res.json().catch(() => ({}));
			throw new Error(errData.message || 'Failed to get share token');
		}
		const result = await res.json();
		setCurrentQuizInfo({ ...info, shareToken: result.shareToken });
		return result.shareToken;
	}

	async function copyViewLink() {
		if (!savedPlayToken) {
			toast.error('Save the quiz first to get a play link');
			return;
		}
		isCopyingViewLink = true;
		showShareMenu = false;
		try {
			const url = `${window.location.origin}/play/${savedPlayToken}`;
			await navigator.clipboard.writeText(url);
			toast.success('Play link copied!');
		} catch (err) {
			toast.error(`Failed to copy: ${err.message}`);
		} finally {
			isCopyingViewLink = false;
		}
	}

	async function copyEditLink() {
		const info = getCurrentQuizInfo();
		if (!info.id) {
			toast.error('Save the quiz first before sharing');
			return;
		}
		isCopyingEditLink = true;
		showShareMenu = false;
		try {
			const token = await getOrFetchShareToken(info);
			const url = `${window.location.origin}/quizzes/create?load=${info.id}&share=${encodeURIComponent(token)}`;
			await navigator.clipboard.writeText(url);
			toast.success('Edit link copied!');
		} catch (err) {
			console.error('Share error:', err);
			toast.error(`Failed to copy: ${err.message}`);
		} finally {
			isCopyingEditLink = false;
		}
	}

	async function handleSave() {
		if (!saveName.trim()) {
			toast.error('Please enter a quiz name');
			return;
		}
		if (saveName.trim().length > 64) {
			toast.error('Quiz name must be 64 characters or less');
			return;
		}

		isSaving = true;
		try {
			const routesData = getRoutesSnapshot();
			const configurationData = {
				version: '2.0',
				routes: routesData,
				metadata: {
					savedAt: new Date().toISOString(),
					version: '2.0'
				}
			};

			try {
				const simResult = simulateQuizFromRoutes(routesData);
				console.log('[AMQ+ Simulation Preview]', simResult);
			} catch (simErr) {
				console.warn('[AMQ+ Simulation Preview] Failed:', simErr);
			}

		const info = getCurrentQuizInfo();
		const creatorUsername = user?.user_metadata?.custom_claims?.global_name || user?.email || 'Guest';

		// Only overwrite the existing quiz if the current user actually owns it.
		// If someone else loaded this quiz (remix/share), save it as a new quiz on their account.
		const isOwner = session && user && info.ownerUserId && info.ownerUserId === user.id;
		const existingId = isOwner ? (info.id || null) : null;

		let requestBody = {
			name: saveName.trim(),
			description: saveDescription.trim() || null,
			is_public: saveIsPublic,
			allow_remixing: saveAllowRemixing,
			configuration_data: configurationData,
			quiz_metadata: null,
			creator_username: creatorUsername,
			existingQuizId: existingId
		};

		// Only pass the share token when updating our own quiz (needed for guest edits via share link).
		if (isOwner && info.shareToken) {
			requestBody.share_token = info.shareToken;
		}

		let url = '/api/quiz-configurations';
		if (!session && !user && !existingId) {
			url = '/api/quiz-configurations/temporary';
		}

			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const errData = await response.json();
				throw new Error(errData.message || 'Failed to save quiz');
			}

			const result = await response.json();

			if (result.data) {
				setCurrentQuizInfo({
					id: result.data.id,
					shareToken: result.data.share_token,
					name: saveName.trim(),
					description: saveDescription.trim() || '',
					isPublic: saveIsPublic,
					allowRemixing: saveAllowRemixing,
					ownerUserId: result.data.user_id || (user?.id ?? null)
				});
				savedPlayToken = result.data.play_token || null;

				try {
					localStorage.setItem('amq_plus_current_working_quiz', JSON.stringify({
						id: result.data.id,
						name: saveName.trim()
					}));
					if (result.data.share_token) {
						localStorage.setItem('amq_plus_current_share_token', result.data.share_token);
					}
				} catch {}
			}

			showSaveModal = false;
			toast.success(existingId ? 'Quiz updated!' : 'Quiz saved!');
		} catch (err) {
			console.error('Save error:', err);
			toast.error(`Save failed: ${err.message}`);
		} finally {
			isSaving = false;
		}
	}

	async function openLoadModal() {
		showLoadModal = true;
		isLoadingList = true;
		quizList = [];

		try {
			if (session && user) {
				const response = await fetch('/api/quiz-configurations');
				if (response.ok) {
					const result = await response.json();
					quizList = result.data || [];
				}
			}
		} catch (err) {
			console.error('Error loading quiz list:', err);
			toast.error('Failed to load quiz list');
		} finally {
			isLoadingList = false;
		}
	}

	async function loadQuizById(quizId, token = null) {
		isLoadingQuiz = true;
		try {
			let url = `/api/quiz-configurations/${quizId}/load`;
			if (token) url += `?share_token=${encodeURIComponent(token)}`;

			const response = await fetch(url);
			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to load quiz');
			}

			const result = await response.json();
			const data = result.data || result;
			if (!data.id) data.id = quizId;

			applyLoadedConfig(data);
			showLoadModal = false;
			toast.success(`Loaded: ${data.name || 'Quiz'}`);
		} catch (err) {
			console.error('Load error:', err);
			toast.error(`Load failed: ${err.message}`);
		} finally {
			isLoadingQuiz = false;
		}
	}

	function applyLoadedConfig(data) {
		const configData = data.configuration_data;

		if (!configData?.routes) {
			toast.error('Unknown quiz format');
			return;
		}

		setRoutes(configData.routes);
		setCurrentQuizInfo({
			id: data.id || null,
			shareToken: data.share_token || null,
			name: data.name || '',
			description: data.description || '',
			isPublic: data.is_public ?? false,
			allowRemixing: data.allow_remixing ?? false,
			ownerUserId: data.user_id || null
		});
		savedPlayToken = data.play_token || null;
		generatedSongs = null;
		generationMetadata = null;
		generationError = null;
	}

	function handleNew() {
		if (!confirm('Create a new quiz? Unsaved changes will be lost.')) return;
		resetEditor();
		savedPlayToken = null;
		generatedSongs = null;
		generationMetadata = null;
		generationError = null;
		showSongsPanel = false;
		toast.success('New quiz started');
	}

	async function generateSongs() {
		if (!savedPlayToken) {
			toast.error('Save the quiz first to generate songs');
			return;
		}

		isGenerating = true;
		generationError = null;
		generatedSongs = null;
		generationMetadata = null;
		showTechDetails = false;
		showSongsPanel = true;

		try {
			const response = await fetch(`/play/${savedPlayToken}?format=full`);
			const data = await response.json();

			if (!response.ok || data.success === false) {
				generationError = {
					errorType: data.errorType || 'unknown',
					userMessage: data.userMessage || 'Failed to generate songs.',
					technicalDetails: data.technicalDetails || {}
				};
				if (data.songs?.length > 0) generatedSongs = data.songs;

				const msg = data.errorType === 'no_eligible_songs' ? 'No songs matched your filters'
					: data.errorType === 'insufficient_songs' ? 'Not enough songs available'
					: data.errorType === 'basket_distribution_failed' ? 'Could not meet all requirements'
					: 'Failed to generate songs';
				toast.error(msg);
				return;
			}

			if (data.warning) toast.warning(data.warning, { duration: 3000 });

			generatedSongs = data.songs;
			generationMetadata = data.metadata || null;

			const target = generationMetadata?.targetCount;
			if (target && data.songCount < target) {
				toast.success(`Generated ${data.songCount}/${target} songs`);
			} else {
				toast.success(`Generated ${data.songCount} songs!`);
			}
		} catch (err) {
			console.error('Song generation error:', err);
			generationError = {
				errorType: 'network_error',
				userMessage: 'Network error while generating songs.',
				technicalDetails: { error: err.message }
			};
			toast.error('Network error');
		} finally {
			isGenerating = false;
		}
	}
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden bg-ed-canvas text-ed-fg" role="application">
	<header class="flex items-center justify-between h-12 px-5 shrink-0 border-b border-ed-border bg-ed-canvas-default font-dm z-10">
		<div class="flex items-center gap-2 min-w-0">
			<a href="/" class="font-bold text-[15px] text-ed-blue no-underline tracking-[-0.3px] shrink-0 hover:text-ed-blue-bright">AMQ+</a>
			<span class="text-ed-fg-subtle text-sm shrink-0">/</span>
			<span class="text-sm font-medium text-ed-fg-subtle shrink-0">Quiz Builder</span>
			{#if quizInfo.name}
				<span class="text-ed-fg-subtle text-sm shrink-0">/</span>
				<span class="text-[13px] font-semibold text-ed-fg truncate max-w-[200px]">{quizInfo.name}</span>
			{/if}
		</div>
		<div class="flex items-center">
			<span class="topbar-stat font-jb text-xs font-medium text-ed-fg-subtle bg-ed-canvas-subtle px-3 py-1 rounded-xl border border-ed-border {totalPercentage !== 100 ? 'text-amber-500 border-amber-500/20 bg-amber-500/4' : ''}">
				{routes.length} route{routes.length !== 1 ? 's' : ''}
				<span class="mx-1 opacity-40">·</span>
				{totalPercentage}%
			</span>
		</div>
		<div class="flex items-center gap-2">
		<button class="topbar-btn" onclick={handleNew}>New</button>
		<button class="topbar-btn" onclick={openLoadModal}>Load</button>
		<button class="topbar-btn bg-ed-green-dark border-ed-green-muted text-white hover:bg-ed-green-muted hover:border-ed-green" onclick={openSaveModal}>Save</button>
		{#if quizInfo.id}
			<div class="relative">
				<button
					class="topbar-btn {showShareMenu ? 'bg-ed-border-muted text-ed-fg border-ed-border-subtle' : ''}"
					onclick={() => showShareMenu = !showShareMenu}
					title="Share quiz"
				>Share ▾</button>
				{#if showShareMenu}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="fixed inset-0 z-99" onclick={() => showShareMenu = false}></div>
					<div class="share-menu absolute right-0 top-full z-100 mt-1 w-52 rounded-md border border-ed-border-muted bg-ed-canvas-default py-1 shadow-xl">
						<button
							class="share-menu-item"
							onclick={copyViewLink}
							disabled={isCopyingViewLink || !savedPlayToken}
						>
							<span class="share-menu-icon">▶</span>
							<span>
								<span class="share-menu-label">Play link</span>
								<span class="share-menu-desc">Play-only, no editor</span>
							</span>
						</button>
						<button
							class="share-menu-item"
							onclick={copyEditLink}
							disabled={isCopyingEditLink}
						>
							<span class="share-menu-icon">✎</span>
							<span>
								<span class="share-menu-label">Edit link</span>
								<span class="share-menu-desc">Opens in editor</span>
							</span>
						</button>
					</div>
				{/if}
			</div>
		{/if}
		{#if savedPlayToken}
				<button
					class="topbar-btn bg-ed-blue-deep border-ed-blue-muted text-white hover:bg-ed-blue-muted hover:border-ed-blue disabled:opacity-50 disabled:cursor-wait"
					onclick={generateSongs}
					disabled={isGenerating}
				>
					{isGenerating ? 'Generating...' : 'Generate Songs'}
				</button>
			{/if}
			{#if generatedSongs || generationError}
				<button
					class="topbar-btn {showSongsPanel ? 'bg-ed-border-muted text-ed-blue border-ed-blue/40' : ''}"
					onclick={() => showSongsPanel = !showSongsPanel}
				>
					Songs {generatedSongs ? `(${generatedSongs.length})` : ''}
				</button>
			{/if}
			<button class="topbar-btn" onclick={() => paletteCollapsed = !paletteCollapsed}>
				{paletteCollapsed ? '◀ Filters' : 'Filters ▶'}
			</button>
		</div>
	</header>

	{#if !session || !user}
		<div class="guest-banner shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-amber-500/20 bg-amber-500/6 font-dm">
			<span class="text-amber-400 text-[15px] leading-none shrink-0">⚠</span>
			<p class="text-[12px] text-amber-300/90 leading-snug m-0">
				<strong class="text-amber-300 font-semibold">You're not logged in.</strong>
				Quizzes saved as a guest are <strong class="font-semibold">temporary</strong> — they expire
				<strong class="font-semibold">72 hours</strong> after the last play.
				If you close this tab without saving the edit link, <strong class="font-semibold">you won't be able to edit this quiz again.</strong>
				<a href="/auth" class="text-amber-400 underline hover:text-amber-200 ml-1">Log in</a> to keep your quizzes permanently.
			</p>
		</div>
	{/if}

	<div class="flex flex-1 overflow-hidden">
		<main class="ed-scrollbar flex-1 overflow-y-auto overflow-x-hidden p-6">
			<RouteManager />
		</main>

		{#if !paletteCollapsed}
			<aside transition:slideH class="ed-scrollbar-dark shrink-0 border-l border-ed-border bg-ed-canvas-subtle overflow-y-auto">
				<div class="w-[280px]">
					<FilterPalette />
				</div>
			</aside>
		{/if}
	</div>
</div>

<!-- Save Modal -->
{#if showSaveModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-xs" onclick={() => showSaveModal = false}>
		<div class="w-[420px] max-w-[90vw] max-h-[80vh] overflow-y-auto rounded-[12px] border border-ed-border-muted bg-ed-canvas-default p-6 font-dm" onclick={(e) => e.stopPropagation()}>
			<h2 class="m-0 mb-5 text-lg font-semibold text-ed-fg-emphasis">{quizInfo.id ? 'Update Quiz' : 'Save Quiz'}</h2>

			<label class="block text-[13px] font-medium text-ed-fg-subtle mb-3.5">
				Name
				<input
					class="block w-full mt-1.5 px-3 py-2 bg-ed-canvas-subtle border border-ed-border-muted rounded-sm text-sm text-ed-fg font-[inherit] box-border outline-none focus:border-ed-blue"
					type="text"
					bind:value={saveName}
					placeholder="My quiz name"
					maxlength="64"
				/>
			</label>

			<label class="block text-[13px] font-medium text-ed-fg-subtle mb-3.5">
				Description (optional)
				<textarea
					class="block w-full mt-1.5 px-3 py-2 bg-ed-canvas-subtle border border-ed-border-muted rounded-sm text-sm text-ed-fg font-[inherit] box-border outline-none resize-y focus:border-ed-blue"
					bind:value={saveDescription}
					placeholder="A short description..."
					maxlength="512"
					rows="3"
				></textarea>
			</label>

			{#if session && user}
				<label class="flex items-center gap-2 text-[13px] text-ed-fg cursor-pointer mb-2.5">
					<input type="checkbox" bind:checked={saveIsPublic} class="accent-ed-blue" />
					Public quiz
				</label>
				<label class="flex items-center gap-2 text-[13px] text-ed-fg cursor-pointer mb-2.5">
					<input type="checkbox" bind:checked={saveAllowRemixing} class="accent-ed-blue" />
					Allow remixing
				</label>
			{/if}

			<div class="flex justify-end gap-2.5 mt-5">
				<button class="font-dm text-[13px] font-medium px-[18px] py-2 rounded-sm cursor-pointer border border-ed-border-muted transition-all duration-150 bg-ed-border text-ed-fg-subtle hover:bg-ed-border-muted hover:text-ed-fg" onclick={() => showSaveModal = false}>Cancel</button>
				<button class="font-dm text-[13px] font-medium px-[18px] py-2 rounded-sm cursor-pointer border border-ed-green-muted transition-all duration-150 bg-ed-green-dark text-white hover:bg-ed-green-muted disabled:opacity-50 disabled:cursor-not-allowed" onclick={handleSave} disabled={isSaving}>
					{isSaving ? 'Saving...' : (quizInfo.id ? 'Update' : 'Save')}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Load Modal -->
{#if showLoadModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-xs" onclick={() => showLoadModal = false}>
		<div class="w-[560px] max-w-[90vw] max-h-[80vh] overflow-y-auto rounded-[12px] border border-ed-border-muted bg-ed-canvas-default p-6 font-dm" onclick={(e) => e.stopPropagation()}>
			<h2 class="m-0 mb-5 text-lg font-semibold text-ed-fg-emphasis">Load Quiz</h2>

			{#if !session || !user}
				<p class="text-[13px] text-ed-fg-subtle my-2">Log in to see your saved quizzes. You can also load a quiz via share link.</p>
			{/if}

			{#if isLoadingList}
				<p class="text-[13px] text-ed-fg-subtle my-2">Loading quizzes...</p>
			{:else if quizList.length === 0 && session && user}
				<p class="text-[13px] text-ed-fg-subtle my-2">No saved quizzes found.</p>
			{:else}
				<div class="ed-scrollbar-inset flex flex-col gap-1 max-h-[400px] overflow-y-auto">
					{#each quizList as quiz}
						<button
							class="flex justify-between items-center px-3.5 py-2.5 bg-ed-canvas-subtle border border-ed-border rounded-md cursor-pointer transition-all duration-150 text-left w-full font-[inherit] text-inherit hover:bg-ed-canvas-default hover:border-ed-border-muted disabled:opacity-50 disabled:cursor-wait"
							onclick={() => loadQuizById(quiz.id)}
							disabled={isLoadingQuiz}
						>
							<span class="text-sm font-medium text-ed-fg-emphasis">{quiz.name}</span>
							<span class="text-[11px] text-ed-fg-subtle font-jb">
								{quiz.creator_username}
								<span class="mx-1 opacity-40">·</span>
								{new Date(quiz.created_at).toLocaleDateString()}
							</span>
						</button>
					{/each}
				</div>
			{/if}

			<div class="flex justify-end gap-2.5 mt-5">
				<button class="font-dm text-[13px] font-medium px-[18px] py-2 rounded-sm cursor-pointer border border-ed-border-muted transition-all duration-150 bg-ed-border text-ed-fg-subtle hover:bg-ed-border-muted hover:text-ed-fg" onclick={() => showLoadModal = false}>Close</button>
			</div>
		</div>
	</div>
{/if}

<!-- Songs Panel (slides in from right) -->
{#if showSongsPanel}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-90 flex justify-end bg-black/40" onclick={() => showSongsPanel = false}>
		<div class="w-[560px] max-w-[90vw] h-full flex flex-col border-l border-ed-border-muted bg-ed-canvas-default font-dm shadow-[-8px_0_32px_rgba(0,0,0,0.4)]" onclick={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between px-5 py-3.5 border-b border-ed-border shrink-0">
				<h2 class="m-0 text-base font-semibold text-ed-fg-emphasis">Generated Songs</h2>
				<div class="flex items-center gap-2">
					<button class="topbar-btn" onclick={generateSongs} disabled={isGenerating}>
						{isGenerating ? 'Generating...' : 'Regenerate'}
					</button>
					<button class="bg-transparent border-none text-ed-fg-subtle text-[22px] cursor-pointer px-1 leading-none hover:text-ed-fg-emphasis" onclick={() => showSongsPanel = false}>&times;</button>
				</div>
			</div>

			<div class="ed-scrollbar-inset flex-1 overflow-y-auto px-5 py-4">
				{#if isGenerating}
					<div class="flex flex-col items-center justify-center py-15 text-ed-fg-subtle text-[13px] gap-4">
						<div class="songs-spinner"></div>
						<p>Generating songs from quiz configuration...</p>
					</div>
				{:else if generationError}
					<div class="bg-[#1c1012] border border-ed-red/20 rounded-md p-4 mb-4">
						<div class="flex gap-3 items-start">
							<span class="flex items-center justify-center size-6 rounded-full bg-ed-red/13 text-ed-red font-bold text-sm shrink-0">!</span>
							<div>
								<h4 class="m-0 mb-1 text-sm font-semibold text-ed-red">Song Generation Failed</h4>
								<p class="m-0 text-[13px] text-ed-red/60">{generationError.userMessage}</p>
							</div>
						</div>

						{#if generationError.technicalDetails && Object.keys(generationError.technicalDetails).length > 0}
							<button class="bg-transparent border-none text-ed-fg-subtle text-xs cursor-pointer pt-2 font-jb hover:text-ed-fg" onclick={() => showTechDetails = !showTechDetails}>
								{showTechDetails ? '▾ Hide' : '▸ Show'} Technical Details
							</button>

							{#if showTechDetails}
								{@const td = generationError.technicalDetails}
								<div class="mt-3 p-3 rounded-sm border border-ed-border bg-ed-canvas-subtle text-xs font-jb">
									<div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
										{#if td.sourceSongCount !== undefined}
											<div class="flex justify-between text-ed-fg-subtle">
												<span>Starting songs:</span>
												<span class="text-ed-fg font-medium">{td.sourceSongCount?.toLocaleString()}</span>
											</div>
										{/if}
										{#if td.eligibleSongCount !== undefined}
											<div class="flex justify-between text-ed-fg-subtle">
												<span>After filters:</span>
												<span class="font-medium {td.eligibleSongCount === 0 ? 'text-ed-red' : 'text-ed-fg'}">{td.eligibleSongCount}</span>
											</div>
										{/if}
										{#if td.constraintFeasibleSongCount !== undefined}
											<div class="flex justify-between text-ed-fg-subtle">
												<span>Constraint pool:</span>
												<span class="text-ed-fg font-medium">{td.constraintFeasibleSongCount}</span>
											</div>
										{/if}
										{#if td.constraintFeasibleCap !== undefined}
											<div class="flex justify-between text-ed-fg-subtle">
												<span>Feasible cap:</span>
												<span class="text-ed-fg font-medium">{td.constraintFeasibleCap}</span>
											</div>
										{/if}
										{#if td.constraintUniqueAnimeCount != null}
											<div class="flex justify-between text-ed-fg-subtle">
												<span>Unique anime:</span>
												<span class="text-ed-fg font-medium">{td.constraintUniqueAnimeCount}</span>
											</div>
										{/if}
										{#if td.targetCount !== undefined}
											<div class="flex justify-between text-ed-fg-subtle">
												<span>Target songs:</span>
												<span class="text-ed-fg font-medium">{td.targetCount}</span>
											</div>
										{/if}
										{#if td.finalCount !== undefined}
											<div class="flex justify-between text-ed-fg-subtle">
												<span>Final result:</span>
												<span class="text-ed-red font-medium">{td.finalCount}</span>
											</div>
										{/if}
									</div>

									{#if td.failedBaskets?.length > 0}
										<div class="mt-3 pt-3 border-t border-ed-border">
											<h5 class="m-0 mb-2 text-[11px] font-semibold text-ed-fg-subtle uppercase tracking-[0.5px]">Failed Requirements</h5>
											{#each td.failedBaskets as b}
												<div class="flex items-center gap-2 py-[3px] text-[11px] text-ed-fg-subtle">
													<span class="text-ed-red">✗</span>
													<code class="text-ed-fg">{b.id}</code>
													<span>{b.current}/{b.min} required</span>
												</div>
											{/each}
										</div>
									{/if}

									{#if td.basketStatus?.length > 0}
										<div class="mt-3 pt-3 border-t border-ed-border">
											<h5 class="m-0 mb-2 text-[11px] font-semibold text-ed-fg-subtle uppercase tracking-[0.5px]">All Requirements</h5>
											{#each td.basketStatus as b}
												<div class="flex items-center gap-2 py-[3px] text-[11px] text-ed-fg-subtle">
													<span class="{b.meetsMin ? 'text-ed-green' : 'text-ed-red'}">{b.meetsMin ? '✓' : '✗'}</span>
													<code class="text-ed-fg">{b.id}</code>
													<span>{b.current}/{b.min}-{b.max}</span>
												</div>
											{/each}
										</div>
									{/if}

									{#if td.filterStatistics?.length > 0}
										<div class="mt-3 pt-3 border-t border-ed-border">
											<h5 class="m-0 mb-2 text-[11px] font-semibold text-ed-fg-subtle uppercase tracking-[0.5px]">Filter Breakdown</h5>
											{#each td.filterStatistics as f}
												<div class="bg-ed-canvas-default border border-ed-border rounded-[4px] p-2 mb-1.5">
													<div class="flex justify-between text-xs text-ed-fg">
														<span>{f.name}</span>
														<span class="text-ed-red">{f.before} → {f.after} ({f.removed} removed)</span>
													</div>
													{#if f.details}
														<div class="mt-1 text-[11px] text-ed-fg-subtle">
															{#if f.details.included}<div>✓ Included: {f.details.included.join(', ')}</div>{/if}
															{#if f.details.excluded}<div>✗ Excluded: {f.details.excluded.join(', ')}</div>{/if}
															{#if f.details.range}<div>Range: {f.details.range}</div>{/if}
															{#if f.details.disabled}<div>Disabled: {f.details.disabled.join(', ')}</div>{/if}
															{#if f.details.enabled}<div>Enabled: {f.details.enabled.join(', ')}</div>{/if}
															{#if f.details.threshold}<div>Threshold: {f.details.threshold}</div>{/if}
														</div>
													{/if}
												</div>
											{/each}
										</div>
									{/if}

									{#if td.error}
										<div class="mt-3 pt-3 border-t border-ed-border">
											<h5 class="m-0 mb-2 text-[11px] font-semibold text-ed-fg-subtle uppercase tracking-[0.5px]">Error</h5>
											<code class="block text-[11px] text-ed-red break-all">{td.error}</code>
										</div>
									{/if}
								</div>
							{/if}
						{/if}
					</div>

					{#if generatedSongs?.length > 0}
						<div class="text-[13px] font-semibold text-ed-fg-subtle mt-4 mb-2 pt-4 border-t border-ed-border">Partial Results ({generatedSongs.length} songs)</div>
						<div class="flex flex-col gap-2">
							{#each generatedSongs as song (song.annSongId)}
								<SongCard {song} />
							{/each}
						</div>
					{/if}
				{:else if generatedSongs?.length > 0}
					{#if generationMetadata}
						<div class="bg-ed-canvas-subtle border border-ed-border rounded-md p-3.5 mb-4">
							<div class="grid grid-cols-2 gap-x-5 gap-y-2.5">
								<div class="flex justify-between items-center">
									<span class="text-xs text-ed-fg-subtle">Selected</span>
									<span class="text-[13px] font-semibold text-ed-fg-emphasis font-jb">{generatedSongs.length}</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-xs text-ed-fg-subtle">Eligible</span>
									<span class="text-[13px] font-semibold text-ed-fg-emphasis font-jb">{generationMetadata.eligibleSongCount ?? '—'}</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-xs text-ed-fg-subtle">Constraint Pool</span>
									<span class="text-[13px] font-semibold text-ed-fg-emphasis font-jb">{generationMetadata.constraintFeasibleSongCount ?? '—'}</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-xs text-ed-fg-subtle">Target</span>
									<span class="text-[13px] font-semibold text-ed-fg-emphasis font-jb">{generationMetadata.targetCount ?? '—'}</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-xs text-ed-fg-subtle">Feasible Cap</span>
									<span class="text-[13px] font-semibold text-ed-fg-emphasis font-jb">{generationMetadata.constraintFeasibleCap ?? '—'}</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-xs text-ed-fg-subtle">Source Pool</span>
									<span class="text-[13px] font-semibold text-ed-fg-emphasis font-jb">{generationMetadata.sourceSongCount ?? '—'}</span>
								</div>
								{#if generationMetadata.constraintUniqueAnimeCount != null}
									<div class="flex justify-between items-center">
										<span class="text-xs text-ed-fg-subtle">Unique Anime</span>
										<span class="text-[13px] font-semibold text-ed-fg-emphasis font-jb">{generationMetadata.constraintUniqueAnimeCount}</span>
									</div>
								{/if}
							</div>

							{#if generationMetadata.basketStatus?.length > 0}
								<details class="mt-3 pt-3 border-t border-ed-border">
									<summary class="text-xs font-medium text-ed-fg-subtle cursor-pointer select-none hover:text-ed-fg">Basket Fill Status ({generationMetadata.basketStatus.length})</summary>
									<div class="ed-scrollbar-dark mt-2 max-h-[200px] overflow-y-auto">
										{#each generationMetadata.basketStatus as b}
											<div class="flex items-center gap-1.5 py-[3px] text-[11px]">
												<span class="text-xs {b.meetsMin ? 'text-ed-green' : 'text-amber-500'}">
													{b.meetsMin ? '✓' : '⚠'}
												</span>
												<span class="flex-1 text-ed-fg-subtle truncate">{b.id.replace(/-all$/, '').replace(/-/g, ' ')}</span>
												<span class="font-jb text-[11px] {b.meetsMin ? 'text-ed-green' : 'text-amber-500'}">
													{b.current}/{b.min}-{b.max}
												</span>
											</div>
										{/each}
									</div>
								</details>
							{/if}
						</div>
					{/if}

					<div class="flex flex-col gap-2">
						{#each generatedSongs as song (song.annSongId)}
							<SongCard {song} />
						{/each}
					</div>
				{:else}
					<div class="flex flex-col items-center gap-4 py-15 text-ed-fg-subtle text-sm">
						<p>No songs generated yet.</p>
						<button class="topbar-btn bg-ed-blue-deep border-ed-blue-muted text-white hover:bg-ed-blue-muted hover:border-ed-blue disabled:opacity-50 disabled:cursor-wait" onclick={generateSongs} disabled={!savedPlayToken}>
							Generate Songs
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Topbar button base — used across all editor buttons */
	.topbar-btn {
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		font-weight: 500;
		color: #8b949e;
		background: #21262d;
		border: 1px solid #30363d;
		padding: 5px 12px;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.topbar-btn:hover {
		background: #30363d;
		color: #c9d1d9;
		border-color: #484f58;
	}

	/* Spinner animation */
	.songs-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #30363d;
		border-top-color: #58a6ff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* Share dropdown */
	.share-menu-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 14px;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
		font-family: 'DM Sans', sans-serif;
	}
	.share-menu-item:hover:not(:disabled) {
		background: #21262d;
	}
	.share-menu-item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.share-menu-icon {
		font-size: 13px;
		color: #8b949e;
		width: 16px;
		text-align: center;
		flex-shrink: 0;
	}
	.share-menu-label {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: #c9d1d9;
	}
	.share-menu-desc {
		display: block;
		font-size: 11px;
		color: #8b949e;
		margin-top: 1px;
	}

	/* Scrollbar variants */
	.ed-scrollbar {
		scrollbar-width: thin;
		scrollbar-color: #30363d #0f1117;
	}
	.ed-scrollbar-dark {
		scrollbar-width: thin;
		scrollbar-color: #30363d #0d1117;
	}
	.ed-scrollbar-inset {
		scrollbar-width: thin;
		scrollbar-color: #30363d #161b22;
	}
</style>
