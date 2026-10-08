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
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Key, Target, TrendingUp, Calendar, CheckCircle2, Award } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { dayBoundaryNote } from '$lib/utils/day-boundary.js';

	// @ts-ignore
	let { data } = $props();

	// W8/C1: the boundary stays at 00:00 UTC and the UI says so, with the
	// viewer's local equivalent spelled out.
	const boundaryNote = dayBoundaryNote();

	let showGenerateDialog = $state(false);
	let generatedToken = $state(null);
	let tokenCopied = $state(false);

	async function generateToken() {
		try {
			const response = await fetch('/api/training/token/generate', {
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error('Failed to generate token');
			}

			const result = await response.json();
			generatedToken = result.token;
			data = { ...data, hasToken: true, connectorStatus: 'ready' };
			tokenCopied = false;
			showGenerateDialog = true;
		} catch (error) {
			console.error('Error generating token:', error);
			toast.error('Failed to generate token');
		}
	}

	let tokenConfirmationOpen = $state(false);
	let tokenAction = $state('replace');
	/** @type {HTMLElement | null} */
	let tokenActionOpener = null;

	function requestTokenAction(action) {
		tokenAction = action;
		tokenActionOpener =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		tokenConfirmationOpen = true;
	}

	function replaceToken() {
		requestTokenAction('replace');
	}
	function revokeToken() {
		requestTokenAction('revoke');
	}

	async function confirmTokenAction() {
		tokenConfirmationOpen = false;
		if (tokenAction === 'replace') {
			await generateToken();
			return;
		}

		try {
			const response = await fetch('/api/training/token/revoke', {
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error('Failed to revoke token');
			}

			toast.success('Token revoked successfully');
			window.location.reload();
		} catch (error) {
			console.error('Error revoking token:', error);
			toast.error('Failed to revoke token');
		}
	}

	async function copyToken(token) {
		try {
			await navigator.clipboard.writeText(token);
			tokenCopied = true;
			toast.success('Token copied to clipboard');
		} catch (error) {
			console.error('Error copying token:', error);
			toast.error('Could not copy the token. Select and copy it manually.');
		}
	}

	function closeTokenDialog() {
		showGenerateDialog = false;
		window.location.reload();
	}

	function formatDate(dateString) {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		// Format as ISO 8601 (YYYY-MM-DD)
		return date.toISOString().split('T')[0];
	}
</script>

<svelte:head>
	<title>Training - AMQ Plus</title>
	<meta name="description" content="Practice your anime songs with spaced repetition" />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Page Header -->
	<div class="mb-10">
		<h1 class="text-3xl font-bold text-gray-900">Training</h1>
		<p class="mt-2 text-gray-600">
			AMQ+ chooses what to review; you play and rate each song inside Anime Music Quiz.
		</p>
	</div>

	<!-- How to use - near top so connector onboarding is findable -->
	<div class="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
		<details class="group" open={!data.hasToken}>
			<summary
				class="flex cursor-pointer items-center justify-between text-sm font-medium text-blue-900"
			>
				<span>{data.hasToken ? 'How training works' : 'Set up training'}</span>
				<svg
					class="h-5 w-5 transition-transform group-open:rotate-180"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"
					></path>
				</svg>
			</summary>
			<ol class="mt-3 list-inside list-decimal space-y-1 text-sm text-blue-800">
				<li>Create a connector token beside “Your Quizzes” below</li>
				<li>
					Install a userscript manager such as Tampermonkey, then install the <a
						href="https://github.com/4Lajf/amq-scripts/raw/refs/heads/main/amqPlusConnector.user.js"
						target="_blank"
						rel="noopener noreferrer"
						class="font-medium underline hover:text-blue-900">AMQ+ Connector</a
					>
				</li>
				<li>In an AMQ lobby, open Training (you must be the host or alone)</li>
				<li>
					Paste the token once, choose a quiz, and start; Automatic mode is the recommended default
				</li>
			</ol>
		</details>
	</div>

	{#if data.loadError}
		<Card class="mb-8 border-red-200 bg-red-50" role="alert">
			<CardContent class="py-6">
				<h2 class="font-semibold text-red-900">Training could not be loaded</h2>
				<p class="mt-1 text-sm text-red-800">{data.loadError}</p>
				<Button class="mt-4" variant="outline" onclick={() => window.location.reload()}
					>Retry</Button
				>
			</CardContent>
		</Card>
	{:else}
		<!-- Quiz Grid -->
		<div>
			<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
				<h2 class="text-2xl font-bold text-gray-900">Your Quizzes</h2>
				<div class="flex items-center gap-3">
					<!-- Token Status Inline -->
					<div
						class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
					>
						<Key class="h-4 w-4 text-gray-600" aria-hidden="true" />
						<span class="text-sm font-medium text-gray-700">Connector:</span>
						{#if data.connectorStatus === 'linked'}
							<Badge variant="success" class="" href={undefined}>
								<span class="text-xs">Connector linked</span>
							</Badge>
							<Button
								onclick={replaceToken}
								variant="ghost"
								size="sm"
								class="px-3 text-xs"
								disabled={false}
							>
								Replace token
							</Button>
							<Button
								onclick={revokeToken}
								variant="ghost"
								size="sm"
								class="px-3 text-xs text-red-600 hover:text-red-700"
								disabled={false}
							>
								Revoke
							</Button>
						{:else if data.connectorStatus === 'ready'}
							<Badge variant="secondary" class="" href={undefined}>
								<span class="text-xs">Token ready to paste</span>
							</Badge>
							<Button
								onclick={replaceToken}
								variant="ghost"
								size="sm"
								class="px-3 text-xs"
								disabled={false}
							>
								Replace token
							</Button>
							<Button
								onclick={revokeToken}
								variant="ghost"
								size="sm"
								class="px-3 text-xs text-red-600 hover:text-red-700"
								disabled={false}
							>
								Revoke
							</Button>
						{:else}
							<Badge variant="secondary" class="" href={undefined}>
								<span class="text-xs">Not linked</span>
							</Badge>
							<Button onclick={generateToken} size="sm" class="text-xs" disabled={false}>
								Create token
							</Button>
						{/if}
					</div>
				</div>
			</div>

			{#if data.quizzes && data.quizzes.length > 0}
				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each data.quizzes as quiz}
						<Card class="transition-shadow hover:shadow-md">
							<CardHeader class="">
								<CardTitle class="text-lg">{quiz.name}</CardTitle>
								<CardDescription class="">{quiz.description || 'No description'}</CardDescription>
							</CardHeader>
							<CardContent class="space-y-3">
								<div class="grid grid-cols-2 gap-2 text-sm">
									<div>
										<p class="text-gray-600">Songs practiced</p>
										<p class="font-semibold">{quiz.stats.totalSongs}</p>
									</div>
									<div>
										<p class="text-gray-600">Accuracy</p>
										<p class="font-semibold">{quiz.stats.accuracy}%</p>
									</div>
									<div>
										<p class="text-gray-600" title={boundaryNote}>Due Today</p>
										<p class="font-semibold text-orange-600" title={boundaryNote}>
											{quiz.stats.dueToday}
										</p>
									</div>
									<div>
										<p class="text-gray-600">Last Trained</p>
										<p class="text-xs font-semibold">{formatDate(quiz.stats.lastTrained)}</p>
									</div>
								</div>
								<Button href={`/training/${quiz.id}`} class="w-full" size="sm" disabled={false}
									>Open progress</Button
								>
							</CardContent>
						</Card>
					{/each}
				</div>
			{:else}
				<Card class="">
					<CardContent class="py-12 text-center">
						<Calendar class="mx-auto h-12 w-12 text-gray-400" />
						<p class="mt-4 text-gray-600">No quizzes yet</p>
						<p class="mt-2 text-sm text-gray-500">
							Create or save a quiz and it will show up here, even before you have training data
						</p>
						<Button href="/quizzes" class="mt-4" disabled={false}>Browse Quizzes</Button>
					</CardContent>
				</Card>
			{/if}
		</div>

		<!-- Overview Stats - Full Width at Bottom -->
		{#if data.overviewStats}
			<div class="mt-12">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<Card class="">
						<CardContent class="px-6 py-6">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm font-medium text-gray-600">Quizzes</p>
									<p class="mt-2 text-3xl font-bold text-gray-900">
										{data.overviewStats.totalQuizzes}
									</p>
								</div>
								<Target class="h-8 w-8 text-blue-500" />
							</div>
						</CardContent>
					</Card>

					<Card class="">
						<CardContent class="px-6 py-6">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm font-medium text-gray-600">Songs Practiced</p>
									<p class="mt-2 text-3xl font-bold text-gray-900">
										{data.overviewStats.totalSongs}
									</p>
								</div>
								<CheckCircle2 class="h-8 w-8 text-green-500" />
							</div>
						</CardContent>
					</Card>

					<Card class="">
						<CardContent class="px-6 py-6">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm font-medium text-gray-600">Overall Accuracy</p>
									<p class="mt-2 text-3xl font-bold text-gray-900">
										{data.overviewStats.overallAccuracy}%
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
									<p class="text-sm font-medium text-gray-600">Total Attempts</p>
									<p class="mt-2 text-3xl font-bold text-gray-900">
										{data.overviewStats.totalAttempts}
									</p>
								</div>
								<Award class="h-8 w-8 text-yellow-500" />
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Token Generation Dialog: the shared primitive supplies focus trapping,
Escape handling, focus restoration, and accessible labelling. -->
<Dialog
	bind:open={showGenerateDialog}
	onOpenChange={(open) => !open && generatedToken && closeTokenDialog()}
>
	{#if generatedToken}
		<DialogContent class="max-w-md" portalProps={{}}>
			<DialogHeader>
				<DialogTitle>Your training token</DialogTitle>
				<DialogDescription
					>Paste this once into the AMQ+ Connector. It will not be shown again.</DialogDescription
				>
			</DialogHeader>
			<div class="mb-4 rounded-lg border-2 border-yellow-400 bg-yellow-50 p-4">
				<p class="text-sm font-medium text-yellow-900">Copy this token now and keep it private.</p>
			</div>
			<code
				class="mb-4 block rounded bg-gray-100 p-3 font-mono text-sm break-all"
				aria-label="Training connector token"
			>
				{generatedToken}
			</code>
			<p class="sr-only" role="status" aria-live="polite">
				{tokenCopied ? 'Training token copied to clipboard.' : ''}
			</p>
			<DialogFooter class="gap-2 sm:justify-stretch">
				<Button onclick={() => copyToken(generatedToken)} class="flex-1" disabled={false}
					>{tokenCopied ? 'Copied' : 'Copy Token'}</Button
				>
				<Button onclick={closeTokenDialog} variant="outline" class="" disabled={false}>
					Close
				</Button>
			</DialogFooter>
		</DialogContent>
	{/if}
</Dialog>

<AlertDialog.Root bind:open={tokenConfirmationOpen}>
	<AlertDialog.Content
		class=""
		portalProps={{}}
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			tokenActionOpener?.focus();
		}}
	>
		<AlertDialog.Header class="">
			<AlertDialog.Title class=""
				>{tokenAction === 'replace'
					? 'Replace connector token?'
					: 'Revoke connector token?'}</AlertDialog.Title
			>
			<AlertDialog.Description class=""
				>{tokenAction === 'replace'
					? 'Your currently linked connector will stop working until you paste the new token.'
					: 'Your connector will stop working. You can generate a new token later.'}</AlertDialog.Description
			>
		</AlertDialog.Header>
		<AlertDialog.Footer class="">
			<AlertDialog.Cancel class="">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class="" onclick={confirmTokenAction}
				>{tokenAction === 'replace' ? 'Replace token' : 'Revoke token'}</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	:global(body) {
		overflow-y: scroll;
	}
</style>
