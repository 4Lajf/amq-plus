<script>
	/**
	 * W13 step 3 — the confirmation.
	 *
	 * `/api/song-lists/resolve-missing-ids` reports what a resolution *would* do
	 * and commits nothing, because name lookup means choosing among candidates and
	 * a song listed under several anime entries can resolve to the wrong one. A
	 * wrong `annSongId` is worse than a skipped song: it silently trains you on the
	 * wrong answer and corrupts that card's history.
	 *
	 * This dialog is where the choosing happens, and it is built so that the unsafe
	 * option is never the default one:
	 *
	 * - Unique matches are pre-accepted. One song in the database has that name
	 *   *and* that artist; making someone tick 400 boxes for 400 unambiguous rows
	 *   is how a safety step becomes a thing people click through blind.
	 * - Ambiguous rows start on **Skip**, and stay there until a human picks. No
	 *   candidate is pre-selected, because a pre-selected candidate is a guess with
	 *   a confirmation button on it.
	 * - Unmatched rows are listed, not hidden. They still import; they just will
	 *   not play, and that is said here rather than discovered at Start Training.
	 */
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-svelte';
	import { defaultDecisions, describeOutcome } from '$lib/utils/songIdResolution.js';

	/**
	 * @type {{
	 *   open: boolean,
	 *   report: {counts: Object, outcomes: Array<Object>, note: string|null}|null,
	 *   onconfirm: (decisions: Record<number, number|null>) => void,
	 *   oncancel?: () => void,
	 *   returnFocusTo?: HTMLElement|null
	 * }}
	 */
	let { open = $bindable(false), report, onconfirm, oncancel, returnFocusTo = null } = $props();

	/** index → chosen annSongId, or null for "skip this one" */
	let decisions = $state({});

	// How many rows of each section are rendered. An import can be tens of
	// thousands of songs; rendering all of them makes the dialog that is supposed
	// to prevent a mistake the reason nobody opens it.
	const PAGE = 50;
	let shownResolved = $state(PAGE);
	let shownAmbiguous = $state(PAGE);
	let shownUnresolved = $state(PAGE);

	let outcomes = $derived(report?.outcomes ?? []);
	let resolved = $derived(outcomes.filter((o) => o.status === 'resolved'));
	let ambiguous = $derived(outcomes.filter((o) => o.status === 'ambiguous'));
	let unresolved = $derived(outcomes.filter((o) => o.status === 'unresolved'));

	let tally = $derived.by(() => {
		let applied = 0;
		for (const outcome of outcomes) if (decisions[outcome.index] != null) applied++;
		return { applied, skipped: outcomes.length - applied };
	});

	// Reset every time a new report arrives, so a second import cannot inherit the
	// previous one's choices.
	$effect(() => {
		if (report) {
			decisions = defaultDecisions(report.outcomes ?? []);
			shownResolved = PAGE;
			shownAmbiguous = PAGE;
			shownUnresolved = PAGE;
		}
	});

	/**
	 * @param {number} index
	 * @param {number|null} annSongId
	 */
	function choose(index, annSongId) {
		decisions = { ...decisions, [index]: annSongId };
	}

	/** @param {boolean} accept */
	function setAllResolved(accept) {
		const next = { ...decisions };
		for (const outcome of resolved) next[outcome.index] = accept ? outcome.annSongId : null;
		decisions = next;
	}

	function skipAllAmbiguous() {
		const next = { ...decisions };
		for (const outcome of ambiguous) next[outcome.index] = null;
		decisions = next;
	}

	// Closing is a cancel *unless* it was the confirm button that closed it.
	// Without this, confirming fires both callbacks and the page reports the
	// import as cancelled right after committing it.
	let confirming = false;

	function confirm() {
		confirming = true;
		onconfirm(decisions);
		open = false;
	}

	function cancel() {
		open = false;
	}

	/** @param {boolean} isOpen */
	function handleOpenChange(isOpen) {
		if (isOpen) return;
		if (!confirming) oncancel?.();
		confirming = false;
	}

	/** @param {Object} outcome */
	function describeSong(outcome) {
		const artist = outcome.songArtist ? ` — ${outcome.songArtist}` : '';
		return `${outcome.songName || '(no title)'}${artist}`;
	}
</script>

