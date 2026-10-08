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
	import { getUserDisplayName } from '$lib/utils/user-display.js';
	import DraftNavigationGuard from '$lib/components/amqplus/DraftNavigationGuard.svelte';
	import { onMount } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let { session = null, user = null, loadQuizId = null, shareToken = null } = $props();

	let paletteCollapsed = $state(false);
	let totalPercentage = $derived(getTotalPercentage());

	function slideH(node, { duration = 260, width = 280 } = {}) {
		return {
			duration,
			easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
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
	let savingVisibility = $state(false);

	// Share state
	let isCopyingViewLink = $state(false);
	let isCopyingEditLink = $state(false);

	// Load modal state
	let showLoadModal = $state(false);
	let isLoadingList = $state(false);
	let quizList = $state([]);
	let isLoadingQuiz = $state(false);
	let loadQuizStatus = $state('');

	// Song generation state
	let showSongsPanel = $state(false);
	let isGenerating = $state(false);
	let generatedSongs = $state(null);
	let generationMetadata = $state(null);
	let generationError = $state(null);
	let showTechDetails = $state(false);
	let savedPlayToken = $state(null);
	let didReadStarterTemplate = false;
	const DRAFT_KEY = 'amq-plus:quiz-builder-draft:v1';
	let draftTrackingReady = $state(false);
	let baselineSignature = $state('');
	let pendingDraft = $state(null);
	let didApplyExternalConfig = false;
	let currentSignature = $derived.by(() =>
		JSON.stringify({ routes: getRoutesSnapshot(), quiz: getCurrentQuizInfo(), savedPlayToken })
	);
	let hasUnsavedChanges = $derived(draftTrackingReady && currentSignature !== baselineSignature);

	function markDraftClean() {
		baselineSignature = currentSignature;
		try {
			localStorage.removeItem(DRAFT_KEY);
		} catch {}
	}

	function restoreDraft() {
		if (!pendingDraft?.routes) return;
		setRoutes(pendingDraft.routes);
		setCurrentQuizInfo(pendingDraft.quiz || {});
		savedPlayToken = pendingDraft.savedPlayToken || null;
		pendingDraft = null;
		toast.success('Local quiz draft restored');
	}

	function discardDraft() {
		pendingDraft = null;
		markDraftClean();
	}

	onMount(() => {
		baselineSignature = currentSignature;
		if (!loadQuizId && !didApplyExternalConfig) {
			try {
				const raw = localStorage.getItem(DRAFT_KEY);
				if (raw) {
					pendingDraft = JSON.parse(raw);
					// The editor store survives client-side navigation. Keep recovery
					// explicit instead of showing that stale draft before Restore.
					resetEditor();
					savedPlayToken = null;
					baselineSignature = currentSignature;
				}
			} catch {
				localStorage.removeItem(DRAFT_KEY);
			}
		}
		draftTrackingReady = true;
	});

	$effect(() => {
		if (!draftTrackingReady || !hasUnsavedChanges) return;
		try {
			localStorage.setItem(
				DRAFT_KEY,
				JSON.stringify({
					version: 1,
					updatedAt: new Date().toISOString(),
					routes: getRoutesSnapshot(),
					quiz: getCurrentQuizInfo(),
					savedPlayToken
				})
			);
		} catch (draftError) {
			console.warn('Could not save local quiz draft:', draftError);
		}
	});

	function handleBeforeUnload(event) {
		if (!hasUnsavedChanges) return;
		event.preventDefault();
		event.returnValue = '';
	}

	// Track current quiz
	let quizInfo = $derived(getCurrentQuizInfo());
	let isQuizOwner = $derived(
		Boolean(
			session && user && quizInfo.id && quizInfo.ownerUserId && quizInfo.ownerUserId === user.id
		)
	);
	let canUpdateCurrentQuiz = $derived(
		Boolean(quizInfo.id && (isQuizOwner || (quizInfo.shareToken && quizInfo.isPublic !== true)))
	);

	$effect(() => {
		if (loadQuizId) {
			loadQuizById(loadQuizId, shareToken);
		}
	});

	// The homepage passes a starter through sessionStorage so guests can begin
	// without creating a database row or exposing a private load endpoint. Read
	// it once, consume it, and make it a new unsaved quiz in the editor.
	$effect(() => {
		if (loadQuizId || didReadStarterTemplate) return;
		didReadStarterTemplate = true;

		const serialized = sessionStorage.getItem('templateToLoad');
		if (!serialized) return;
		sessionStorage.removeItem('templateToLoad');

		try {
			const template = JSON.parse(serialized);
			applyLoadedConfig({
				...template,
				id: null,
				user_id: null,
				play_token: null,
				share_token: null,
				is_public: false,
				allow_remixing: false
			});
			toast.success(`Starter loaded: ${template.name || 'Quiz'}`);
		} catch (err) {
			console.error('Starter template load failed:', err);
			toast.error('The starter could not be loaded. You can still build from the default quiz.');
		}
	});

	/** Persist public/remix flags without opening the Save modal (owner only). */
	async function persistVisibilityFlags() {
		const info = getCurrentQuizInfo();
		if (!session || !user || !info.id || info.ownerUserId !== user.id) return;
		savingVisibility = true;
		try {
			const response = await fetch(`/api/quiz-configurations/${info.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					is_public: saveIsPublic,
					allow_remixing: saveAllowRemixing
				})
			});
			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to update visibility');
			}
			setCurrentQuizInfo({
				isPublic: saveIsPublic,
				allowRemixing: saveAllowRemixing
			});
			toast.success('Sharing settings updated');
		} catch (err) {
			console.error('Visibility update failed:', err);
			toast.error(err.message || 'Failed to update sharing settings');
			saveIsPublic = info.isPublic ?? false;
			saveAllowRemixing = info.allowRemixing ?? false;
		} finally {
			savingVisibility = false;
		}
	}

	/** Keep local toggle state synced when a quiz is loaded. */
	$effect(() => {
		if (quizInfo.id) {
			saveIsPublic = quizInfo.isPublic ?? false;
			saveAllowRemixing = quizInfo.allowRemixing ?? false;
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
			const creatorUsername = getUserDisplayName(user, 'Guest');

			// Owners and holders of a private edit link update in place. Opening a public
			// quiz without that capability always creates a copy.
			const isOwner = Boolean(session && user && info.ownerUserId && info.ownerUserId === user.id);
			const hasPrivateEditLink = Boolean(info.id && info.shareToken && info.isPublic !== true);
			const existingId = isOwner || hasPrivateEditLink ? info.id : null;

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

			// A private edit link is an update capability for guests and non-owners too.
			if (hasPrivateEditLink) {
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
					isPublic: result.data.is_public === true,
					allowRemixing: result.data.allow_remixing === true,
					ownerUserId: result.data.user_id || (user?.id ?? null)
				});
				savedPlayToken = result.data.play_token || null;
				const savedParams = new URLSearchParams({ load: result.data.id });
				if (result.data.share_token && (!user || result.data.user_id !== user.id)) {
					savedParams.set('share', result.data.share_token);
				}
				history.replaceState(history.state, '', `/quizzes/create?${savedParams}`);

				try {
					localStorage.setItem(
						'amq_plus_current_working_quiz',
						JSON.stringify({
							id: result.data.id,
							name: saveName.trim()
						})
					);
					if (result.data.share_token) {
						localStorage.setItem('amq_plus_current_share_token', result.data.share_token);
					}
				} catch {}
				queueMicrotask(markDraftClean);
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
		loadQuizStatus = 'Loading quiz…';
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
			loadQuizStatus = `Loaded: ${data.name || 'Quiz'}`;
			toast.success(loadQuizStatus);

			const params = new URLSearchParams({ load: quizId });
			if (token) params.set('share', token);
			history.replaceState({}, '', `/quizzes/create?${params}`);
		} catch (err) {
			console.error('Load error:', err);
			loadQuizStatus = `Load failed: ${err.message}`;
			toast.error(loadQuizStatus);
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

		// Loading an intentional quiz is a new baseline, not an edit to persist
		// over an unrelated recovery draft while reactive updates settle.
		draftTrackingReady = false;
		pendingDraft = null;
		setRoutes(configData.routes);
		didApplyExternalConfig = true;
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
		queueMicrotask(() => {
			baselineSignature = currentSignature;
			draftTrackingReady = true;
		});
	}

	let showNewConfirmation = $state(false);
	/** @type {HTMLButtonElement | null} */
	let newButton = $state(null);

	function handleNew() {
		showNewConfirmation = false;
		loadQuizStatus = '';
		resetEditor();
		savedPlayToken = null;
		generatedSongs = null;
		generationMetadata = null;
		generationError = null;
		showSongsPanel = false;
		queueMicrotask(markDraftClean);
		history.replaceState({}, '', '/quizzes/create');
		toast.success('New quiz started');
	}

	// W11 / decision D2: "everything matching these filters -> save as a song
	// list". Three people independently started writing scrapers for this. It
	// takes the ELIGIBLE POOL, not the drawn selection - they want every match,
	// not a sample - and the result is a SNAPSHOT (Q5), unlike a quiz used as a
	// source, which re-resolves live.
	let isSavingPool = $state(false);
	let savePoolStatus = $state('');
	let showPoolNameDialog = $state(false);
	let poolListName = $state('');

	async function savePoolAsSongList() {
		const name = poolListName.trim();
		if (!name || name.length > 64 || isSavingPool) return;
		showPoolNameDialog = false;

		isSavingPool = true;
		savePoolStatus = 'Queued…';

		try {
			const start = await fetch('/api/song-lists/from-filters', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					routes: getRoutesSnapshot(),
					name: name.trim(),
					creator_username: getUserDisplayName(user)
				})
			});

			const started = await start.json().catch(() => ({}));
			if (!start.ok || !started.jobId) {
				throw new Error(started.message || started.error || `Request failed (${start.status})`);
			}

			// Same 202 + poll shape as session start: a full-masterlist filter run
			// plus a Pixeldrain write can exceed Cloudflare's ~100s origin timeout.
			const deadline = Date.now() + 10 * 60 * 1000;
			while (Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 2000));

				const pollRes = await fetch(
					`/api/song-lists/from-filters?jobId=${encodeURIComponent(started.jobId)}`
				);
				const poll = await pollRes.json().catch(() => ({}));

				if (poll.status === 'ready') {
					savePoolStatus = `Saved "${poll.result.list.name}" — ${poll.result.songCount} songs.`;
					toast.success(savePoolStatus);
					return;
				}
				if (poll.status === 'error') {
					throw new Error(poll.error || 'The build failed.');
				}
				savePoolStatus = poll.message || 'Working…';
			}

			throw new Error('Timed out waiting for the list to build.');
		} catch (err) {
			savePoolStatus = err instanceof Error ? err.message : 'Could not save the song list.';
			toast.error(savePoolStatus);
		} finally {
			isSavingPool = false;
		}
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

			// A gateway timeout (524) or any other proxy-level failure returns an
			// HTML error page, not JSON. Parsing it blindly is what produced the
			// useless "SyntaxError: Unexpected token '<'" users kept reporting.
			const contentType = response.headers.get('content-type') || '';
			if (!contentType.includes('application/json')) {
				const isTimeout =
					response.status === 524 || response.status === 504 || response.status === 408;
				generationError = {
					errorType: isTimeout ? 'generation_timeout' : 'server_error',
					userMessage: isTimeout
						? 'Song generation timed out - the song pool for this quiz is too large to build in one request. Try fewer sources, a smaller pool, or a smaller song count.'
						: `The server returned an unexpected response (HTTP ${response.status}). Please try again in a moment.`,
					technicalDetails: { status: response.status, contentType }
				};
				toast.error(isTimeout ? 'Generation timed out' : 'Server error');
				return;
			}

			const data = await response.json();

			if (!response.ok || data.success === false) {
				generationError = {
					errorType: data.errorType || 'unknown',
					userMessage: data.userMessage || 'Failed to generate songs.',
					technicalDetails: data.technicalDetails || {}
				};
				if (data.songs?.length > 0) generatedSongs = data.songs;

				const msg =
					data.errorType === 'no_eligible_songs'
						? 'No songs matched your filters'
						: data.errorType === 'insufficient_songs'
							? 'Not enough songs available'
							: data.errorType === 'basket_distribution_failed'
								? 'Could not meet all requirements'
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

<svelte:window onbeforeunload={handleBeforeUnload} />
<DraftNavigationGuard dirty={hasUnsavedChanges} builder="quiz builder" />

<div class="bg-ed-canvas text-ed-fg flex h-screen w-screen flex-col overflow-hidden">
	<header
		class="border-ed-border bg-ed-canvas-default font-dm z-10 flex h-12 shrink-0 items-center justify-between border-b px-5"
	>
		<div class="flex min-w-0 items-center gap-2">
			<a
				href="/"
				class="text-ed-blue hover:text-ed-blue-bright shrink-0 text-[15px] font-bold tracking-[-0.3px] no-underline"
				>AMQ+</a
			>
			<span class="text-ed-fg-subtle shrink-0 text-sm">/</span>
			<span class="text-ed-fg-subtle shrink-0 text-sm font-medium">Quiz Builder</span>
			{#if quizInfo.name}
				<span class="text-ed-fg-subtle shrink-0 text-sm">/</span>
				<span class="text-ed-fg max-w-[200px] truncate text-[13px] font-semibold"
					>{quizInfo.name}</span
				>
			{/if}
		</div>
		<div class="flex items-center">
			<span
				class="topbar-stat font-jb text-ed-fg-subtle bg-ed-canvas-subtle border-ed-border rounded-xl border px-3 py-1 text-xs font-medium {totalPercentage !==
				100
					? 'border-amber-500/20 bg-amber-500/4 text-amber-500'
					: ''}"
			>
				{routes.length} route{routes.length !== 1 ? 's' : ''}
				<span class="mx-1 opacity-40">·</span>
				{totalPercentage}%
			</span>
		</div>
		<div class="flex items-center gap-2">
			<button class="topbar-btn" bind:this={newButton} onclick={() => (showNewConfirmation = true)}>New</button>
			<button class="topbar-btn" onclick={openLoadModal}>Load</button>
			<button
				class="topbar-btn bg-ed-green-dark border-ed-green-muted hover:bg-ed-green-muted hover:border-ed-green text-white"
				onclick={openSaveModal}>Save</button
			>
			{#if quizInfo.id}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="topbar-btn" aria-label="Share quiz">
						Share ▾
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						align="end"
						class="border-ed-border-muted bg-ed-canvas-default z-100 w-56"
						portalProps={{}}
					>
						<DropdownMenu.Item
							class="share-menu-item"
							onclick={copyViewLink}
							disabled={isCopyingViewLink || !savedPlayToken}
						>
							<span class="share-menu-icon">▶</span>
							<span>
								<span class="share-menu-label">Play link</span>
								<span class="share-menu-desc">Play-only, no editor</span>
							</span>
						</DropdownMenu.Item>
						{#if quizInfo.isPublic !== true}
							<DropdownMenu.Item
								class="share-menu-item"
								onclick={copyEditLink}
								disabled={isCopyingEditLink}
							>
								<span class="share-menu-icon">✎</span>
								<span>
									<span class="share-menu-label">Private edit link</span>
									<span class="share-menu-desc">Anyone with it can update</span>
								</span>
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
			{#if isQuizOwner}
				<label
					class="topbar-btn flex cursor-pointer items-center gap-1.5 !normal-case"
					title="List this quiz publicly"
				>
					<input
						type="checkbox"
						class="accent-ed-blue"
						bind:checked={saveIsPublic}
						onchange={persistVisibilityFlags}
						disabled={savingVisibility}
					/>
					Public
				</label>
				<label
					class="topbar-btn flex cursor-pointer items-center gap-1.5 !normal-case"
					title="Allow others to open a copy in the editor"
				>
					<input
						type="checkbox"
						class="accent-ed-blue"
						bind:checked={saveAllowRemixing}
						onchange={persistVisibilityFlags}
						disabled={savingVisibility}
					/>
					Remix
				</label>
			{/if}
			{#if savedPlayToken}
				<button
					class="topbar-btn bg-ed-blue-deep border-ed-blue-muted hover:bg-ed-blue-muted hover:border-ed-blue text-white disabled:cursor-wait disabled:opacity-50"
					onclick={generateSongs}
					disabled={isGenerating}
				>
					{isGenerating ? 'Generating...' : 'Generate Songs'}
				</button>
			{/if}
			{#if session && routes.length > 0}
				<button
					class="topbar-btn disabled:cursor-wait disabled:opacity-50"
					onclick={() => {
						poolListName = '';
						showPoolNameDialog = true;
					}}
					disabled={isSavingPool}
					title="Snapshot every song matching these filters into a song list (does not auto-update when the quiz changes)"
				>
					{isSavingPool ? savePoolStatus || 'Saving...' : 'Save Pool as List'}
				</button>
			{/if}
			{#if generatedSongs || generationError}
				<button
					class="topbar-btn {showSongsPanel
						? 'bg-ed-border-muted text-ed-blue border-ed-blue/40'
						: ''}"
					onclick={() => (showSongsPanel = !showSongsPanel)}
				>
					Songs {generatedSongs ? `(${generatedSongs.length})` : ''}
				</button>
			{/if}
			<button class="topbar-btn" onclick={() => (paletteCollapsed = !paletteCollapsed)}>
				{paletteCollapsed ? '◀ Filters' : 'Filters ▶'}
			</button>
		</div>
	</header>
	<div role="status" aria-live="polite" aria-atomic="true">
		{#if loadQuizStatus}
			<p class="text-ed-fg-subtle border-ed-border m-0 border-b px-5 py-2 text-sm">{loadQuizStatus}</p>
		{/if}
		{#if savePoolStatus}
			<p class="text-ed-fg-subtle border-ed-border m-0 border-b px-5 py-2 text-sm">
				{savePoolStatus}
			</p>
		{/if}
	</div>

	{#if pendingDraft}
		<div
			class="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-5 py-2 text-sm text-amber-100"
			role="status"
		>
			<span
				>A local quiz draft from {new Date(pendingDraft.updatedAt).toLocaleString()} is available.</span
			>
			<div class="flex gap-2">
				<button class="topbar-btn" onclick={restoreDraft}>Restore draft</button>
				<button class="topbar-btn" onclick={discardDraft}>Discard</button>
			</div>
		</div>
	{/if}

	<div
		class="border-ed-border bg-ed-canvas-subtle text-ed-fg-subtle flex items-center justify-center gap-2 border-b px-4 py-1.5 text-xs"
		role="navigation"
		aria-label="Quiz builder steps"
	>
		<span class="bg-ed-blue-deep rounded-full px-3 py-1 font-semibold text-white">1 Source</span>
		<span aria-hidden="true">→</span>
		<button
			class="topbar-btn"
			onclick={() => (showSongsPanel = true)}
			disabled={!generatedSongs && !generationError}>2 Songs</button
		>
		<span aria-hidden="true">→</span>
		{#if savedPlayToken}
			<a class="topbar-btn inline-flex items-center" href={`/play/${savedPlayToken}`}
				>3 Play</a
			>
		{:else}
			<span class="topbar-btn inline-flex items-center opacity-50" aria-disabled="true"
				>3 Play</span
			>
		{/if}
		<span class="ml-2 hidden sm:inline"
			>{hasUnsavedChanges
				? 'Draft saved locally'
				: quizInfo.id
					? 'All changes saved'
					: 'Not saved yet'}</span
		>
	</div>

	{#if !session || !user}
		<div
			class="guest-banner font-dm flex shrink-0 items-center gap-3 border-b border-amber-500/20 bg-amber-500/6 px-5 py-2.5"
		>
			<span class="shrink-0 text-[15px] leading-none text-amber-400">⚠</span>
			<p class="m-0 text-[12px] leading-snug text-amber-300/90">
				<strong class="font-semibold text-amber-300">You're not logged in.</strong>
				Quizzes saved as a guest are <strong class="font-semibold">temporary</strong> — they expire
				<strong class="font-semibold">72 hours</strong> after the last play. If you close this tab
				without saving the edit link,
				<strong class="font-semibold">you won't be able to edit this quiz again.</strong>
				<a href="/auth" class="ml-1 text-amber-400 underline hover:text-amber-200">Log in</a> to keep
				your quizzes permanently.
			</p>
		</div>
	{/if}

	<div class="flex flex-1 overflow-hidden">
		<main class="ed-scrollbar flex-1 overflow-x-hidden overflow-y-auto p-6">
			<RouteManager />
		</main>

		{#if !paletteCollapsed}
			<aside
				transition:slideH
				class="ed-scrollbar-dark border-ed-border bg-ed-canvas-subtle shrink-0 overflow-y-auto border-l"
			>
				<div class="w-[280px]">
					<FilterPalette />
				</div>
			</aside>
		{/if}
	</div>
</div>

<AlertDialog.Root bind:open={showNewConfirmation}>
 <AlertDialog.Content class="" portalProps={{}} onCloseAutoFocus={(event) => { event.preventDefault(); newButton?.focus(); }}>
  <AlertDialog.Header class="">
   <AlertDialog.Title class="">Create a new quiz?</AlertDialog.Title>
   <AlertDialog.Description class="">Unsaved changes and the local draft will be cleared.</AlertDialog.Description>
  </AlertDialog.Header>
  <AlertDialog.Footer class="">
   <AlertDialog.Cancel class="">Cancel</AlertDialog.Cancel>
   <AlertDialog.Action class="" onclick={handleNew}>Create new quiz</AlertDialog.Action>
  </AlertDialog.Footer>
 </AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root bind:open={showPoolNameDialog}>
	<Dialog.Content
		class="border-ed-border-muted bg-ed-canvas-default font-dm w-[420px] max-w-[90vw] rounded-[12px] p-6"
		portalProps={{}}
	>
		<Dialog.Header>
			<Dialog.Title>Save Pool as List</Dialog.Title>
			<Dialog.Description
				>Save every matching song as a new list. This snapshot will not update when the quiz
				changes.</Dialog.Description
			>
		</Dialog.Header>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				savePoolAsSongList();
			}}
		>
			<label for="pool-list-name" class="text-ed-fg-subtle mt-4 block text-sm">List name</label>
			<input
				id="pool-list-name"
				class="df-input mt-2 w-full"
				bind:value={poolListName}
				required
				maxlength="64"
			/>
			<div class="mt-4 flex justify-end gap-2">
				<button type="button" class="topbar-btn" onclick={() => (showPoolNameDialog = false)}
					>Cancel</button
				>
				<button type="submit" class="topbar-btn" disabled={!poolListName.trim() || isSavingPool}
					>Save list</button
				>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Save Modal -->
<Dialog.Root bind:open={showSaveModal}>
	<Dialog.Content
		class="border-ed-border-muted bg-ed-canvas-default font-dm max-h-[80vh] w-[420px] max-w-[90vw] overflow-y-auto rounded-[12px] p-6"
		portalProps={{}}
	>
		<Dialog.Header class="text-left">
			<Dialog.Title class="text-ed-fg-emphasis text-lg font-semibold">
				{canUpdateCurrentQuiz ? 'Update Quiz' : quizInfo.id ? 'Save a Copy' : 'Save Quiz'}
			</Dialog.Title>
			<Dialog.Description class="text-ed-fg-subtle">
				Name the quiz and choose who can find or remix it. Your builder work stays in place if you
				close this dialog.
			</Dialog.Description>
		</Dialog.Header>

		<form
			aria-busy={isSaving}
			onsubmit={(event) => {
				event.preventDefault();
				handleSave();
			}}
		>
			<label
				class="text-ed-fg-subtle mt-5 mb-3.5 block text-[13px] font-medium"
				for="quiz-save-name"
			>
				Name
				<input
					id="quiz-save-name"
					class="bg-ed-canvas-subtle border-ed-border-muted text-ed-fg focus:border-ed-blue mt-1.5 box-border block w-full rounded-sm border px-3 py-2 font-[inherit] text-sm outline-none"
					type="text"
					bind:value={saveName}
					placeholder="My quiz name"
					maxlength="64"
				/>
			</label>

			<label
				class="text-ed-fg-subtle mb-3.5 block text-[13px] font-medium"
				for="quiz-save-description"
			>
				Description (optional)
				<textarea
					id="quiz-save-description"
					class="bg-ed-canvas-subtle border-ed-border-muted text-ed-fg focus:border-ed-blue mt-1.5 box-border block w-full resize-y rounded-sm border px-3 py-2 font-[inherit] text-sm outline-none"
					bind:value={saveDescription}
					placeholder="A short description..."
					maxlength="512"
					rows="3"
				></textarea>
			</label>

			{#if session && user}
				<label class="text-ed-fg mb-2.5 flex cursor-pointer items-center gap-2 text-[13px]">
					<input type="checkbox" bind:checked={saveIsPublic} class="accent-ed-blue" />
					Public quiz
				</label>
				<label class="text-ed-fg mb-2.5 flex cursor-pointer items-center gap-2 text-[13px]">
					<input type="checkbox" bind:checked={saveAllowRemixing} class="accent-ed-blue" />
					Allow remixing
				</label>
			{/if}

			<Dialog.Footer class="mt-5 gap-2.5 sm:justify-end">
				<button
					type="button"
					class="font-dm border-ed-border-muted bg-ed-border text-ed-fg-subtle hover:bg-ed-border-muted hover:text-ed-fg cursor-pointer rounded-sm border px-[18px] py-2 text-[13px] font-medium transition-all duration-150"
					onclick={() => (showSaveModal = false)}>Cancel</button
				>
				<button
					type="submit"
					class="font-dm border-ed-green-muted bg-ed-green-dark hover:bg-ed-green-muted cursor-pointer rounded-sm border px-[18px] py-2 text-[13px] font-medium text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={isSaving}
				>
					{isSaving
						? 'Saving...'
						: canUpdateCurrentQuiz
							? 'Update'
							: quizInfo.id
								? 'Save a Copy'
								: 'Save'}
				</button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Load Modal -->
<Dialog.Root bind:open={showLoadModal}>
	<Dialog.Content
		class="border-ed-border-muted bg-ed-canvas-default font-dm max-h-[80vh] w-[560px] max-w-[90vw] overflow-y-auto rounded-[12px] p-6"
		portalProps={{}}
	>
		<Dialog.Header class="text-left">
			<Dialog.Title class="text-ed-fg-emphasis text-lg font-semibold">Load Quiz</Dialog.Title>
			<Dialog.Description class="text-ed-fg-subtle">
				Choose one of your saved quizzes. Loading replaces the routes currently shown in the builder
				after draft protection has had a chance to preserve them.
			</Dialog.Description>
		</Dialog.Header>

		{#if !session || !user}
			<p class="text-ed-fg-subtle my-5 text-[13px]">
				Log in to see your saved quizzes. You can also load a quiz via share link.
			</p>
		{/if}

		{#if isLoadingList}
			<p class="text-ed-fg-subtle my-5 text-[13px]" role="status">Loading quizzes...</p>
		{:else if quizList.length === 0 && session && user}
			<p class="text-ed-fg-subtle my-2 text-[13px]">No saved quizzes found.</p>
		{:else}
			<div class="ed-scrollbar-inset flex max-h-[400px] flex-col gap-1 overflow-y-auto">
				{#each quizList as quiz}
					<button
						class="bg-ed-canvas-subtle border-ed-border hover:bg-ed-canvas-default hover:border-ed-border-muted flex w-full cursor-pointer items-center justify-between rounded-md border px-3.5 py-2.5 text-left font-[inherit] text-inherit transition-all duration-150 disabled:cursor-wait disabled:opacity-50"
						onclick={() => loadQuizById(quiz.id)}
						disabled={isLoadingQuiz}
					>
						<span class="text-ed-fg-emphasis text-sm font-medium">{quiz.name}</span>
						<span class="text-ed-fg-subtle font-jb text-[11px]">
							{quiz.creator_username}
							<span class="mx-1 opacity-40">·</span>
							<!-- Edited date, not created: this list is how you pick a quiz to load,
								     and a creation date that never moves after a save reads as "my edit
								     didn't stick" (Nirom, 2026-06-12). -->
							{quiz.updated_at && quiz.updated_at !== quiz.created_at
								? `edited ${new Date(quiz.updated_at).toLocaleDateString()}`
								: new Date(quiz.created_at).toLocaleDateString()}
						</span>
					</button>
				{/each}
			</div>
		{/if}

		<Dialog.Footer class="mt-5 gap-2.5 sm:justify-end">
			<button
				class="font-dm border-ed-border-muted bg-ed-border text-ed-fg-subtle hover:bg-ed-border-muted hover:text-ed-fg cursor-pointer rounded-sm border px-[18px] py-2 text-[13px] font-medium transition-all duration-150"
				onclick={() => (showLoadModal = false)}>Close</button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Songs Panel (slides in from right) -->
<Dialog.Root bind:open={showSongsPanel}>
	<Dialog.Content
		class="border-ed-border-muted bg-ed-canvas-default font-dm top-0 right-0 left-auto flex h-dvh w-[560px] max-w-[90vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 border-l p-0 shadow-[-8px_0_32px_rgba(0,0,0,0.4)] sm:max-w-[560px]"
		showCloseButton={false}
		portalProps={{}}
	>
		<Dialog.Header class="border-ed-border shrink-0 border-b px-5 py-3.5 text-left">
			<div class="flex items-center justify-between gap-4">
				<div>
					<Dialog.Title class="text-ed-fg-emphasis text-base font-semibold">
						Generated Songs
					</Dialog.Title>
					<Dialog.Description class="text-ed-fg-subtle mt-1 text-xs">
						Review the generated pool, generation result, and any unmet requirements.
					</Dialog.Description>
				</div>
				<div class="flex items-center gap-2">
					<button class="topbar-btn" onclick={generateSongs} disabled={isGenerating}>
						{isGenerating ? 'Generating...' : 'Regenerate'}
					</button>
					<button
						class="text-ed-fg-subtle hover:text-ed-fg-emphasis cursor-pointer border-none bg-transparent px-1 text-[22px] leading-none"
						onclick={() => (showSongsPanel = false)}
						aria-label="Close generated songs">&times;</button
					>
				</div>
			</div>
		</Dialog.Header>

		<div
			class="ed-scrollbar-inset flex-1 overflow-y-auto px-5 py-4"
			aria-live="polite"
			aria-busy={isGenerating}
		>
			{#if isGenerating}
				<div
					class="text-ed-fg-subtle flex flex-col items-center justify-center gap-4 py-15 text-[13px]"
				>
					<div class="songs-spinner"></div>
					<p>Generating songs from quiz configuration...</p>
				</div>
			{:else if generationError}
				<div class="border-ed-red/20 mb-4 rounded-md border bg-[#1c1012] p-4" role="alert">
					<div class="flex items-start gap-3">
						<span
							class="bg-ed-red/13 text-ed-red flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold"
							>!</span
						>
						<div>
							<h4 class="text-ed-red m-0 mb-1 text-sm font-semibold">Song Generation Failed</h4>
							<p class="text-ed-red/60 m-0 text-[13px]">{generationError.userMessage}</p>
						</div>
					</div>

					{#if generationError.technicalDetails && Object.keys(generationError.technicalDetails).length > 0}
						<button
							class="text-ed-fg-subtle font-jb hover:text-ed-fg cursor-pointer border-none bg-transparent pt-2 text-xs"
							onclick={() => (showTechDetails = !showTechDetails)}
						>
							{showTechDetails ? '▾ Hide' : '▸ Show'} Technical Details
						</button>

						{#if showTechDetails}
							{@const td = generationError.technicalDetails}
							<div
								class="border-ed-border bg-ed-canvas-subtle font-jb mt-3 rounded-sm border p-3 text-xs"
							>
								<div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
									{#if td.sourceSongCount !== undefined}
										<div class="text-ed-fg-subtle flex justify-between">
											<span>Starting songs:</span>
											<span class="text-ed-fg font-medium"
												>{td.sourceSongCount?.toLocaleString()}</span
											>
										</div>
									{/if}
									{#if td.eligibleSongCount !== undefined}
										<div class="text-ed-fg-subtle flex justify-between">
											<span>After filters:</span>
											<span
												class="font-medium {td.eligibleSongCount === 0
													? 'text-ed-red'
													: 'text-ed-fg'}">{td.eligibleSongCount}</span
											>
										</div>
									{/if}
									{#if td.constraintFeasibleSongCount !== undefined}
										<div class="text-ed-fg-subtle flex justify-between">
											<span>Constraint pool:</span>
											<span class="text-ed-fg font-medium">{td.constraintFeasibleSongCount}</span>
										</div>
									{/if}
									{#if td.constraintFeasibleCap !== undefined}
										<div class="text-ed-fg-subtle flex justify-between">
											<span>Feasible cap:</span>
											<span class="text-ed-fg font-medium">{td.constraintFeasibleCap}</span>
										</div>
									{/if}
									{#if td.constraintUniqueAnimeCount != null}
										<div class="text-ed-fg-subtle flex justify-between">
											<span>Unique anime:</span>
											<span class="text-ed-fg font-medium">{td.constraintUniqueAnimeCount}</span>
										</div>
									{/if}
									{#if td.targetCount !== undefined}
										<div class="text-ed-fg-subtle flex justify-between">
											<span>Target songs:</span>
											<span class="text-ed-fg font-medium">{td.targetCount}</span>
										</div>
									{/if}
									{#if td.finalCount !== undefined}
										<div class="text-ed-fg-subtle flex justify-between">
											<span>Final result:</span>
											<span class="text-ed-red font-medium">{td.finalCount}</span>
										</div>
									{/if}
								</div>

								{#if td.failedBaskets?.length > 0}
									<div class="border-ed-border mt-3 border-t pt-3">
										<h5
											class="text-ed-fg-subtle m-0 mb-2 text-[11px] font-semibold tracking-[0.5px] uppercase"
										>
											Failed Requirements
										</h5>
										{#each td.failedBaskets as b}
											<div class="text-ed-fg-subtle flex items-center gap-2 py-[3px] text-[11px]">
												<span class="text-ed-red">✗</span>
												<code class="text-ed-fg">{b.id}</code>
												<span>{b.current}/{b.min} required</span>
											</div>
										{/each}
									</div>
								{/if}

								{#if td.basketStatus?.length > 0}
									<div class="border-ed-border mt-3 border-t pt-3">
										<h5
											class="text-ed-fg-subtle m-0 mb-2 text-[11px] font-semibold tracking-[0.5px] uppercase"
										>
											All Requirements
										</h5>
										{#each td.basketStatus as b}
											<div class="text-ed-fg-subtle flex items-center gap-2 py-[3px] text-[11px]">
												<span class={b.meetsMin ? 'text-ed-green' : 'text-ed-red'}
													>{b.meetsMin ? '✓' : '✗'}</span
												>
												<code class="text-ed-fg">{b.id}</code>
												<span>{b.current}/{b.min}-{b.max}</span>
											</div>
										{/each}
									</div>
								{/if}

								{#if td.filterStatistics?.length > 0}
									<div class="border-ed-border mt-3 border-t pt-3">
										<h5
											class="text-ed-fg-subtle m-0 mb-2 text-[11px] font-semibold tracking-[0.5px] uppercase"
										>
											Filter Breakdown
										</h5>
										{#each td.filterStatistics as f}
											<div
												class="bg-ed-canvas-default border-ed-border mb-1.5 rounded-[4px] border p-2"
											>
												<div class="text-ed-fg flex justify-between text-xs">
													<span>{f.name}</span>
													<span class="text-ed-red"
														>{f.before} → {f.after} ({f.removed} removed)</span
													>
												</div>
												{#if f.details}
													<div class="text-ed-fg-subtle mt-1 text-[11px]">
														{#if f.details.included}<div>
																✓ Included: {f.details.included.join(', ')}
															</div>{/if}
														{#if f.details.excluded}<div>
																✗ Excluded: {f.details.excluded.join(', ')}
															</div>{/if}
														{#if f.details.optional}<div>
																? Optional: {f.details.optional.join(', ')}
															</div>{/if}
														{#if f.details.missingMetadataKept}<div>
																Kept without metadata: {f.details.missingMetadataKept}
															</div>{/if}
														{#if f.details.missingPopularityExcluded}<div>
																Missing popularity excluded: {f.details.missingPopularityExcluded}
															</div>{/if}
														{#if f.details.range}<div>Range: {f.details.range}</div>{/if}
														{#if f.details.disabled}<div>
																Disabled: {f.details.disabled.join(', ')}
															</div>{/if}
														{#if f.details.enabled}<div>
																Enabled: {f.details.enabled.join(', ')}
															</div>{/if}
														{#if f.details.threshold}<div>
																Threshold: {f.details.threshold}
															</div>{/if}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{/if}

								{#if td.error}
									<div class="border-ed-border mt-3 border-t pt-3">
										<h5
											class="text-ed-fg-subtle m-0 mb-2 text-[11px] font-semibold tracking-[0.5px] uppercase"
										>
											Error
										</h5>
										<code class="text-ed-red block text-[11px] break-all">{td.error}</code>
									</div>
								{/if}
							</div>
						{/if}
					{/if}
				</div>

				{#if generatedSongs?.length > 0}
					<div
						class="text-ed-fg-subtle border-ed-border mt-4 mb-2 border-t pt-4 text-[13px] font-semibold"
					>
						Partial Results ({generatedSongs.length} songs)
					</div>
					<div class="flex flex-col gap-2">
						{#each generatedSongs as song (song.annSongId)}
							<SongCard {song} />
						{/each}
					</div>
				{/if}
			{:else if generatedSongs?.length > 0}
				{#if generationMetadata}
					<div class="bg-ed-canvas-subtle border-ed-border mb-4 rounded-md border p-3.5">
						<div class="grid grid-cols-2 gap-x-5 gap-y-2.5">
							<div class="flex items-center justify-between">
								<span class="text-ed-fg-subtle text-xs">Selected</span>
								<span class="text-ed-fg-emphasis font-jb text-[13px] font-semibold"
									>{generatedSongs.length}</span
								>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-ed-fg-subtle text-xs">Eligible</span>
								<span class="text-ed-fg-emphasis font-jb text-[13px] font-semibold"
									>{generationMetadata.eligibleSongCount ?? '—'}</span
								>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-ed-fg-subtle text-xs">Constraint Pool</span>
								<span class="text-ed-fg-emphasis font-jb text-[13px] font-semibold"
									>{generationMetadata.constraintFeasibleSongCount ?? '—'}</span
								>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-ed-fg-subtle text-xs">Target</span>
								<span class="text-ed-fg-emphasis font-jb text-[13px] font-semibold"
									>{generationMetadata.targetCount ?? '—'}</span
								>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-ed-fg-subtle text-xs">Feasible Cap</span>
								<span class="text-ed-fg-emphasis font-jb text-[13px] font-semibold"
									>{generationMetadata.constraintFeasibleCap ?? '—'}</span
								>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-ed-fg-subtle text-xs">Source Pool</span>
								<span class="text-ed-fg-emphasis font-jb text-[13px] font-semibold"
									>{generationMetadata.sourceSongCount ?? '—'}</span
								>
							</div>
							{#if generationMetadata.constraintUniqueAnimeCount != null}
								<div class="flex items-center justify-between">
									<span class="text-ed-fg-subtle text-xs">Unique Anime</span>
									<span class="text-ed-fg-emphasis font-jb text-[13px] font-semibold"
										>{generationMetadata.constraintUniqueAnimeCount}</span
									>
								</div>
							{/if}
						</div>

						{#if generationMetadata.unsatisfiedMinimums?.length > 0}
							<div class="border-ed-border mt-3 border-t pt-3">
								<div class="rounded-[4px] border border-amber-500/40 bg-amber-500/10 p-2.5">
									<div class="flex items-start gap-2">
										<span class="text-xs leading-5 text-amber-500">⚠</span>
										<div class="flex-1">
											<div class="text-xs font-semibold text-amber-500">
												{generationMetadata.unsatisfiedMinimums.length} requirement{generationMetadata
													.unsatisfiedMinimums.length === 1
													? ''
													: 's'} could not be met
											</div>
											<p class="text-ed-fg-subtle m-0 mt-1 text-[11px]">
												Not enough songs match these together. Lower the minimums, widen the
												filters, or add a source.
											</p>
											<div class="mt-1.5">
												{#each generationMetadata.unsatisfiedMinimums as u}
													<div class="flex items-center gap-1.5 py-[2px] text-[11px]">
														<span class="text-ed-fg-subtle flex-1 truncate"
															>{u.basket.replace(/-all$/, '').replace(/-/g, ' ')}</span
														>
														<span class="font-jb text-[11px] text-amber-500">{u.got}/{u.min}</span>
													</div>
												{/each}
											</div>
										</div>
									</div>
								</div>
							</div>
						{/if}

						{#if generationMetadata.basketStatus?.length > 0}
							<details class="border-ed-border mt-3 border-t pt-3">
								<summary
									class="text-ed-fg-subtle hover:text-ed-fg cursor-pointer text-xs font-medium select-none"
									>Basket Fill Status ({generationMetadata.basketStatus.length})</summary
								>
								<div class="ed-scrollbar-dark mt-2 max-h-[200px] overflow-y-auto">
									{#each generationMetadata.basketStatus as b}
										<div class="flex items-center gap-1.5 py-[3px] text-[11px]">
											<span class="text-xs {b.meetsMin ? 'text-ed-green' : 'text-amber-500'}">
												{b.meetsMin ? '✓' : '⚠'}
											</span>
											<span class="text-ed-fg-subtle flex-1 truncate"
												>{b.id.replace(/-all$/, '').replace(/-/g, ' ')}</span
											>
											<span
												class="font-jb text-[11px] {b.meetsMin
													? 'text-ed-green'
													: 'text-amber-500'}"
											>
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
				<div class="text-ed-fg-subtle flex flex-col items-center gap-4 py-15 text-sm">
					<p>No songs generated yet.</p>
					<button
						class="topbar-btn bg-ed-blue-deep border-ed-blue-muted hover:bg-ed-blue-muted hover:border-ed-blue text-white disabled:cursor-wait disabled:opacity-50"
						onclick={generateSongs}
						disabled={!savedPlayToken}
					>
						Generate Songs
					</button>
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

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
	.topbar-btn:focus-visible,
	:global(.share-menu-item:focus-visible) {
		outline: 2px solid #58a6ff;
		outline-offset: 2px;
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
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Share dropdown */
	:global(.share-menu-item) {
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
	:global(.share-menu-item:hover:not(:disabled)) {
		background: #21262d;
	}
	:global(.share-menu-item:disabled) {
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
