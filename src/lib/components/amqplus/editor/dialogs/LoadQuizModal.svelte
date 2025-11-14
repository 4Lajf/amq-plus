<script>
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Search, Loader2, FolderOpen, Copy, HardDrive, Trash2 } from 'lucide-svelte';
	import {
		getAllLocalQuizzes,
		getDatabaseLinkedQuizzes,
		deleteLocalQuiz,
		getLocalQuizByDatabaseId
	} from '$lib/utils/localQuizStorage.js';
	import { toast } from 'svelte-sonner';

	let {
		isOpen = $bindable(false),
		onLoadQuiz = () => {},
		session = null
	} = $props();

	let quizzes = $state([]);
	let localQuizzes = $state([]);
	let localQuizIdMap = $state(new Map()); // Map database_id to local quiz id
	let isLoading = $state(false);
	let searchQuery = $state('');
	let isCloningId = $state(null);
	let deletingQuizId = $state(null);

	// Combined quizzes from database and localStorage
	let allQuizzes = $derived([...quizzes, ...localQuizzes]);

	// Filtered quizzes based on search
	let filteredQuizzes = $derived(
		!searchQuery.trim()
			? allQuizzes
			: allQuizzes.filter(
					(quiz) =>
						quiz.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						(quiz.description && quiz.description.toLowerCase().includes(searchQuery.toLowerCase()))
				)
	);

	// Load quizzes when modal opens
	$effect(() => {
		if (isOpen) {
			loadQuizzes();
			loadLocalQuizzes();
		}
	});

	async function loadQuizzes() {
		if (!session) {
			// Guest users: only show local quizzes (don't fetch from API)
			quizzes = [];
			return;
		}

		isLoading = true;
		try {
			// Logged-in users: load their own quizzes
			const response = await fetch('/api/quiz-configurations');

			if (!response.ok) {
				throw new Error('Failed to load quizzes');
			}

			const result = await response.json();
			quizzes = result.data || [];
		} catch (error) {
			console.error('Error loading quizzes:', error);
			toast.error(`Error loading quizzes: ${error.message}`);
		} finally {
			isLoading = false;
		}
	}

	function loadLocalQuizzes() {
		try {
			// Get only database-linked quizzes from localStorage
			const dbLinkedQuizzes = getDatabaseLinkedQuizzes();
			localQuizIdMap.clear();

			localQuizzes = dbLinkedQuizzes.map((quiz) => {
				// Map database_id to local quiz id
				localQuizIdMap.set(quiz.database_id, quiz.id);

				return {
					id: quiz.database_id,
					name: quiz.name,
					description: quiz.description,
					is_public: false,
					created_at: new Date(quiz.created_at).toISOString(),
					updated_at: new Date(quiz.updated_at).toISOString(),
					is_local: true // Flag to indicate this is from localStorage
				};
			});
		} catch (error) {
			console.error('Error loading local quizzes:', error);
		}
	}

	async function handleDeleteLocalQuiz(quizId) {
		deletingQuizId = quizId;
		try {
			// Get the local quiz ID from the map
			const localQuizId = localQuizIdMap.get(quizId);

			if (!localQuizId) {
				throw new Error('Local quiz not found');
			}

			// Delete from localStorage
			const deleted = deleteLocalQuiz(localQuizId);

			if (deleted) {
				toast.success('Local quiz deleted successfully');
				// Reload local quizzes
				loadLocalQuizzes();
			} else {
				throw new Error('Failed to delete local quiz');
			}
		} catch (error) {
			console.error('Error deleting local quiz:', error);
			toast.error(`Error deleting local quiz: ${error.message}`);
		} finally {
			deletingQuizId = null;
		}
	}

	function handleLoadQuiz(quizId) {
		onLoadQuiz(quizId);
		isOpen = false;
	}

	async function handleCloneQuiz(quizId) {
		isCloningId = quizId;
		try {
			const response = await fetch(`/api/quiz-configurations/${quizId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to clone quiz');
			}

			const result = await response.json();
			toast.success(`Successfully cloned quiz: ${result.data.name}`);

			// Reload quizzes to show the newly cloned one
			await loadQuizzes();
		} catch (error) {
			console.error('Error cloning quiz:', error);
			toast.error(`Error cloning quiz: ${error.message}`);
		} finally {
			isCloningId = null;
		}
	}
</script>

{#if isOpen}
	<div
		class="absolute inset-0 z-40 flex items-center justify-center bg-black/30"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		onkeydown={(e) => (e.key === 'Escape' ? (isOpen = false) : null)}
		onclick={(e) => {
			if (e.currentTarget === e.target) isOpen = false;
		}}
	>
		<div
			class="max-h-[70vh] w-[600px] max-w-[90vw] overflow-hidden rounded-md border bg-white shadow-xl"
			role="document"
		>
			<div class="border-b bg-gray-50 p-4">
				<div class="mb-2 flex items-center justify-between">
					<h3 class="flex items-center gap-2 text-base font-semibold">
						<FolderOpen class="h-5 w-5" />
						Load Quiz Configuration
					</h3>
					<Button
						variant="outline"
						size="sm"
						class="cursor-pointer"
						disabled={false}
						onclick={() => (isOpen = false)}
						onkeydown={(e) => (e.key === 'Enter' || e.key === ' ' ? (isOpen = false) : null)}
					>
						Close
					</Button>
				</div>

				<!-- Search -->
				<div class="relative mt-3">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
					<Input
						type="text"
						bind:value={searchQuery}
						placeholder="Search quizzes..."
						class="pl-9"
						disabled={isLoading}
					/>
				</div>
			</div>

			<div class="max-h-[50vh] overflow-y-auto p-4">
				{#if isLoading}
					<div class="flex flex-col items-center justify-center py-12 text-gray-500">
						<Loader2 class="mb-3 h-8 w-8 animate-spin" />
						<p class="text-sm">Loading your quizzes...</p>
					</div>
				{:else if filteredQuizzes.length === 0}
					<div class="py-12 text-center text-gray-500">
						{#if searchQuery.trim()}
							<p class="mb-2 text-sm font-medium">No quizzes found</p>
							<p class="text-xs">Try adjusting your search query</p>
						{:else if allQuizzes.length === 0}
							{#if session}
								<p class="mb-2 text-sm font-medium">No saved quizzes yet</p>
								<p class="text-xs">Create and save your first quiz configuration</p>
							{:else}
								<p class="mb-2 text-sm font-medium">No local quizzes saved</p>
								<p class="text-xs">Create and save a quiz to see it here</p>
							{/if}
						{/if}
					</div>
				{:else}
					<div class="space-y-2">
						{#each filteredQuizzes as quiz}
							<div
								class="flex items-start justify-between gap-3 rounded-lg border bg-white p-3 transition-colors hover:bg-gray-50"
							>
								<button
									onclick={() => handleLoadQuiz(quiz.id)}
									class="flex-1 rounded text-left focus:ring-2 focus:ring-blue-500 focus:outline-none"
								>
									<div class="flex items-start justify-between">
										<div class="min-w-0 flex-1">
											<div class="flex min-w-0 items-center gap-2">
												<h4
													class="font-medium break-all text-gray-900"
													style="word-break: break-all; overflow-wrap: break-word; hyphens: auto;"
												>
													{quiz.name.length > 64 ? quiz.name.substring(0, 64) + '...' : quiz.name}
												</h4>
												{#if quiz.is_local}
													<Badge variant="outline" class="shrink-0 text-xs" href="">
														<HardDrive class="mr-1 h-3 w-3" />
														Local
													</Badge>
												{:else}
													<Badge
														variant={quiz.is_public ? 'default' : 'secondary'}
														class="shrink-0 text-xs"
														href=""
													>
														{quiz.is_public ? 'Public' : 'Private'}
													</Badge>
												{/if}
											</div>
											{#if quiz.description}
												<p
													class="mt-1 line-clamp-2 text-sm break-all text-gray-600"
													style="word-break: break-all; overflow-wrap: break-word;"
												>
													{quiz.description}
												</p>
											{/if}
											<p class="mt-2 text-xs text-gray-400">
												Updated: {new Date(quiz.updated_at || quiz.created_at).toLocaleDateString()}
											</p>
										</div>
									</div>
								</button>
								<div class="flex gap-2">
									{#if quiz.is_local}
										<button
											onclick={() => handleDeleteLocalQuiz(quiz.id)}
											disabled={deletingQuizId === quiz.id}
											title="Delete this local quiz"
											class="inline-flex flex-shrink-0 items-center justify-center rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
										>
											<Trash2 class="h-4 w-4" />
											{#if deletingQuizId === quiz.id}
												<span class="ml-2 text-xs">Deleting...</span>
											{/if}
										</button>
									{:else if session}
										<button
											onclick={() => handleCloneQuiz(quiz.id)}
											disabled={isCloningId === quiz.id}
											title="Clone this quiz"
											class="inline-flex flex-shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
										>
											<Copy class="h-4 w-4" />
											{#if isCloningId === quiz.id}
												<span class="ml-2 text-xs">Cloning...</span>
											{/if}
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			{#if !isLoading && filteredQuizzes.length > 0}
				<div class="border-t bg-gray-50 p-3 text-center text-xs text-gray-500">
					{#if session}
						{filteredQuizzes.length} quiz{filteredQuizzes.length !== 1 ? 'zes' : ''} available
						{#if localQuizzes.length > 0}
							• {localQuizzes.length} in browser
						{/if}
					{:else}
						{filteredQuizzes.length} local quiz{filteredQuizzes.length !== 1 ? 'zes' : ''} saved
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	:global(.break-words) {
		overflow-wrap: break-word;
		word-wrap: break-word;
	}

	:global(.break-all) {
		word-break: break-all;
		overflow-wrap: break-word;
		hyphens: auto;
	}
</style>
