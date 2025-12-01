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
		Key,
		Target,
		TrendingUp,
		Calendar,
		CheckCircle2,
		Clock,
		Award
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	// @ts-ignore
	let { data } = $props();

	let showGenerateDialog = $state(false);
	let generatedToken = $state(null);

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
			showGenerateDialog = true;
		} catch (error) {
			console.error('Error generating token:', error);
			toast.error('Failed to generate token');
		}
	}

	async function revokeToken() {
		if (
			!confirm(
				'Are you sure you want to revoke your training token? The connector will stop working.'
			)
		) {
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

	function copyToken(token) {
		navigator.clipboard.writeText(token);
		toast.success('Token copied to clipboard');
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

</script>

<svelte:head>
	<title>Training Mode - AMQ Plus</title>
	<meta name="description" content="Practice your anime songs with spaced repetition" />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Page Header -->
	<div class="mb-10">
		<h1 class="text-3xl font-bold text-gray-900">Training Mode</h1>
		<p class="mt-2 text-gray-600">Practice your anime songs efficiently with spaced repetition</p>
	</div>

	<!-- Quiz Grid -->
	<div>
		<div class="mb-6 flex items-center justify-between gap-4">
			<h2 class="text-2xl font-bold text-gray-900">Your Quizzes</h2>
			<div class="flex items-center gap-3">
				<!-- Token Status Inline -->
				<div class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
					<Key class="h-4 w-4 text-gray-600" />
					<span class="text-sm font-medium text-gray-700">Token:</span>
					{#if data.hasToken}
						<Badge variant="success" class="" href={undefined}>
							<span class="text-xs">Active</span>
						</Badge>
						<Button onclick={generateToken} variant="ghost" size="sm" class="h-7 px-2 text-xs" disabled={false}>
							Regenerate
						</Button>
						<Button onclick={revokeToken} variant="ghost" size="sm" class="h-7 px-2 text-xs text-red-600 hover:text-red-700" disabled={false}>
							Revoke
						</Button>
					{:else}
						<Badge variant="secondary" class="" href={undefined}>
							<span class="text-xs">No Token</span>
						</Badge>
						<Button onclick={generateToken} size="sm" class="h-7 text-xs" disabled={false}>
							Generate Token
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
									<p class="text-gray-600">Songs Discovered</p>
									<p class="font-semibold">{quiz.stats.totalSongs}</p>
								</div>
								<div>
									<p class="text-gray-600">Accuracy</p>
									<p class="font-semibold">{quiz.stats.accuracy}%</p>
								</div>
								<div>
									<p class="text-gray-600">Due Today</p>
									<p class="font-semibold text-orange-600">{quiz.stats.dueToday}</p>
								</div>
								<div>
									<p class="text-gray-600">Last Trained</p>
									<p class="text-xs font-semibold">{formatDate(quiz.stats.lastTrained)}</p>
								</div>
							</div>
							<Button href={`/training/${quiz.id}`} class="w-full" size="sm" disabled={false}
								>View Details</Button
							>
						</CardContent>
					</Card>
				{/each}
			</div>
		{:else}
			<Card class="">
				<CardContent class="py-12 text-center">
					<Calendar class="mx-auto h-12 w-12 text-gray-400" />
					<p class="mt-4 text-gray-600">No quizzes with training data yet</p>
					<p class="mt-2 text-sm text-gray-500">
						Start training on a quiz using the AMQ+ Connector to see it here
					</p>
					<Button href="/quizzes" class="mt-4" disabled={false}>Browse Quizzes</Button>
				</CardContent>
			</Card>
		{/if}
	</div>

	<!-- Overview Stats - Full Width at Bottom -->
	{#if data.overviewStats}
		<div class="mt-12">
			<div class="grid gap-4 grid-cols-4">
				<Card class="">
					<CardContent class="px-6 py-6">
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium text-gray-600">Quizzes</p>
								<p class="text-3xl font-bold text-gray-900 mt-2">{data.overviewStats.totalQuizzes}</p>
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
								<p class="text-3xl font-bold text-gray-900 mt-2">{data.overviewStats.totalSongs}</p>
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
								<p class="text-3xl font-bold text-gray-900 mt-2">{data.overviewStats.overallAccuracy}%</p>
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
								<p class="text-3xl font-bold text-gray-900 mt-2">{data.overviewStats.totalAttempts}</p>
							</div>
							<Award class="h-8 w-8 text-yellow-500" />
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	{/if}

	<!-- How to use - Collapsible Info at Bottom -->
	<div class="mt-12 rounded-lg border border-blue-200 bg-blue-50 p-4">
		<details class="group">
			<summary class="flex cursor-pointer items-center justify-between text-sm font-medium text-blue-900">
				<span>📖 How to use the Training Mode</span>
				<svg class="h-5 w-5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
				</svg>
			</summary>
			<ol class="mt-3 list-inside list-decimal space-y-1 text-sm text-blue-800">
				<li>Generate a connector token using the "Generate Token" button above</li>
				<li>Install the <a href="https://github.com/4Lajf/amq-scripts/raw/refs/heads/main/amqPlusConnector.user.js" target="_blank" rel="noopener noreferrer" class="font-medium underline hover:text-blue-900">AMQ+ Connector userscript</a> in AnimeMusicQuiz</li>
				<li>Click the "Training" button in the AMQ lobby</li>
				<li>Paste your token and link your account</li>
				<li>Select a quiz and start training!</li>
			</ol>
		</details>
	</div>
</div>

<!-- Token Generation Dialog -->
{#if showGenerateDialog && generatedToken}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="button"
		tabindex="0"
		onclick={() => {
			showGenerateDialog = false;
			window.location.reload();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				showGenerateDialog = false;
				window.location.reload();
			}
		}}
	>
		<div
			class="mx-4 w-full max-w-md rounded-lg bg-white p-6"
			role="dialog"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h3 class="mb-4 text-lg font-semibold">Your Training Token</h3>
			<div class="mb-4 rounded-lg border-2 border-yellow-400 bg-yellow-50 p-4">
				<p class="mb-2 text-sm font-medium text-yellow-900">⚠️ Save this token securely!</p>
				<p class="text-xs text-yellow-800">This token will only be shown once. Copy it now!</p>
			</div>
			<div class="mb-4 rounded bg-gray-100 p-3 font-mono text-sm break-all">
				{generatedToken}
			</div>
			<div class="flex gap-2">
				<Button onclick={() => copyToken(generatedToken)} class="flex-1" disabled={false}
					>Copy Token</Button
				>
				<Button
					onclick={() => {
						showGenerateDialog = false;
						window.location.reload();
					}}
					variant="outline"
					class=""
					disabled={false}
				>
					Close
				</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		overflow-y: scroll;
	}
</style>
