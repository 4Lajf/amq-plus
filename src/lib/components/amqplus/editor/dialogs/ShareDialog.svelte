<script>
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Copy, RefreshCw, Check } from 'lucide-svelte';
	import { getLocalQuizByDatabaseId } from '$lib/utils/localQuizStorage.js';
	import { generateRandomSeed } from '$lib/components/amqplus/editor/utils/mathUtils.js';
	import { toast } from 'svelte-sonner';

	let {
		open = $bindable(false),
		quizId = null,
		quizName = '',
		quizDescription = '',
		session = null
	} = $props();

	let shareLink = $state('');
	let playLink = $state('');
	let isLoading = $state(false);
	let isRegeneratingShare = $state(false);
	let isRegeneratingPlay = $state(false);
	let copiedLink = $state(null); // Track which link was just copied ('share' or 'play')
	let isDescriptionExpanded = $state(false);
	let includeSeed = $state(false);
	let seed = $state('');
	let isPublicQuiz = $state(false); // Track if the quiz is public

	// Generate share link when dialog opens
	$effect(() => {
		if (open && quizId) {
			generateShareLink();
			// Generate a random seed when dialog opens
			seed = generateRandomSeed();
		}
	});

	// Update play link when seed settings change
	$effect(() => {
		if (playLink) {
			updatePlayLinkWithSeed();
		}
	});

	function updatePlayLinkWithSeed() {
		if (!playLink) return;
		const baseUrl = playLink.split('?')[0];
		if (includeSeed && seed) {
			playLink = `${baseUrl}?seed=${seed}`;
		} else {
			playLink = baseUrl;
		}
	}

	// Auto-reset copy button after 2 seconds
	$effect(() => {
		if (copiedLink) {
			const timeout = setTimeout(() => {
				copiedLink = null;
			}, 2000);
			return () => clearTimeout(timeout);
		}
	});

	async function generateShareLink() {
		if (!quizId) return;

		isLoading = true;
		try {
			// First, check if the quiz is public by fetching its metadata
			const localQuiz = getLocalQuizByDatabaseId(quizId);

			// Check if quiz is public from localStorage first
			if (localQuiz?.is_public) {
				isPublicQuiz = true;
			}

			// Try to fetch quiz metadata to confirm public status
			try {
				const metadataResponse = await fetch(`/api/quiz-configurations/${quizId}/load`);
				if (metadataResponse.ok) {
					const metadataData = await metadataResponse.json();
					isPublicQuiz = metadataData.is_public || false;

					// For public quizzes, we only need the play token
					if (isPublicQuiz) {
						const basePlayLink = `${window.location.origin}/play/${metadataData.play_token}`;
						playLink = includeSeed && seed ? `${basePlayLink}?seed=${seed}` : basePlayLink;
						shareLink = ''; // No edit link for public quizzes
						return;
					}
				}
			} catch (error) {
				// If metadata fetch fails, continue with normal flow
				console.log('Could not fetch quiz metadata, continuing with normal flow');
			}

			// Guest users: authorize with share_token and fetch from API
			if (!session) {
				if (!localQuiz || !localQuiz.share_token) {
					throw new Error('Quiz not found in browser storage. Please save the quiz first.');
				}

				// Use share_token to authorize and get actual tokens from database
				const response = await fetch(`/api/quiz-configurations/${quizId}/share`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						share_token: localQuiz.share_token
					})
				});

				if (!response.ok) {
					const errorData = await response.json();
					// If it's a public quiz error, just fetch the play token
					if (response.status === 403 && errorData.message?.includes('Public quizzes')) {
						isPublicQuiz = true;
						// Fetch play token from load endpoint
						const loadResponse = await fetch(`/api/quiz-configurations/${quizId}/load`);
						if (loadResponse.ok) {
							const loadData = await loadResponse.json();
							const basePlayLink = `${window.location.origin}/play/${loadData.play_token}`;
							playLink = includeSeed && seed ? `${basePlayLink}?seed=${seed}` : basePlayLink;
							shareLink = ''; // No edit link for public quizzes
							return;
						}
					}
					throw new Error('Failed to fetch share links');
				}

				const data = await response.json();
				shareLink = `${window.location.origin}/quizzes/create?share=${data.shareToken}`;
				const basePlayLink = `${window.location.origin}/play/${data.playToken}`;
				playLink = includeSeed && seed ? `${basePlayLink}?seed=${seed}` : basePlayLink;
			} else {
				// Logged-in users: fetch from API
				// Check if user opened this quiz via share token (not owner)
				const storedShareToken = localStorage.getItem('amq_plus_current_share_token');
				const shareTokenForAuth = storedShareToken || localQuiz?.share_token;

				const response = await fetch(`/api/quiz-configurations/${quizId}/share`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: shareTokenForAuth ? JSON.stringify({ share_token: shareTokenForAuth }) : '{}'
				});

				if (!response.ok) {
					const errorData = await response.json();
					// If it's a public quiz error, just fetch the play token
					if (response.status === 403 && errorData.message?.includes('Public quizzes')) {
						isPublicQuiz = true;
						// Fetch play token from load endpoint
						const loadResponse = await fetch(`/api/quiz-configurations/${quizId}/load`);
						if (loadResponse.ok) {
							const loadData = await loadResponse.json();
							const basePlayLink = `${window.location.origin}/play/${loadData.play_token}`;
							playLink = includeSeed && seed ? `${basePlayLink}?seed=${seed}` : basePlayLink;
							shareLink = ''; // No edit link for public quizzes
							return;
						}
					}
					throw new Error('Failed to generate share link');
				}

				const data = await response.json();
				shareLink = `${window.location.origin}/quizzes/create?share=${data.shareToken}`;
				const basePlayLink = `${window.location.origin}/play/${data.playToken}`;
				playLink = includeSeed && seed ? `${basePlayLink}?seed=${seed}` : basePlayLink;
			}
		} catch (error) {
			console.error('Error generating share link:', error);
			toast.error(error.message || 'Failed to generate share link');
		} finally {
			isLoading = false;
		}
	}

	async function regenerateShareToken() {
		if (!quizId || isPublicQuiz) return;

		isRegeneratingShare = true;
		try {
			// Get share_token for authorization
			let shareTokenForAuth = null;
			if (!session) {
				// Guest users
				const localQuiz = getLocalQuizByDatabaseId(quizId);
				if (!localQuiz || !localQuiz.share_token) {
					throw new Error('Quiz not found. Please save the quiz first.');
				}
				shareTokenForAuth = localQuiz.share_token;
			} else {
				// Logged-in users: check if opened via share token
				const storedShareToken = localStorage.getItem('amq_plus_current_share_token');
				const localQuiz = getLocalQuizByDatabaseId(quizId);
				shareTokenForAuth = storedShareToken || localQuiz?.share_token;
			}

			const response = await fetch(`/api/quiz-configurations/${quizId}/share`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					tokenType: 'share',
					share_token: shareTokenForAuth || null
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				// Check if it's a public quiz error
				if (response.status === 403 && errorData.message?.includes('Public quizzes')) {
					isPublicQuiz = true;
					toast.info('Public quizzes do not have edit links');
					return;
				}
				throw new Error('Failed to regenerate share token');
			}

			const data = await response.json();
			shareLink = `${window.location.origin}/quizzes/create?share=${data.shareToken}`;

			// Update localStorage with new token
			if (shareTokenForAuth) {
				const { updateLocalQuizShareToken } = await import('$lib/utils/localQuizStorage.js');
				updateLocalQuizShareToken(quizId, data.shareToken);
				// Also update the current share token used for authentication
				try {
					localStorage.setItem('amq_plus_current_share_token', data.shareToken);
				} catch (error) {
					console.error('Error updating current share token:', error);
				}
			}

			toast.success('Edit link regenerated successfully');
		} catch (error) {
			console.error('Error regenerating share token:', error);
			toast.error('Failed to regenerate edit link');
		} finally {
			isRegeneratingShare = false;
		}
	}

	async function regeneratePlayToken() {
		if (!quizId) return;

		isRegeneratingPlay = true;
		try {
			// Get share_token for authorization
			let shareTokenForAuth = null;
			if (!session) {
				// Guest users
				const localQuiz = getLocalQuizByDatabaseId(quizId);
				if (!localQuiz || !localQuiz.share_token) {
					throw new Error('Quiz not found. Please save the quiz first.');
				}
				shareTokenForAuth = localQuiz.share_token;
			} else {
				// Logged-in users: check if opened via share token
				const storedShareToken = localStorage.getItem('amq_plus_current_share_token');
				const localQuiz = getLocalQuizByDatabaseId(quizId);
				shareTokenForAuth = storedShareToken || localQuiz?.share_token;
			}

			const response = await fetch(`/api/quiz-configurations/${quizId}/share`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					tokenType: 'play',
					share_token: shareTokenForAuth || null
				})
			});

			if (!response.ok) {
				throw new Error('Failed to regenerate play token');
			}

			const data = await response.json();
			const basePlayLink = `${window.location.origin}/play/${data.playToken}`;
			playLink = includeSeed && seed ? `${basePlayLink}?seed=${seed}` : basePlayLink;

			// Update localStorage with new token
			if (shareTokenForAuth) {
				const { updateLocalQuizPlayToken } = await import('$lib/utils/localQuizStorage.js');
				updateLocalQuizPlayToken(quizId, data.playToken);
			}

			toast.success('Play link regenerated successfully');
		} catch (error) {
			console.error('Error regenerating play token:', error);
			toast.error('Failed to regenerate play link');
		} finally {
			isRegeneratingPlay = false;
		}
	}

	async function copyToClipboard(text, label) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`${label} copied to clipboard`);
			copiedLink = label; // Set which link was copied
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
			toast.error('Failed to copy to clipboard');
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
		aria-labelledby="share-modal-title"
		tabindex="0"
		onmousedown={() => (open = false)}
		onkeydown={(e) => {
			if (e.key === 'Escape') open = false;
		}}
	>
		<Card class="mx-4 w-full max-w-lg" onmousedown={(e) => e.stopPropagation()}>
			<CardHeader class="">
				<CardTitle id="share-modal-title" class="text-lg">Share Quiz</CardTitle>
				<p class="line-clamp-2 text-sm font-medium break-words text-gray-800">
					"{quizName}"
				</p>
			</CardHeader>
			<CardContent class="space-y-4">
				<!-- Companion Script Notice -->
				<div class="rounded-lg border border-amber-200 bg-amber-50 p-3">
					<div class="flex items-start gap-2">
						<svg
							class="h-4 w-4 flex-shrink-0 text-amber-600"
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

				{#if isLoading}
					<div class="flex items-center justify-center py-8">
						<div class="text-gray-500">Generating share link...</div>
					</div>
				{:else}
					<!-- Play Link -->
					<div class="space-y-2">
						<Label for="play-link" class="text-sm font-medium">Play Link</Label>
						<div class="flex gap-2">
							<Input
								id="play-link"
								type="text"
								value={playLink}
								readonly
								class="flex-1"
								placeholder="Generating play link..."
							/>
							<Button
								variant="outline"
								size="sm"
								class=""
								onclick={() => copyToClipboard(playLink, 'Play link')}
								disabled={!playLink}
							>
								{#if copiedLink === 'Play link'}
									<Check class="h-4 w-4 text-green-500" />
								{:else}
									<Copy class="h-4 w-4" />
								{/if}
							</Button>
						</div>
						<p class="text-xs text-gray-500">Anyone with this link can play the quiz</p>

						<!-- Seed Options -->
						<div class="flex items-center gap-2">
							<Checkbox
								bind:checked={includeSeed}
								id="include-seed"
								class=""
								onchange={() => {
									if (includeSeed) {
										seed = generateRandomSeed();
										updatePlayLinkWithSeed();
									} else {
										updatePlayLinkWithSeed();
									}
								}}
							/>
							<Label for="include-seed" class="cursor-pointer text-xs">
								Include seed (same songs every time)
							</Label>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="w-full"
							onclick={regeneratePlayToken}
							disabled={isRegeneratingPlay}
						>
							<RefreshCw class="mr-2 h-4 w-4 {isRegeneratingPlay ? 'animate-spin' : ''}" />
							{isRegeneratingPlay ? 'Regenerating...' : 'Regenerate Play Link'}
						</Button>
					</div>

					<!-- Edit Link (with warning) - Hidden for public quizzes -->
					{#if !isPublicQuiz}
						<div class="space-y-2 rounded-lg border-2 border-red-500 bg-red-50 p-3">
							<div class="flex items-center gap-2">
								<svg
									class="h-4 w-4 flex-shrink-0 text-red-600"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path
										fill-rule="evenodd"
										d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
										clip-rule="evenodd"
									/>
								</svg>
								<Label for="edit-link" class="text-sm font-semibold text-red-700">Edit Link</Label>
							</div>
							<p class="text-xs font-medium text-red-600">
								Anyone with this link can edit and change the quiz configuration
							</p>
							<div class="flex gap-2">
								<Input
									id="edit-link"
									type="text"
									value={shareLink}
									readonly
									class="flex-1"
									placeholder="Generating share link..."
								/>
								<Button
									variant="outline"
									size="sm"
									class=""
									onclick={() => copyToClipboard(shareLink, 'Edit link')}
									disabled={!shareLink}
								>
									{#if copiedLink === 'Edit link'}
										<Check class="h-4 w-4 text-green-500" />
									{:else}
										<Copy class="h-4 w-4" />
									{/if}
								</Button>
							</div>
							<Button
								variant="outline"
								size="sm"
								class="w-full border-red-300 hover:bg-red-100"
								onclick={regenerateShareToken}
								disabled={isRegeneratingShare}
							>
								<RefreshCw class="mr-2 h-4 w-4 {isRegeneratingShare ? 'animate-spin' : ''}" />
								{isRegeneratingShare ? 'Regenerating...' : 'Regenerate Edit Link'}
							</Button>
						</div>
					{/if}
				{/if}
			</CardContent>
		</Card>
	</div>
{/if}

<style>
	:global(.overflow-wrap-break) {
		overflow-wrap: break-word;
		word-wrap: break-word;
		-webkit-hyphens: auto;
		hyphens: auto;
	}
</style>
