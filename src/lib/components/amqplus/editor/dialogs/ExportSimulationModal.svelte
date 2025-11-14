<script>
	import { simulateQuizConfiguration } from '$lib/components/amqplus/editor/utils/simulationUtils.js';
	import {
		ROUTER_CONFIG,
		BASIC_SETTINGS_CONFIG,
		NUMBER_OF_SONGS_CONFIG,
		FILTER_NODE_DEFINITIONS
	} from '$lib/components/amqplus/editor/utils/nodeDefinitions.js';
	import { storeDatabaseQuiz, getLocalQuizByDatabaseId } from '$lib/utils/localQuizStorage.js';
	import { generateQuizMetadata } from '$lib/utils/quizMetadata.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Save, Loader2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-svelte';
	import SongsList from './SongsList.svelte';
	import { toast } from 'svelte-sonner';

	/**
	 * @typedef {Object} Node
	 * @property {string} id - Node ID
	 * @property {Object} data - Node data
	 * @property {string} data.instanceId - Node instance ID
	 * @property {Object} data.currentValue - Current node value
	 * @property {Function} [data.onValueChange] - Value change callback
	 * @property {Function} [data.onDelete] - Delete callback
	 * @property {boolean} [hidden] - Svelte Flow hidden property (makes node invisible but still in array)
	 */

	/**
	 * @typedef {Object} EdgeData
	 * @property {string} id - Edge ID
	 * @property {string} source - Source node ID
	 * @property {string} target - Target node ID
	 */

	/**
	 * Modal props
	 * @type {{
	 *   isOpen: boolean,
	 *   nodes: Node[],
	 *   edges: EdgeData[],
	 *   onClose: () => void,
	 *   currentQuizId: string|null,
	 *   currentQuizName: string,
	 *   session: Object|null,
	 *   user: Object|null,
	 *   onSave: (quizId: string, quizName: string) => void
	 * }}
	 */
	let {
		isOpen = $bindable(false),
		nodes = [],
		edges = [],
		onClose = () => {},
		currentQuizId = null,
		currentQuizName = '',
		session = null,
		user = null,
		onSave = () => {}
	} = $props();

	let simulation = $state(null);

	// Save state
	let isSaving = $state(false);
	let quizName = $state('');
	let quizDescription = $state('');
	let isPublic = $state(false);
	let allowRemixing = $state(false); // Default to false

	// Tab and song selection state
	let selectedTab = $state('simulation');
	let selectedSongs = $state(null);
	let loadingSongs = $state(false);
	let savedQuizId = $state(null);
	let savedPlayToken = $state(null);
	let generationError = $state(null);
	let showTechnicalDetails = $state(false);

	let canUpdateQuiz = $state(false);

	function runSimulation() {
		try {
			const configs = {
				ROUTER_CONFIG,
				BASIC_SETTINGS_CONFIG,
				NUMBER_OF_SONGS_CONFIG,
				FILTER_NODE_DEFINITIONS
			};

			const result = simulateQuizConfiguration(nodes, edges, configs);
			simulation = result;

			// Log to console as required
			console.log('Simulated Quiz Configuration:', JSON.parse(JSON.stringify(result)));

			toast.success('Simulation generated successfully!');
		} catch (error) {
			console.error('Simulation error:', error);
			simulation = {
				timestamp: new Date().toISOString(),
				error: `Simulation failed: ${error.message}`
			};
			toast.error('Simulation system error occurred');
		}
	}

	// Run simulation when modal opens
	let simulationRun = $state(false);
	$effect(() => {
		if (isOpen && !simulationRun) {
			simulationRun = true;
			runSimulation();
			// Pre-fill name if editing existing quiz
			if (currentQuizId && currentQuizName) {
				quizName = currentQuizName;
				savedQuizId = currentQuizId;
				// Load quiz settings from server
				loadQuizSettings(currentQuizId);
			} else {
				// Check localStorage for recently saved quiz
				try {
					const saved = localStorage.getItem('amq_plus_current_working_quiz');
					if (saved) {
						const { id, name } = JSON.parse(saved);
						quizName = name;
						savedQuizId = id;
						// Notify parent to update currentQuizId
						onSave(id, name);
						// Load quiz settings from server (this will update localStorage)
						loadQuizSettings(id);
					} else {
						quizName = '';
						savedQuizId = null;
						isPublic = false;
						allowRemixing = false;

						// Load saved settings from localStorage only when starting fresh
						try {
							const savedSettings = localStorage.getItem('amq_plus_quiz_settings');
							if (savedSettings) {
								const settings = JSON.parse(savedSettings);
								quizDescription = settings.description || '';
								isPublic = settings.isPublic || false;
								allowRemixing = settings.allowRemixing || false;
							}
						} catch (error) {
							console.error('Error reading saved settings:', error);
						}
					}
				} catch (error) {
					console.error('Error reading current working quiz:', error);
					quizName = '';
					savedQuizId = null;
					isPublic = false;
					allowRemixing = false;
				}
			}

			// Reset song selection state
			selectedTab = 'simulation';
			selectedSongs = null;
		} else if (!isOpen) {
			simulationRun = false;
		}
	});

	// Watch for changes to savedQuizId and update canUpdateQuiz
	$effect(() => {
		if (savedQuizId) {
			try {
				const storedToken = localStorage.getItem('amq_plus_current_share_token');
				canUpdateQuiz = !!storedToken;
			} catch (error) {
				canUpdateQuiz = false;
			}
		} else {
			canUpdateQuiz = false;
		}
	});

	// Load quiz settings when editing existing quiz
	async function loadQuizSettings(quizId) {
		try {
			// Strip db_ prefix if present to get actual database ID
			const databaseId = quizId?.startsWith('db_') ? quizId.replace('db_', '') : quizId;

			// Get share token from localStorage if available
			const shareToken = localStorage.getItem('amq_plus_current_share_token');
			const url = shareToken
				? `/api/quiz-configurations/${databaseId}/load?share_token=${shareToken}`
				: `/api/quiz-configurations/${databaseId}/load`;
			const response = await fetch(url);
			if (response.ok) {
				const data = await response.json();
				isPublic = data.is_public || false;
				allowRemixing = data.allow_remixing !== undefined ? data.allow_remixing : false;
				quizDescription = data.description || '';
				savedPlayToken = data.play_token;

				// Store settings in localStorage for persistence
				try {
					localStorage.setItem(
						'amq_plus_quiz_settings',
						JSON.stringify({
							description: quizDescription,
							isPublic,
							allowRemixing
						})
					);
				} catch (error) {
					console.error('Error storing quiz settings:', error);
				}
			}
		} catch (error) {
			console.error('Error loading quiz settings:', error);
		}
	}

	// Handle saving quiz configuration
	async function saveQuiz() {
		if (!quizName.trim()) {
			toast.error('Please enter a quiz name');
			return;
		}

		isSaving = true;

		try {
			// Filter out hidden nodes (svelte-flow hidden property)
			const visibleNodes = nodes.filter((node) => !node.hidden);

			// Get IDs of visible nodes for edge filtering
			const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));

			// Filter out edges connected to hidden nodes
			const visibleEdges = edges.filter(
				(edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
			);

			// Prepare configuration data with only visible nodes and edges
			const configurationData = {
				nodes: visibleNodes.map((node) => ({
					...node,
					data: {
						.../** @type {any} */ (node).data,
						onValueChange: undefined,
						onDelete: undefined
					}
				})),
				edges: visibleEdges,
				metadata: {
					savedAt: new Date().toISOString(),
					version: '1.0'
				}
			};

			// Generate quiz metadata
			const quizMetadata = generateQuizMetadata(configurationData);

			let result;

			// Check if we have a share token for this quiz (from localStorage or local quiz storage)
			let shareToken = null;
			let quizIdToCheck = currentQuizId || savedQuizId;

			// Strip db_ prefix if present to get actual database ID
			if (quizIdToCheck?.startsWith('db_')) {
				quizIdToCheck = quizIdToCheck.replace('db_', '');
			}

			if (quizIdToCheck) {
				try {
					// First try to get from localStorage (for quizzes loaded via share token)
					const storedToken = localStorage.getItem('amq_plus_current_share_token');
					if (storedToken) {
						shareToken = storedToken;
					} else {
						// Try to get from local quiz storage
						const localQuiz = getLocalQuizByDatabaseId(quizIdToCheck);
						if (localQuiz) {
							shareToken = localQuiz.share_token;
						}
					}
				} catch (error) {
					console.error('Error getting share token:', error);
				}
			}

			if (session && user) {
				// Logged in user - save permanently
				const creatorUsername = user.user_metadata?.custom_claims?.global_name || user.email;

				// If we have a share token, use it for authentication (updating shared quiz)
				const requestBody = {
					name: quizName.trim(),
					description: quizDescription.trim() || null,
					is_public: isPublic,
					allow_remixing: allowRemixing,
					configuration_data: configurationData,
					quiz_metadata: quizMetadata,
					creator_username: creatorUsername,
					existingQuizId: quizIdToCheck
				};

				// Add share token if available (for updating quizzes opened via share token)
				if (shareToken) {
					requestBody.share_token = shareToken;
				}

				const response = await fetch('/api/quiz-configurations', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(requestBody)
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.message || 'Failed to save quiz');
				}

				result = await response.json();
			} else {
				// Not logged in - check if updating existing quiz or creating new
				if (quizIdToCheck) {
					if (!shareToken) {
						console.error('No share token found for quiz update');
						throw new Error('Unable to update quiz without share token');
					}

					// Update existing quiz using share token
					const response = await fetch('/api/quiz-configurations', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							name: quizName.trim(),
							description: quizDescription.trim() || null,
							is_public: false,
							allow_remixing: false,
							configuration_data: configurationData,
							quiz_metadata: quizMetadata,
							creator_username: 'Guest',
							existingQuizId: quizIdToCheck,
							share_token: shareToken
						})
					});

					if (!response.ok) {
						const errorData = await response.json();
						throw new Error(errorData.message || 'Failed to update quiz');
					}

					result = await response.json();
					toast.success('Quiz updated successfully!');
				} else {
					// Not logged in - save as temporary
					const response = await fetch('/api/quiz-configurations/temporary', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							name: quizName.trim(),
							description: quizDescription.trim() || null,
							configuration_data: configurationData,
							quiz_metadata: quizMetadata,
							creator_username: 'Guest'
						})
					});

					if (!response.ok) {
						const errorData = await response.json();
						throw new Error(errorData.message || 'Failed to save quiz');
					}

					result = await response.json();
					toast.success('Temporary quiz saved! Will be deleted after 72 hours of inactivity.', {
						duration: 5000
					});
				}
			}

			savedQuizId = result.data?.id;
			savedPlayToken = result.data?.play_token;

			// Store quiz metadata in localStorage with database link
			// Always use server's response data when user is logged in to overwrite localStorage
			if (result.data) {
				const isTemporary = !session || !user;

				// If logged in and server returned updated data, use the server's configuration_data
				const serverConfigurationData = result.data.configuration_data || configurationData;

				storeDatabaseQuiz({
					id: result.data.id,
					name: result.data.name || quizName.trim(),
					description:
						result.data.description !== undefined
							? result.data.description
							: quizDescription.trim() || null,
					configuration_data: serverConfigurationData,
					creator_username:
						result.data.creator_username ||
						(session && user
							? user.user_metadata?.custom_claims?.global_name || user.email
							: 'Guest'),
					share_token: result.data.share_token,
					play_token: result.data.play_token,
					is_temporary: isTemporary,
					is_public: result.data.is_public || false
				});
			}

			toast.success(canUpdateQuiz ? 'Quiz updated successfully!' : 'Quiz saved successfully!');

			// Notify parent component of saved quiz ID and name
			if (result.data) {
				onSave(result.data.id, quizName.trim());

				// Store current working quiz in localStorage for persistence
				try {
					localStorage.setItem(
						'amq_plus_current_working_quiz',
						JSON.stringify({
							id: result.data.id,
							name: quizName.trim()
						})
					);

					// Store share token for future updates
					if (result.data.share_token) {
						localStorage.setItem('amq_plus_current_share_token', result.data.share_token);
					}

					// Store quiz settings for persistence
					localStorage.setItem(
						'amq_plus_quiz_settings',
						JSON.stringify({
							description: quizDescription.trim(),
							isPublic,
							allowRemixing
						})
					);
				} catch (error) {
					console.error('Error storing current working quiz:', error);
				}
			}

			// Switch to Selected Songs tab (but don't auto-generate songs)
			selectedTab = 'songs';
		} catch (error) {
			console.error('Error saving quiz:', error);
			toast.error(`Error saving quiz: ${error.message}`);
		} finally {
			isSaving = false;
		}
	}

	// Generate songs preview
	async function generateSongs() {
		if (!savedQuizId) {
			toast.error('Please save the quiz first');
			return;
		}

		loadingSongs = true;
		generationError = null;
		selectedSongs = null;
		showTechnicalDetails = false;

		try {
			if (!savedPlayToken) {
				throw new Error('Quiz play_token is required to generate songs');
			}
			const formatParam = 'format=full';
			const response = await fetch(`/play/${savedPlayToken}?${formatParam}`);

			const data = await response.json();

			// Check if the response indicates an error
			if (!response.ok || data.success === false) {
				// Structured error from API
				generationError = {
					errorType: data.errorType || 'unknown',
					userMessage: data.userMessage || 'Failed to generate songs. Please try again.',
					technicalDetails: data.technicalDetails || {}
				};

				// Show selected songs even if there was an error (partial results)
				if (data.songs && data.songs.length > 0) {
					selectedSongs = data.songs;
				}

				// Show appropriate toast message based on error type
				const toastMessage =
					data.errorType === 'song_list_error'
						? 'Failed to load song lists'
						: data.errorType === 'no_eligible_songs'
							? 'No songs matched your filters'
							: data.errorType === 'basket_distribution_failed'
								? 'Could not meet all requirements'
								: data.errorType === 'insufficient_songs'
									? 'Not enough songs available'
									: 'Failed to generate songs';

				toast.error(toastMessage);
				return;
			}

			// Check for warnings (partial success)
			if (data.warning || (data.loadingErrors && data.loadingErrors.length > 0)) {
				const warningMessage = data.warning || 'Some song lists failed to load';
				toast.warning(warningMessage, { duration: 3000 });
			}

			// Success
			selectedSongs = data.songs;
			generationError = null;
			toast.success(`Generated ${data.songCount} songs!`);
		} catch (error) {
			console.error('Error generating songs:', error);

			// Network or unexpected error
			generationError = {
				errorType: 'network_error',
				userMessage:
					'Network error occurred while generating songs. Please check your connection and try again.',
				technicalDetails: {
					error: error.message
				}
			};

			toast.error('Network error occurred');
		} finally {
			loadingSongs = false;
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
		onmousedown={(e) => {
			if (e.currentTarget === e.target) isOpen = false;
		}}
	>
		<div
			class="flex max-h-[80vh] w-[820px] max-w-[90vw] flex-col rounded-md border bg-white shadow-xl"
			role="document"
		>
			<div class="flex-1 overflow-auto p-4">
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-base font-semibold">Save Quiz</h3>
					<Button
						variant="outline"
						size="sm"
						class=""
						disabled={false}
						onclick={() => (isOpen = false)}
						onkeydown={(e) => (e.key === 'Enter' || e.key === ' ' ? (isOpen = false) : null)}
						>Close</Button
					>
				</div>

				<!-- Tabs for Configuration and Selected Songs -->
				<Tabs.Root bind:value={selectedTab} class="w-full">
					<Tabs.List class="mb-4 grid w-full grid-cols-2">
						<Tabs.Trigger value="simulation" class="">Configuration</Tabs.Trigger>
						<Tabs.Trigger value="songs" disabled={!savedQuizId} class=""
							>Selected Songs</Tabs.Trigger
						>
					</Tabs.List>

					<!-- Tab 1: Configuration -->
					<Tabs.Content value="simulation" class="">
						<!-- Save Section -->
						{#if session && user}
							<div class="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
								<h4 class="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-900">
									<Save class="h-4 w-4" />
									Save Quiz Configuration
								</h4>

								<div class="space-y-3">
									<div>
										<div class="flex items-center justify-between">
											<Label for="quiz-name" class="text-sm">Quiz Name *</Label>
											<span class="text-xs text-gray-500">{quizName.length}/64</span>
										</div>
										<Input
											id="quiz-name"
											bind:value={quizName}
											placeholder="Enter a name for your quiz..."
											disabled={isSaving}
											class="mt-1"
											type="text"
											maxlength="64"
										/>
									</div>

									<div>
										<div class="flex items-center justify-between">
											<Label for="quiz-description" class="text-sm">Description (optional)</Label>
											<span class="text-xs text-gray-500">{quizDescription.length}/512</span>
										</div>
										<Textarea
											id="quiz-description"
											bind:value={quizDescription}
											placeholder="Add a description for your quiz..."
											rows={2}
											disabled={isSaving}
											class="mt-1"
											maxlength="512"
										/>
									</div>

									<div class="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
										<div class="text-xs font-semibold text-gray-700">Visibility Options</div>
										<div class="flex items-center space-x-2">
											<Checkbox
												id="is-public"
												bind:checked={isPublic}
												disabled={isSaving}
												class=""
											/>
											<Label for="is-public" class="cursor-pointer text-sm font-normal">
												Make public
											</Label>
										</div>
										<div class="flex items-center space-x-2">
											<Checkbox
												id="allow-remixing"
												bind:checked={allowRemixing}
												disabled={isSaving}
												class=""
											/>
											<Label for="allow-remixing" class="cursor-pointer text-sm font-normal">
												Allow remixing
											</Label>
										</div>
										<p class="mt-1 text-xs text-gray-500">
											Public quizzes are read-only by default. Enable remixing to allow others to
											copy and edit their own version.
										</p>
										<p class="mt-1 text-xs text-gray-600">
											When public: Quiz appears in public list. When remixing is enabled: Others can
											clone and edit their own copy.
										</p>
									</div>

									<Button
										onclick={saveQuiz}
										disabled={isSaving || !quizName.trim()}
										class="w-full"
										size="sm"
									>
										{#if isSaving}
											<Loader2 class="mr-2 h-4 w-4 animate-spin" />
											Saving...
										{:else}
											<Save class="mr-2 h-4 w-4" />
											{canUpdateQuiz ? 'Update Quiz' : 'Save Quiz'}
										{/if}
									</Button>

									{#if savedQuizId}
										<!-- Companion Script Notice -->
										<div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
											<div class="flex items-start gap-2">
												<svg
													class="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
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
													<p class="mb-1 font-semibold">Ready to Play!</p>
													<p class="text-amber-700">
														To play this quiz in AMQ, install the AMQ+ companion script. First,
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
															class="font-semibold underline hover:text-amber-900"
															>download the script</a
														>.
													</p>
												</div>
											</div>
										</div>
									{/if}
								</div>
							</div>

							<Separator class="my-4" />
						{:else}
							<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
								<h4 class="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
									<Save class="h-4 w-4" />
									Save Quiz Temporarily
								</h4>

								<p class="mb-3 text-xs text-amber-800">
									You're not signed in. You can still save your quiz, but it will be deleted after
									72 hours of inactivity.
								</p>

								<div class="space-y-3">
									<div>
										<Label for="quiz-name-temp" class="text-sm">Quiz Name *</Label>
										<div class="flex items-center justify-between gap-2">
											<Input
												id="quiz-name-temp"
												bind:value={quizName}
												placeholder="Enter a name for your quiz..."
												disabled={isSaving}
												class="mt-1 flex-1"
												type="text"
												maxlength="64"
											/>
											<span class="text-xs text-gray-500">{quizName.length}/64</span>
										</div>
									</div>

									<div>
										<div class="flex items-center justify-between">
											<Label for="quiz-description-temp" class="text-sm"
												>Description (optional)</Label
											>
											<span class="text-xs text-gray-500">{quizDescription.length}/512</span>
										</div>
										<Textarea
											id="quiz-description-temp"
											bind:value={quizDescription}
											placeholder="Add a description for your quiz..."
											rows={2}
											disabled={isSaving}
											class="mt-1"
											maxlength="512"
										/>
									</div>

									<Button
										onclick={saveQuiz}
										disabled={isSaving || !quizName.trim()}
										class="w-full"
										size="sm"
									>
										{#if isSaving}
											<Loader2 class="mr-2 h-4 w-4 animate-spin" />
											Saving...
										{:else}
											<Save class="mr-2 h-4 w-4" />
											{canUpdateQuiz ? 'Update Temporary Quiz' : 'Save Temporary Quiz'}
										{/if}
									</Button>

									<p class="text-xs text-amber-700">
										💡 <a href="/auth" class="underline">Sign in</a> to save your quiz permanently.
									</p>
								</div>
							</div>

							<Separator class="my-4" />
						{/if}

						<!-- Simulation Section -->
						<h4 class="mb-2 text-sm font-semibold text-gray-700">
							Simulated Configuration Preview
						</h4>

						{#if simulation}
							<div class="mb-3 text-xs text-gray-600">
								This shows a simulated quiz configuration with all ranges resolved to static values.
								A new simulation is generated each time you open this dialog.
							</div>

							<div class="space-y-3 text-sm">
								{#if simulation.error}
									<div class="rounded-md bg-red-50 p-3 text-red-700">
										<div class="font-semibold">Error</div>
										<div>{simulation.error}</div>
									</div>
								{:else}
									<div class="grid grid-cols-1 gap-4">
										{#if simulation.router}
											<div
												class="rounded-lg border border-purple-200 bg-linear-to-r from-purple-50 to-purple-100 shadow-sm"
											>
												<div class="border-b border-purple-200 px-4 py-3">
													<div class="flex items-center gap-2">
														<span class="text-lg">🔀</span>
														<span class="font-semibold text-purple-900">Router</span>
													</div>
												</div>
												<div class="p-4">
													<div class="rounded-md border border-purple-100 bg-white/70 px-3 py-2">
														<span class="text-sm text-gray-600">Selected Route:</span>
														<span class="ml-2 font-medium text-purple-800"
															>{simulation.router.selectedRoute}</span
														>
													</div>
												</div>
											</div>
										{/if}

										{#if simulation.basicSettings}
											<div
												class="rounded-lg border border-indigo-200 bg-linear-to-r from-indigo-50 to-indigo-100 shadow-sm"
											>
												<div class="border-b border-indigo-200 px-4 py-3">
													<div class="flex items-center gap-2">
														<span class="text-lg">⚙️</span>
														<span class="font-semibold text-indigo-900">Basic Settings</span>
														<span class="text-xs text-indigo-600">(resolved)</span>
													</div>
												</div>
												<div class="p-4">
													<div
														class="rounded-lg border border-indigo-100 bg-white/80 p-4 shadow-sm"
													>
														<div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
															<div class="flex justify-between">
																<span class="text-gray-600">Guess Time:</span>
																<span class="font-medium text-indigo-900"
																	>{simulation.basicSettings.guessTime}s</span
																>
															</div>
															<div class="flex justify-between">
																<span class="text-gray-600">Extra Guess Time:</span>
																<span class="font-medium text-indigo-900"
																	>{simulation.basicSettings.extraGuessTime}s</span
																>
															</div>
															<div class="flex justify-between">
																<span class="text-gray-600">Sample Point:</span>
																<span class="font-medium text-indigo-900">
																	{#if simulation.basicSettings.samplePoint.kind === 'range'}
																		{simulation.basicSettings.samplePoint.min}-{simulation
																			.basicSettings.samplePoint.max}%
																	{:else}
																		{simulation.basicSettings.samplePoint.value}%
																	{/if}
																</span>
															</div>
															<div class="flex justify-between">
																<span class="text-gray-600">Playback Speed:</span>
																<span class="font-medium text-indigo-900"
																	>{simulation.basicSettings.playbackSpeed}x</span
																>
															</div>
															{#if simulation.basicSettings.modifiers?.length > 0}
																<div class="col-span-2 flex justify-between">
																	<span class="text-gray-600">Modifiers:</span>
																	<span class="font-medium text-indigo-900"
																		>{simulation.basicSettings.modifiers.join(', ')}</span
																	>
																</div>
															{/if}
														</div>
													</div>
												</div>
											</div>
										{/if}

										{#if simulation.numberOfSongs !== null && simulation.numberOfSongs !== undefined}
											<div
												class="rounded-lg border border-red-200 bg-linear-to-r from-red-50 to-red-100 shadow-sm"
											>
												<div class="border-b border-red-200 px-4 py-3">
													<div class="flex items-center gap-2">
														<span class="text-lg">🎵</span>
														<span class="font-semibold text-red-900">Number of Songs</span>
														<span class="text-xs text-red-600">(resolved)</span>
													</div>
												</div>
												<div class="p-4">
													<div
														class="flex items-center justify-center rounded-md border border-red-100 bg-white/70 px-4 py-3"
													>
														<span class="text-lg font-semibold text-red-900">
															{simulation.numberOfSongs} songs
														</span>
													</div>
												</div>
											</div>
										{/if}

										{#if simulation.filters?.length > 0}
											<div
												class="rounded-lg border border-emerald-200 bg-linear-to-r from-emerald-50 to-emerald-100 shadow-sm"
											>
												<div class="border-b border-emerald-200 px-4 py-3">
													<div class="flex items-center gap-2">
														<span class="text-lg">🔍</span>
														<span class="font-semibold text-emerald-900">Filters (Resolved)</span>
													</div>
												</div>
												<div class="space-y-4 p-4">
													{#each simulation.filters as filter}
														<div
															class="rounded-lg border border-emerald-100 bg-white/80 p-4 shadow-sm"
														>
															<div class="mb-3 flex items-center justify-between">
																<span class="font-semibold text-emerald-900 capitalize"
																	>{filter.definitionId.replace('-', ' ')}</span
																>
															</div>

															{#if filter.error}
																<div class="text-xs text-red-600">{filter.error}</div>
															{:else if filter.definitionId === 'songs-and-types' && filter.settings}
																<div class="space-y-2 rounded-md bg-emerald-50/50 p-3">
																	<div class="grid grid-cols-2 gap-4 text-sm">
																		<div class="flex justify-between">
																			<span class="text-gray-600">Total Songs:</span>
																			<span class="font-medium text-emerald-900">
																				{filter.settings.total}
																			</span>
																		</div>
																		<div class="flex justify-between">
																			<span class="text-gray-600">Mode:</span>
																			<span class="font-medium text-emerald-900 capitalize"
																				>{filter.settings.mode}</span
																			>
																		</div>
																	</div>
																	<div class="border-t border-emerald-200 pt-2">
																		<div class="mb-2 text-xs font-medium text-emerald-800">
																			Song Types:
																		</div>
																		<div class="grid grid-cols-3 gap-2">
																			{#each Object.entries(filter.settings.types || {}) as [type, value]}
																				<div
																					class="rounded border border-emerald-200 bg-white px-2 py-1 text-center"
																				>
																					<div class="text-xs text-gray-600 capitalize">{type}</div>
																					<div class="font-medium text-emerald-900">
																						{value}{filter.settings.mode === 'percentage'
																							? '%'
																							: ''}
																					</div>
																				</div>
																			{/each}
																		</div>
																	</div>
																	<div class="border-t border-emerald-200 pt-2">
																		<div class="mb-2 text-xs font-medium text-emerald-800">
																			Song Selection:
																		</div>
																		<div class="grid grid-cols-2 gap-3">
																			<div class="flex justify-between">
																				<span class="text-xs text-gray-600">Random:</span>
																				<span class="text-xs font-medium text-emerald-900">
																					{filter.settings.songSelection.random}{filter.settings
																						.mode === 'percentage'
																						? '%'
																						: ''}
																				</span>
																			</div>
																			<div class="flex justify-between">
																				<span class="text-xs text-gray-600">Watched:</span>
																				<span class="text-xs font-medium text-emerald-900">
																					{filter.settings.songSelection.watched}{filter.settings
																						.mode === 'percentage'
																						? '%'
																						: ''}
																				</span>
																			</div>
																		</div>
																	</div>
																</div>
															{:else if filter.definitionId === 'anime-type' && filter.settings}
																<div class="rounded-md bg-emerald-50/50 p-3">
																	{#if filter.settings.mode === 'basic'}
																		<div class="mb-2 text-xs font-medium text-emerald-800">
																			Enabled Anime Types:
																		</div>
																		<div class="flex flex-wrap gap-1">
																			{#each filter.settings.enabled as type}
																				<span
																					class="rounded bg-emerald-200 px-2 py-1 text-xs font-medium text-emerald-800 uppercase"
																				>
																					{type}
																				</span>
																			{/each}
																		</div>
																	{:else}
																		<div class="mb-2 text-xs font-medium text-emerald-800">
																			Anime Type Values ({filter.settings.mode === 'percentage'
																				? '%'
																				: 'songs'}):
																		</div>
																		<div class="grid grid-cols-2 gap-2">
																			{#each Object.entries(filter.settings.types || {}) as [type, value]}
																				<div
																					class="rounded border border-emerald-200 bg-white px-2 py-1"
																				>
																					<div class="text-xs font-medium text-gray-700 uppercase">
																						{type}
																					</div>
																					<div class="text-xs text-gray-600">
																						{value}{filter.settings.mode === 'percentage'
																							? '%'
																							: ''}
																					</div>
																				</div>
																			{/each}
																		</div>
																	{/if}
																</div>
															{:else if filter.definitionId === 'song-difficulty' && filter.settings && Array.isArray(filter.settings.ranges)}
																<div class="rounded-md bg-emerald-50/50 p-3">
																	<div class="mb-2 text-xs font-medium text-emerald-800">
																		Difficulty Ranges:
																	</div>
																	{#if filter.settings.ranges?.length > 0}
																		<div class="space-y-2">
																			{#each filter.settings.ranges || [] as range, index}
																				<div
																					class="rounded border border-emerald-200 bg-white px-3 py-2"
																				>
																					<div class="flex items-center justify-between">
																						<span class="text-sm font-medium text-emerald-900"
																							>Range {index + 1}</span
																						>
																						<span class="text-sm text-emerald-900"
																							>{range.from}% - {range.to}%</span
																						>
																					</div>
																					<div class="mt-1 text-xs text-gray-600">
																						{range.songCount} songs
																					</div>
																				</div>
																			{/each}
																		</div>
																	{:else}
																		<div class="py-2 text-center text-gray-500">
																			No difficulty ranges configured
																		</div>
																	{/if}
																</div>
															{:else if filter.definitionId === 'vintage' && filter.settings}
																<div class="rounded-md bg-emerald-50/50 p-3">
																	<div class="mb-2 text-xs font-medium text-emerald-800">
																		Vintage Ranges (Resolved):
																	</div>
																	{#if filter.settings.ranges?.length > 0}
																		<div class="space-y-2">
																			{#each filter.settings.ranges as range, index}
																				<div
																					class="rounded border border-emerald-200 bg-white px-3 py-2"
																				>
																					<div class="flex items-center justify-between">
																						<span class="text-sm font-medium text-emerald-900"
																							>Range {index + 1}</span
																						>
																						<span class="text-sm text-emerald-900">
																							{range.from?.season}
																							{range.from?.year} - {range.to?.season}
																							{range.to?.year}
																						</span>
																					</div>
																					<div class="mt-1 text-xs text-emerald-700">
																						{filter.settings.mode === 'percentage'
																							? `${range.value}%`
																							: `${range.value} songs`}
																					</div>
																				</div>
																			{/each}
																		</div>
																	{:else}
																		<div class="py-2 text-center text-gray-500">
																			All years (1944-2025)
																		</div>
																	{/if}
																</div>
															{:else if (filter.definitionId === 'player-score' || filter.definitionId === 'anime-score') && filter.settings}
																<div class="space-y-2 rounded-md bg-emerald-50/50 p-3">
																	<div class="text-xs font-medium text-emerald-800">
																		Score Filter:
																	</div>
																	<div class="grid grid-cols-2 gap-4 text-sm">
																		<div class="flex justify-between">
																			<span class="text-gray-600">Mode:</span>
																			<span class="font-medium text-emerald-900 capitalize"
																				>{filter.settings.mode}</span
																			>
																		</div>
																		<div class="flex justify-between">
																			<span class="text-gray-600">Range:</span>
																			<span class="font-medium text-emerald-900"
																				>{filter.settings.min}-{filter.settings.max}</span
																			>
																		</div>
																	</div>
																	{#if filter.settings.percentages && Object.keys(filter.settings.percentages).length > 0}
																		<div class="border-t border-emerald-200 pt-2">
																			<div class="mb-1 text-xs font-medium text-emerald-800">
																				Per-score Percentage:
																			</div>
																			<div class="flex flex-wrap gap-1">
																				{#each Object.entries(filter.settings.percentages || {}) as [score, val]}
																					<span
																						class="inline-block rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800"
																					>
																						{score}: {val}%
																					</span>
																				{/each}
																			</div>
																		</div>
																	{/if}
																	{#if filter.settings.counts && Object.keys(filter.settings.counts).length > 0}
																		<div class="border-t border-emerald-200 pt-2">
																			<div class="mb-1 text-xs font-medium text-emerald-800">
																				Per-score Count:
																			</div>
																			<div class="flex flex-wrap gap-1">
																				{#each Object.entries(filter.settings.counts || {}) as [score, val]}
																					<span
																						class="inline-block rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800"
																					>
																						{score}: {val}
																					</span>
																				{/each}
																			</div>
																		</div>
																	{/if}
																	{#if filter.settings.disabled?.length > 0}
																		<div class="border-t border-emerald-200 pt-2">
																			<div class="mb-1 text-xs font-medium text-emerald-800">
																				Disabled Scores:
																			</div>
																			<div class="flex flex-wrap gap-1">
																				{#each filter.settings.disabled as score}
																					<span
																						class="inline-block rounded bg-red-200 px-2 py-0.5 text-xs font-medium text-red-800"
																					>
																						{score}
																					</span>
																				{/each}
																			</div>
																		</div>
																	{/if}
																</div>
															{:else if (filter.definitionId === 'genres' || filter.definitionId === 'tags') && filter.settings}
																<div class="rounded-md bg-emerald-50/50 p-3">
																	<div class="mb-2 text-xs font-medium text-emerald-800">
																		{filter.definitionId === 'genres' ? 'Genres' : 'Tags'} Configuration:
																	</div>
																	{#if filter.settings.mode === 'basic'}
																		{#if filter.settings.included?.length > 0 || filter.settings.excluded?.length > 0 || filter.settings.optional?.length > 0}
																			<div class="flex flex-wrap gap-1">
																				{#each filter.settings.included as item}
																					<div
																						class="flex items-center gap-1 rounded bg-green-100 px-2 py-1 text-xs text-green-800"
																					>
																						<span class="font-mono text-xs">+</span>
																						<span>{item}</span>
																					</div>
																				{/each}
																				{#each filter.settings.excluded as item}
																					<div
																						class="flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs text-red-800"
																					>
																						<span class="font-mono text-xs">−</span>
																						<span>{item}</span>
																					</div>
																				{/each}
																				{#each filter.settings.optional as item}
																					<div
																						class="flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs text-amber-800"
																					>
																						<span class="font-mono text-xs">~</span>
																						<span>{item}</span>
																					</div>
																				{/each}
																			</div>
																		{:else}
																			<div class="text-xs text-gray-600">
																				No {filter.definitionId} configured
																			</div>
																		{/if}
																	{:else if filter.settings.showRates && filter.settings.items && filter.settings.items.length > 0}
																		<div class="space-y-1">
																			<div class="text-xs font-medium text-emerald-800">
																				{#if filter.definitionId === 'genres' || filter.definitionId === 'tags'}
																					Advanced Mode:
																				{:else}
																					Advanced Mode ({filter.settings.mode === 'percentage'
																						? 'Percentage'
																						: 'Count'}):
																				{/if}
																			</div>
																			<div class="flex flex-wrap gap-1">
																				{#each filter.settings.items as item}
																					<div
																						class="flex items-center gap-1 rounded px-2 py-1 text-xs {item.status ===
																						'include'
																							? 'bg-green-100 text-green-800'
																							: item.status === 'exclude'
																								? 'bg-red-100 text-red-800'
																								: 'bg-amber-100 text-amber-800'}"
																					>
																						<span class="font-mono text-xs">
																							{item.status === 'include'
																								? '+'
																								: item.status === 'exclude'
																									? '−'
																									: '~'}
																						</span>
																						<span>{item.label}</span>
																						<span class="font-semibold">
																							{item.value}
																							{#if filter.definitionId !== 'genres' && filter.definitionId !== 'tags' && filter.settings.mode === 'percentage'}
																								%
																							{/if}
																						</span>
																					</div>
																				{/each}
																			</div>
																		</div>
																	{:else}
																		<div class="text-xs text-gray-600">
																			Advanced mode enabled but no {filter.definitionId} configured
																		</div>
																	{/if}
																</div>
															{:else if filter.definitionId === 'song-categories' && filter.settings}
																<div class="rounded-md bg-emerald-50/50 p-3">
																	{#if filter.settings.mode === 'basic'}
																		<div class="mb-2 text-xs font-medium text-emerald-800">
																			Song Category Status:
																		</div>
																		<div class="space-y-2">
																			{#each ['openings', 'endings', 'inserts'] as row}
																				<div>
																					<div
																						class="mb-1 text-xs font-medium text-gray-700 capitalize"
																					>
																						{row}:
																					</div>
																					<div class="flex flex-wrap gap-1">
																						{#each ['standard', 'instrumental', 'chanting', 'character'] as catName}
																							{@const enabled =
																								filter.settings.enabled?.[row]?.[catName] || false}
																							<div
																								class="inline-block rounded border border-emerald-200 bg-white px-2 py-1 text-center"
																							>
																								<div class="text-xs font-medium text-gray-700">
																									{catName}
																								</div>
																								<div
																									class="text-xs {enabled
																										? 'text-green-600'
																										: 'text-red-600'}"
																								>
																									{enabled ? '✓' : '✗'}
																								</div>
																							</div>
																						{/each}
																					</div>
																				</div>
																			{/each}
																		</div>
																	{:else}
																		<div class="mb-2 text-xs font-medium text-emerald-800">
																			Category Values ({filter.settings.mode === 'percentage'
																				? '%'
																				: 'songs'}):
																		</div>
																		<div class="space-y-2">
																			{#each ['openings', 'endings', 'inserts'] as row}
																				<div>
																					<div
																						class="mb-1 text-xs font-medium text-gray-700 capitalize"
																					>
																						{row}:
																					</div>
																					<div class="flex flex-wrap gap-1">
																						{#each Object.entries(filter.settings.categories?.[row] || {}) as [catName, value]}
																							<span
																								class="inline-block rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800"
																							>
																								{catName}: {value}{filter.settings.mode ===
																								'percentage'
																									? '%'
																									: ''}
																							</span>
																						{/each}
																					</div>
																				</div>
																			{/each}
																		</div>
																	{/if}
																</div>
															{/if}
														</div>
													{/each}
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{:else}
							<div class="text-sm text-gray-600">
								<p>⚠️ Simulation data not available</p>
								<p class="mt-2 text-xs">
									Unable to generate simulation. Please try refreshing the page.
								</p>
							</div>
						{/if}
					</Tabs.Content>

					<!-- Tab 2: Selected Songs -->
					<Tabs.Content value="songs" class="">
						{#if loadingSongs}
							<div class="flex flex-col items-center justify-center py-12">
								<Loader2 class="h-8 w-8 animate-spin text-blue-500" />
								<p class="mt-4 text-sm text-gray-600">Generating songs...</p>
							</div>
						{:else if generationError}
							<!-- Error Display -->
							<div class="space-y-4">
								<div class="rounded-lg border border-red-200 bg-red-50 p-4">
									<div class="mb-3 flex items-start gap-3">
										<AlertCircle class="h-5 w-5 shrink-0 text-red-600" />
										<div class="flex-1">
											<h4 class="mb-1 text-sm font-semibold text-red-900">
												Song Generation Failed
											</h4>
											<p class="text-sm text-red-800">
												{generationError.userMessage}
											</p>
										</div>
									</div>

									<!-- Technical Details (Expandable) -->
									{#if generationError.technicalDetails && Object.keys(generationError.technicalDetails).length > 0}
										<div class="mt-3 border-t border-red-200 pt-3">
											<button
												onclick={() => (showTechnicalDetails = !showTechnicalDetails)}
												class="flex w-full items-center justify-between text-left text-sm font-medium text-red-900 hover:text-red-700"
											>
												<span>Technical Details</span>
												{#if showTechnicalDetails}
													<ChevronDown class="h-4 w-4" />
												{:else}
													<ChevronRight class="h-4 w-4" />
												{/if}
											</button>

											{#if showTechnicalDetails}
												<div class="mt-3 rounded bg-red-100/50 p-3 text-xs">
													{#if generationError.technicalDetails.targetCount !== undefined}
														<div class="mb-2">
															<span class="font-semibold">Target Songs:</span>
															<span class="ml-2"
																>{generationError.technicalDetails.targetCount}</span
															>
														</div>
													{/if}

													{#if generationError.technicalDetails.finalCount !== undefined}
														<div class="mb-2">
															<span class="font-semibold">Generated Songs:</span>
															<span class="ml-2">{generationError.technicalDetails.finalCount}</span
															>
														</div>
													{/if}

													{#if generationError.technicalDetails.eligibleSongCount !== undefined}
														<div class="mb-2">
															<span class="font-semibold">Eligible Songs:</span>
															<span class="ml-2"
																>{generationError.technicalDetails.eligibleSongCount}</span
															>
														</div>
													{/if}

													{#if generationError.technicalDetails.sourceSongCount !== undefined}
														<div class="mb-2">
															<span class="font-semibold">Total Songs in List:</span>
															<span class="ml-2"
																>{generationError.technicalDetails.sourceSongCount}</span
															>
														</div>
													{/if}

													<!-- Summary Box -->
													<div class="mb-3 rounded bg-white/80 p-2">
														<div class="mb-1 font-semibold text-red-900">Generation Summary:</div>
														<div class="space-y-1">
															{#if generationError.technicalDetails.sourceSongCount !== undefined}
																<div class="flex items-center gap-2">
																	<span class="w-32">Starting songs:</span>
																	<span class="font-semibold"
																		>{generationError.technicalDetails.sourceSongCount.toLocaleString()}</span
																	>
																</div>
															{/if}
															{#if generationError.technicalDetails.eligibleSongCount !== undefined}
																<div class="flex items-center gap-2">
																	<span class="w-32">After filters:</span>
																	<span
																		class="font-semibold {generationError.technicalDetails
																			.eligibleSongCount === 0
																			? 'text-red-700'
																			: ''}"
																	>
																		{generationError.technicalDetails.eligibleSongCount}
																	</span>
																</div>
															{/if}
															{#if generationError.technicalDetails.targetCount !== undefined}
																<div class="flex items-center gap-2">
																	<span class="w-32">Target songs:</span>
																	<span class="font-semibold"
																		>{generationError.technicalDetails.targetCount}</span
																	>
																</div>
															{/if}
															{#if generationError.technicalDetails.finalCount !== undefined}
																<div class="flex items-center gap-2">
																	<span class="w-32">Final result:</span>
																	<span class="font-semibold text-red-700"
																		>{generationError.technicalDetails.finalCount}</span
																	>
																</div>
															{/if}
														</div>
													</div>

													{#if generationError.technicalDetails.failedBaskets && generationError.technicalDetails.failedBaskets.length > 0}
														<div class="mt-3 border-t border-red-300 pt-2">
															<div class="mb-1 font-semibold">Failed Requirements:</div>
															<div class="space-y-1">
																{#each generationError.technicalDetails.failedBaskets as basket}
																	<div class="rounded bg-white/60 px-2 py-1">
																		<span class="font-mono text-xs">{basket.id}</span>
																		<span class="ml-2 text-red-700">
																			({basket.current}/{basket.min} required)
																		</span>
																	</div>
																{/each}
															</div>
														</div>
													{/if}

													{#if generationError.technicalDetails.basketStatus && generationError.technicalDetails.basketStatus.length > 0}
														<div class="mt-3 border-t border-red-300 pt-2">
															<div class="mb-1 font-semibold">All Requirements Status:</div>
															<div class="space-y-1">
																{#each generationError.technicalDetails.basketStatus as basket}
																	<div class="rounded bg-white/60 px-2 py-1">
																		<span
																			class={basket.meetsMin ? 'text-green-700' : 'text-red-700'}
																		>
																			{basket.meetsMin ? '✓' : '✗'}
																		</span>
																		<span class="ml-2 font-mono text-xs">{basket.id}</span>
																		<span class="ml-2 text-gray-700">
																			{basket.current}/{basket.min}-{basket.max}
																		</span>
																	</div>
																{/each}
															</div>
														</div>
													{/if}

													{#if generationError.technicalDetails.filterStatistics && generationError.technicalDetails.filterStatistics.length > 0}
														<div class="mt-3 border-t border-red-300 pt-2">
															<div class="mb-1 font-semibold">Filter Breakdown:</div>
															<div class="space-y-2">
																{#each generationError.technicalDetails.filterStatistics as filter}
																	<div class="rounded bg-white/60 px-2 py-1.5">
																		<div class="flex items-center justify-between">
																			<span class="font-semibold">{filter.name}</span>
																			<span class="text-red-700">
																				{filter.before} → {filter.after} ({filter.removed} removed)
																			</span>
																		</div>
																		{#if filter.details}
																			<div class="mt-1 text-xs text-gray-600">
																				{#if filter.details.included}
																					<div>
																						✓ Included: {filter.details.included.join(', ')}
																					</div>
																				{/if}
																				{#if filter.details.excluded}
																					<div>
																						✗ Excluded: {filter.details.excluded.join(', ')}
																					</div>
																				{/if}
																				{#if filter.details.optional}
																					<div>
																						~ Optional: {filter.details.optional.join(', ')}
																					</div>
																				{/if}
																				{#if filter.details.range}
																					<div>Range: {filter.details.range}</div>
																				{/if}
																				{#if filter.details.disabled}
																					<div>Disabled: {filter.details.disabled.join(', ')}</div>
																				{/if}
																				{#if filter.details.enabled}
																					<div>Enabled: {filter.details.enabled.join(', ')}</div>
																				{/if}
																				{#if filter.details.threshold}
																					<div>Threshold: {filter.details.threshold}</div>
																				{/if}
																			</div>
																		{/if}
																	</div>
																{/each}
															</div>
														</div>
													{/if}

													{#if generationError.technicalDetails.error}
														<div class="mt-3 border-t border-red-300 pt-2">
															<div class="mb-1 font-semibold">Error:</div>
															<div class="rounded bg-white/60 px-2 py-1 font-mono text-xs">
																{generationError.technicalDetails.error}
															</div>
														</div>
													{/if}
												</div>
											{/if}
										</div>
									{/if}

									<!-- Retry Button -->
									<div class="mt-4">
										<Button
											onclick={generateSongs}
											class="w-full"
											variant="destructive"
											disabled={false}
										>
											Try Again
										</Button>
									</div>
								</div>

								<!-- Show partial results if any songs were found -->
								{#if selectedSongs && selectedSongs.length > 0}
									<div class="mt-4">
										<Separator class="mb-4" />
										<div class="mb-2 flex items-center gap-2">
											<h4 class="text-sm font-semibold text-gray-700">
												Partial Results ({selectedSongs.length} songs found)
											</h4>
										</div>
										<SongsList songs={selectedSongs} />
									</div>
								{/if}
							</div>
						{:else if selectedSongs && selectedSongs.length > 0}
							<!-- Songs List -->
							<SongsList songs={selectedSongs} />
						{:else}
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<p class="mb-4 text-sm text-gray-600">No songs generated yet.</p>
								<Button onclick={generateSongs} disabled={!savedQuizId} class="">
									Generate Songs
								</Button>
							</div>
						{/if}
					</Tabs.Content>
				</Tabs.Root>
			</div>
		</div>
	</div>
{/if}