<Dialog bind:open onOpenChange={handleOpenChange}>
	<DialogContent class="resolve-song-ids flex max-h-[85vh] max-w-3xl flex-col" onCloseAutoFocus={(event) => {
		if (returnFocusTo?.isConnected) { event.preventDefault(); returnFocusTo.focus(); }
	}}>
		<DialogHeader>
			<DialogTitle class="flex items-center gap-2">
				<AlertTriangle class="h-5 w-5 text-amber-500" />
				Some songs have no AnnSongID
			</DialogTitle>
			<DialogDescription>
				{report?.counts?.total ?? 0} songs are being imported and
				{outcomes.length} of them carry no ID, so AMQ+ cannot play them as they are. Matching by
				name and artist can identify most — but a song listed under several anime resolves to the
				wrong one just as easily as the right one, and a wrong ID is worse than a missing one: it
				trains you on the wrong answer and corrupts that song's history. Nothing below is applied
				until you confirm.
			</DialogDescription>
		</DialogHeader>

		<div class="flex flex-wrap gap-2 text-sm">
			<Badge variant="outline" class="border-green-300 bg-green-50 text-green-800">
				<CheckCircle2 class="mr-1 h-3 w-3" />
				{resolved.length} matched
			</Badge>
			<Badge variant="outline" class="border-amber-300 bg-amber-50 text-amber-800">
				<HelpCircle class="mr-1 h-3 w-3" />
				{ambiguous.length} ambiguous
			</Badge>
			<Badge variant="outline" class="border-gray-300 bg-gray-50 text-gray-700">
				<XCircle class="mr-1 h-3 w-3" />
				{unresolved.length} no match
			</Badge>
		</div>

		<div class="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
			{#if ambiguous.length > 0}
				<section class="space-y-2">
					<header class="flex items-center justify-between gap-2">
						<h3 class="text-sm font-semibold text-amber-900">
							Ambiguous — pick one, or leave it skipped
						</h3>
						<Button variant="ghost" size="sm" onclick={skipAllAmbiguous}>Skip all</Button>
					</header>
					<p class="text-xs text-gray-600">
						Several different songs share this name and artist. AMQ+ will not choose for you.
					</p>
					<ul class="space-y-3">
						{#each ambiguous.slice(0, shownAmbiguous) as outcome (outcome.index)}
							<li class="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
								<div class="text-sm font-medium">{describeSong(outcome)}</div>
								<div class="mt-2 space-y-1">
									{#each outcome.candidates as candidate (candidate.annSongId)}
										<label class="flex cursor-pointer items-start gap-2 text-sm">
											<input
												type="radio"
												name={`ambiguous-${outcome.index}`}
												class="mt-1"
												checked={decisions[outcome.index] === candidate.annSongId}
												onchange={() => choose(outcome.index, candidate.annSongId)}
											/>
											<span>
												<span class="font-medium">{candidate.animeENName || 'Unknown anime'}</span>
												<span class="text-gray-500">
													· {candidate.songType || 'unknown type'} · #{candidate.annSongId}
												</span>
											</span>
										</label>
									{/each}
									<label class="flex cursor-pointer items-start gap-2 text-sm">
										<input
											type="radio"
											name={`ambiguous-${outcome.index}`}
											class="mt-1"
											checked={decisions[outcome.index] == null}
											onchange={() => choose(outcome.index, null)}
										/>
										<span class="text-gray-600">Skip — import it without an ID</span>
									</label>
								</div>
							</li>
						{/each}
					</ul>
					{#if ambiguous.length > shownAmbiguous}
						<Button variant="outline" size="sm" onclick={() => (shownAmbiguous += PAGE)}>
							Show {Math.min(PAGE, ambiguous.length - shownAmbiguous)} more of {ambiguous.length}
						</Button>
					{/if}
				</section>
			{/if}

			{#if resolved.length > 0}
				<section class="space-y-2">
					<header class="flex items-center justify-between gap-2">
						<h3 class="text-sm font-semibold text-green-900">
							Matched by name — check these before accepting
						</h3>
						<div class="flex gap-1">
							<Button variant="ghost" size="sm" onclick={() => setAllResolved(true)}>
								Accept all
							</Button>
							<Button variant="ghost" size="sm" onclick={() => setAllResolved(false)}>
								Reject all
							</Button>
						</div>
					</header>
					<p class="text-xs text-gray-600">
						Exactly one song in the database has this name and artist. That is usually right, and
						it is still a match on text rather than an ID.
					</p>
					<ul class="space-y-1">
						{#each resolved.slice(0, shownResolved) as outcome (outcome.index)}
							<li><label class="flex cursor-pointer items-start gap-2 rounded border border-green-200 bg-green-50/50 p-2">
								<Checkbox
									class="mt-1"
									aria-label={`Use match for ${describeSong(outcome)}: ${outcome.candidates[0]?.animeENName || 'Unknown anime'}, ID ${outcome.annSongId}`}
								checked={decisions[outcome.index] != null}
									onCheckedChange={(v) => choose(outcome.index, v ? outcome.annSongId : null)}
								/>
								<div class="min-w-0 text-sm">
									<div class="truncate font-medium">{describeSong(outcome)}</div>
									<div class="truncate text-xs text-gray-600">
										→ {outcome.candidates[0]?.animeENName || 'Unknown anime'}
										· {outcome.candidates[0]?.songType || 'unknown type'}
										· #{outcome.annSongId}
									</div>
								</div>
							</label></li>
						{/each}
					</ul>
					{#if resolved.length > shownResolved}
						<Button variant="outline" size="sm" onclick={() => (shownResolved += PAGE)}>
							Show {Math.min(PAGE, resolved.length - shownResolved)} more of {resolved.length}
						</Button>
					{/if}
				</section>
			{/if}

			{#if unresolved.length > 0}
				<section class="space-y-2">
					<h3 class="text-sm font-semibold text-gray-700">
						No match — imported, but not playable
					</h3>
					<p class="text-xs text-gray-600">
						Nothing in the database matches these. They are still added to your list so you do not
						lose them, and they will be skipped when a session is built.
					</p>
					<ul class="space-y-1">
						{#each unresolved.slice(0, shownUnresolved) as outcome (outcome.index)}
							<li class="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
								{describeSong(outcome)}
							</li>
						{/each}
					</ul>
					{#if unresolved.length > shownUnresolved}
						<Button variant="outline" size="sm" onclick={() => (shownUnresolved += PAGE)}>
							Show {Math.min(PAGE, unresolved.length - shownUnresolved)} more of {unresolved.length}
						</Button>
					{/if}
				</section>
			{/if}
		</div>

		<DialogFooter class="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
			<p class="text-sm text-gray-600">{describeOutcome(tally)}.</p>
			<div class="flex gap-2">
				<Button variant="outline" onclick={cancel}>Cancel import</Button>
				<Button onclick={confirm}>
					Add {report?.counts?.total ?? 0} songs
				</Button>
			</div>
		</DialogFooter>
	</DialogContent>
</Dialog>

