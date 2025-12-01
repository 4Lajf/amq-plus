<script>
	/**
	 * Dialog for configuring sample range of a song.
	 * Allows users to select start/end points within the song for AMQ gameplay.
	 *
	 * @component
	 */

	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import RangeSlider from 'svelte-range-slider-pips';
	import { toast } from 'svelte-sonner';
	import { Plus, Trash2, Play, Pause, Gauge, Clock } from 'lucide-svelte';

	/**
	 * Song object with sample range configuration.
	 * @typedef {Object} SongWithSample
	 * @property {number} sampleStart - Sample start time in seconds
	 * @property {number} sampleEnd - Sample end time in seconds
	 * @property {number} [songLength] - Total song length in seconds
	 * @property {string} [HQ] - High quality video filename
	 * @property {string} songName - Song title
	 * @property {string} songArtist - Artist name
	 * @property {number} [guessTime] - Guess time in seconds
	 * @property {{mode: 'static'|'random', staticValue: number, randomValues: number[]}} [playbackSpeed] - Playback speed configuration
	 */

	/**
	 * Component props.
	 * @type {{
	 *   open: boolean,
	 *   song: EnrichedSong | null,
	 *   onSave?: (song: EnrichedSong) => void
	 * }}
	 */
	let { open = $bindable(false), song = $bindable(), onSave } = $props();

	let videoElement = $state(null);
	let currentTime = $state(0);
	let duration = $state(0);
	let videoError = $state(null);
	let isLoading = $state(true);
	let currentMediaType = $state('HQ'); // Track which media type is currently being used
	let currentMediaUrl = $state(null);
	let isPlaying = $state(false);

	// Opt-in state for custom settings
	let useCustomSampleRanges = $state(false);
	let useCustomGuessTime = $state(false);

	// Sample ranges state
	let sampleRanges = $state([]);
	let selectedRangeIndex = $state(0);

	// Playback speed state
	const speedOptions = [
		{ value: 1.0, label: '1x' },
		{ value: 1.5, label: '1.5x' },
		{ value: 2.0, label: '2x' },
		{ value: 4.0, label: '4x' }
	];
	let playbackSpeed = $state({ mode: 'static', staticValue: 1.0, randomValues: [1.0] });

	// Guess time state
	let guessTime = $state(20);
	let extraGuessTime = $state(0);
	let guessTimeUseRange = $state(false);
	let guessTimeMin = $state(15);
	let guessTimeMax = $state(25);
	let extraGuessTimeUseRange = $state(false);
	let extraGuessTimeMin = $state(0);
	let extraGuessTimeMax = $state(5);
	const MIN_GUESS_TIME = 1;
	const MAX_GUESS_TIME = 60;
	const MIN_EXTRA_GUESS_TIME = 0;
	const MAX_EXTRA_GUESS_TIME = 15;

	const SLIDER_MIN = 0;
	const SLIDER_STEP = 0.1;
	const SLIDER_PRECISION = 1;

	function getSliderMax() {
		return duration || song?.songLength || 90;
	}

	// Get current selected range
	let currentRange = $derived(
		sampleRanges[selectedRangeIndex] || { start: 0, end: 90, randomStartPosition: false }
	);

	// Initialize sample ranges from song data
	function initializeSampleRanges() {
		if (!song) return;

		// Check if song has custom sample ranges (opt-in)
		const hasCustomSampleRanges =
			song.sampleRanges && Array.isArray(song.sampleRanges) && song.sampleRanges.length > 0;

		useCustomSampleRanges = hasCustomSampleRanges;

		if (hasCustomSampleRanges) {
			sampleRanges = [...song.sampleRanges];
		} else {
			// Initialize with default values for editing (not saved unless user opts in)
			// When randomStartPosition is false, start is at 0, end is song length
			const songLength = song.songLength || 90;
			sampleRanges = [
				{
					start: 0,
					end: songLength,
					randomStartPosition: false
				}
			];
		}

		selectedRangeIndex = 0;

		// Initialize playback speed
		if (/** @type {any} */ (song).playbackSpeed) {
			playbackSpeed = /** @type {any} */ (song).playbackSpeed;
		} else {
			playbackSpeed = { mode: 'static', staticValue: 1.0, randomValues: [1.0] };
		}

		// Check if song has custom guess time (opt-in)
		/** @type {any} */
		const enrichedSong = song;
		useCustomGuessTime =
			enrichedSong.guessTime !== undefined || enrichedSong.extraGuessTime !== undefined;

		// Initialize guess time (for display/editing)
		const songLength = song.songLength || 90;

		// Check if guess time is a range object
		if (enrichedSong.guessTime !== undefined) {
			if (typeof enrichedSong.guessTime === 'object' && enrichedSong.guessTime !== null && enrichedSong.guessTime.useRange) {
				guessTimeUseRange = true;
				guessTimeMin = enrichedSong.guessTime.min ?? 15;
				guessTimeMax = enrichedSong.guessTime.max ?? 25;
				guessTime = guessTimeMin; // Default to min for display
			} else {
				guessTimeUseRange = false;
				guessTime =
					typeof enrichedSong.guessTime === 'number' ? enrichedSong.guessTime : songLength;
			}
		} else {
			guessTimeUseRange = false;
			guessTime = songLength;
		}

		// Check if extra guess time is a range object
		if (enrichedSong.extraGuessTime !== undefined) {
			if (typeof enrichedSong.extraGuessTime === 'object' && enrichedSong.extraGuessTime !== null && enrichedSong.extraGuessTime.useRange) {
				extraGuessTimeUseRange = true;
				extraGuessTimeMin = enrichedSong.extraGuessTime.min ?? 0;
				extraGuessTimeMax = enrichedSong.extraGuessTime.max ?? 5;
				extraGuessTime = extraGuessTimeMin; // Default to min for display
			} else {
				extraGuessTimeUseRange = false;
				extraGuessTime =
					typeof enrichedSong.extraGuessTime === 'number' ? enrichedSong.extraGuessTime : 0;
			}
		} else {
			extraGuessTimeUseRange = false;
			extraGuessTime = 0;
		}
	}

	// Add new sample range
	function addSampleRange() {
		const songLength = song?.songLength || 90;
		const newRange = {
			start: 0,
			end: songLength,
			randomStartPosition: false
		};
		sampleRanges = [...sampleRanges, newRange];
		selectedRangeIndex = sampleRanges.length - 1;
	}

	function removeSampleRange(index) {
		if (sampleRanges.length <= 1) {
			toast.error('At least one sample range is required');
			return;
		}

		sampleRanges = sampleRanges.filter((_, i) => i !== index);

		// Adjust selected index if needed
		if (selectedRangeIndex >= sampleRanges.length) {
			selectedRangeIndex = sampleRanges.length - 1;
		}
	}

	// Get the best available media URL with fallback logic
	function getBestMediaUrl() {
		if (!song) return null;

		// Try HQ first
		if (song.HQ) {
			return {
				url: `https://naedist.animemusicquiz.com/${song.HQ}`,
				type: 'HQ',
				description: 'High Quality Video'
			};
		}

		// Fallback to MQ
		if (song.MQ) {
			return {
				url: `https://naedist.animemusicquiz.com/${song.MQ}`,
				type: 'MQ',
				description: 'Medium Quality Video'
			};
		}

		// Fallback to audio
		if (song.audio) {
			return {
				url: `https://naedist.animemusicquiz.com/${song.audio}`,
				type: 'audio',
				description: 'Audio Only'
			};
		}

		return null;
	}

	// Try to load media with fallback
	function tryLoadMedia() {
		const mediaInfo = getBestMediaUrl();
		if (!mediaInfo) {
			videoError = 'No media files available for this song.';
			isLoading = false;
			return;
		}

		currentMediaType = mediaInfo.type;
		currentMediaUrl = mediaInfo.url;
		videoError = null;
		isLoading = true;

		// Set the video source
		if (videoElement) {
			videoElement.src = currentMediaUrl;
			videoElement.load();
		}
	}

	function clampToRange(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	function normalizeToStep(value) {
		const max = getSliderMax();
		const clamped = clampToRange(value, SLIDER_MIN, max);
		const rounded = Math.round(clamped / SLIDER_STEP) * SLIDER_STEP;
		return Number(clampToRange(rounded, SLIDER_MIN, max).toFixed(SLIDER_PRECISION));
	}

	function handleStartInput(event) {
		const parsed = parseFloat(event.currentTarget.value);
		if (Number.isNaN(parsed)) {
			event.currentTarget.value = formatSeconds(currentRange.start);
			return;
		}

		let normalized = normalizeToStep(parsed);

		if (normalized > currentRange.end) {
			handleEndChange(normalized);
		}

		handleStartChange(normalized);
		event.currentTarget.value = formatSeconds(normalized);
	}

	function handleEndInput(event) {
		const parsed = parseFloat(event.currentTarget.value);
		if (Number.isNaN(parsed)) {
			event.currentTarget.value = formatSeconds(currentRange.end);
			return;
		}

		let normalized = normalizeToStep(parsed);

		if (normalized < currentRange.start) {
			handleStartChange(normalized);
		}

		handleEndChange(normalized);
		event.currentTarget.value = formatSeconds(normalized);
	}

	function formatSeconds(value) {
		return Number.isFinite(value) ? value.toFixed(SLIDER_PRECISION) : '0.0';
	}

	function getPipStep() {
		const max = getSliderMax();
		const range = Math.max(max - SLIDER_MIN, SLIDER_STEP);

		if (range <= 0) {
			return 1;
		}

		const totalSteps = range / SLIDER_STEP;
		const desiredPips = 4;
		const rawStep = totalSteps / desiredPips;
		return Math.max(1, Math.round(rawStep));
	}

	// Initialize values when song changes
	$effect(() => {
		if (song) {
			initializeSampleRanges();
			videoError = null;
			isLoading = true;
			// Try to load the best available media
			tryLoadMedia();
		}
	});

	// Update current time from video
	function handleTimeUpdate() {
		if (videoElement) {
			currentTime = videoElement.currentTime;
		}
	}

	// Update duration when video loads
	function handleLoadedMetadata() {
		if (videoElement) {
			duration = videoElement.duration;
			// If any sample range end is greater than actual duration, clamp it
			sampleRanges = sampleRanges.map((range) => ({
				...range,
				end: Math.min(range.end, duration)
			}));
			isLoading = false;
		}
	}

	// Handle video load error with fallback logic
	function handleVideoError(e) {
		console.error('Media load error:', e);

		// Try fallback media if current one failed
		if (currentMediaType === 'HQ' && song.MQ) {
			console.log('HQ failed, trying MQ...');
			currentMediaType = 'MQ';
			currentMediaUrl = `https://naedist.animemusicquiz.com/${song.MQ}`;
			videoElement.src = currentMediaUrl;
			videoElement.load();
			return;
		} else if ((currentMediaType === 'HQ' || currentMediaType === 'MQ') && song.audio) {
			console.log('Video failed, trying audio...');
			currentMediaType = 'audio';
			currentMediaUrl = `https://naedist.animemusicquiz.com/${song.audio}`;
			videoElement.src = currentMediaUrl;
			videoElement.load();
			return;
		}

		// All fallbacks failed
		videoError = `Failed to load ${currentMediaType.toLowerCase()} media. No fallback available.`;
		isLoading = false;
		toast.error(`Failed to load ${currentMediaType.toLowerCase()} media`);
	}

	// Handle start handle change
	function handleStartChange(newStart) {
		if (currentRange) {
			currentRange.start = newStart;
			if (videoElement && videoElement.currentTime < newStart) {
				videoElement.currentTime = newStart;
			}
		}
	}

	// Handle end handle change
	function handleEndChange(newEnd) {
		if (currentRange) {
			currentRange.end = newEnd;
			if (videoElement && videoElement.currentTime > newEnd) {
				videoElement.currentTime = newEnd;
			}
		}
	}

	// Handle range slider change
	function handleRangeChange(e) {
		const [start, end] = e.detail.values;
		if (start !== currentRange.start) {
			handleStartChange(start);
		}
		if (end !== currentRange.end) {
			handleEndChange(end);
		}
	}

	// Toggle play/pause
	function togglePlayPause() {
		if (!videoElement) return;

		if (isPlaying) {
			videoElement.pause();
		} else {
			videoElement.play();
		}
		isPlaying = !isPlaying;
	}

	// Jump to range start
	function jumpToStart() {
		if (videoElement && currentRange) {
			videoElement.currentTime = currentRange.start;
		}
	}

	// Jump to range end
	function jumpToEnd() {
		if (videoElement && currentRange) {
			videoElement.currentTime = currentRange.end;
		}
	}

	function removeCustomSettings() {
		if (!song) return;

		delete song.sampleRanges;

		/** @type {any} */
		const enrichedSong = song;
		delete enrichedSong.guessTime;
		delete enrichedSong.guessTimeRandom;
		delete enrichedSong.extraGuessTime;

		useCustomSampleRanges = false;
		useCustomGuessTime = false;

		// Reset to defaults for display
		const songLength = song.songLength || 90;
		sampleRanges = [{ start: 0, end: songLength, randomStartPosition: false }];
		guessTime = songLength;
		extraGuessTime = 0;
		guessTimeUseRange = false;
		guessTimeMin = 15;
		guessTimeMax = 25;
		extraGuessTimeUseRange = false;
		extraGuessTimeMin = 0;
		extraGuessTimeMax = 5;

		onSave?.(song);
		toast.success('Custom settings removed - song will inherit from quiz-wide settings');
	}

	// Save changes
	function handleSave() {
		if (!song) {
			open = false;
			return;
		}

		// Save custom sample ranges only if opted in
		if (useCustomSampleRanges && sampleRanges.length > 0) {
			song.sampleRanges = sampleRanges;
		} else {
			// Remove custom sample ranges to allow inheritance
			delete song.sampleRanges;
		}

		// Save custom guess time only if opted in
		/** @type {any} */
		const enrichedSong = song;
		if (useCustomGuessTime) {
			// Save guess time (static or range)
			if (guessTimeUseRange) {
				const clampedMin = Math.min(Math.max(MIN_GUESS_TIME, guessTimeMin), MAX_GUESS_TIME);
				const clampedMax = Math.min(Math.max(MIN_GUESS_TIME, guessTimeMax), MAX_GUESS_TIME);
				enrichedSong.guessTime = {
					useRange: true,
					min: Math.min(clampedMin, clampedMax),
					max: Math.max(clampedMin, clampedMax)
				};
			} else {
				const clampedGuessTime = Math.min(Math.max(MIN_GUESS_TIME, guessTime), MAX_GUESS_TIME);
				enrichedSong.guessTime = clampedGuessTime;
			}

			// Save extra guess time (static or range)
			if (extraGuessTimeUseRange) {
				const clampedMin = Math.min(
					Math.max(MIN_EXTRA_GUESS_TIME, extraGuessTimeMin),
					MAX_EXTRA_GUESS_TIME
				);
				const clampedMax = Math.min(
					Math.max(MIN_EXTRA_GUESS_TIME, extraGuessTimeMax),
					MAX_EXTRA_GUESS_TIME
				);
				enrichedSong.extraGuessTime = {
					useRange: true,
					min: Math.min(clampedMin, clampedMax),
					max: Math.max(clampedMin, clampedMax)
				};
			} else {
				const clampedExtraGuessTime = Math.min(
					Math.max(MIN_EXTRA_GUESS_TIME, extraGuessTime),
					MAX_EXTRA_GUESS_TIME
				);
				enrichedSong.extraGuessTime = clampedExtraGuessTime;
			}
		} else {
			// Remove custom guess time to allow inheritance
			delete enrichedSong.guessTime;
			delete enrichedSong.guessTimeRandom;
			delete enrichedSong.extraGuessTime;
		}

		// Save playback speed (always save if configured)
		/** @type {any} */ (song).playbackSpeed = playbackSpeed;

		onSave?.(song);
		toast.success('Settings saved');
		open = false;
	}

	// Handle playback speed toggle
	function handleSpeedToggle(speedValue, checked) {
		if (checked) {
			// Add speed if not already included
			if (!playbackSpeed.randomValues.includes(speedValue)) {
				playbackSpeed.randomValues = [...playbackSpeed.randomValues, speedValue].sort(
					(a, b) => a - b
				);
			}
		} else {
			// Remove speed, but ensure at least one remains
			if (playbackSpeed.randomValues.length > 1) {
				playbackSpeed.randomValues = playbackSpeed.randomValues.filter((v) => v !== speedValue);
			}
		}

		// Update mode based on number of selected speeds
		playbackSpeed.mode = playbackSpeed.randomValues.length > 1 ? 'random' : 'static';
		playbackSpeed.staticValue = playbackSpeed.randomValues[0] || 1.0;
	}

	// Format time as MM:SS.ms
	function formatTime(seconds) {
		if (!isFinite(seconds)) return '0:00.0';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const ms = Math.floor((seconds % 1) * 10);
		return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
	}
</script>

<Dialog bind:open>
	<DialogContent class="max-h-[90vh] w-[95vw] max-w-6xl" portalProps={{}}>
		<DialogHeader class="pb-3">
			<DialogTitle class="text-lg">Configure Song Settings</DialogTitle>
			<DialogDescription class="text-xs">
				{#if song}
					{song.songName} by {song.songArtist}
				{:else}
					Configure song settings
				{/if}
			</DialogDescription>
		</DialogHeader>

		<div class="max-h-[calc(90vh-180px)] overflow-y-auto pr-2">
			<div class="space-y-3">
				{#if song}
					{#if videoError}
						<div class="rounded-md bg-red-50 p-2 text-xs text-red-800">
							<strong>Error:</strong>
							{videoError}
						</div>
					{:else}
						<!-- Compact Grid Layout -->
						<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
							<!-- Left: Media Player -->
							<div class="space-y-2">
								{#if currentMediaType}
									<div class="rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">
										<strong>{getBestMediaUrl()?.description || `${currentMediaType} Media`}</strong>
									</div>
								{/if}
								<div class="flex items-center gap-1.5">
									<Button
										variant="outline"
										size="sm"
										onclick={togglePlayPause}
										disabled={isLoading}
										class="h-7 px-2"
									>
										{#if isPlaying}
											<Pause class="h-3 w-3" />
										{:else}
											<Play class="h-3 w-3" />
										{/if}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={jumpToStart}
										disabled={isLoading}
										class="h-7 px-2 text-xs"
									>
										Start
									</Button>
									<Button
										variant="outline"
										size="sm"
										onclick={jumpToEnd}
										disabled={isLoading}
										class="h-7 px-2 text-xs"
									>
										End
									</Button>
									<span class="text-xs text-gray-600">
										{formatTime(currentTime)} / {formatTime(duration)}
									</span>
								</div>
								<div class="relative overflow-hidden rounded-lg bg-black">
									{#if isLoading}
										<div
											class="absolute inset-0 flex items-center justify-center bg-gray-900 text-white"
										>
											<div class="text-xs">Loading...</div>
										</div>
									{/if}
									<video
										bind:this={videoElement}
										src={currentMediaUrl}
										controls
										class="h-auto w-full"
										ontimeupdate={handleTimeUpdate}
										onloadedmetadata={handleLoadedMetadata}
										onerror={handleVideoError}
										preload="metadata"
									>
										<track kind="captions" />
									</video>
								</div>
							</div>

							<!-- Right: Settings Compact -->
							<div class="space-y-2">
								<!-- Custom Sample Ranges Opt-in -->
								<div class="rounded border bg-gray-50 p-2">
									<div class="mb-2 flex items-center justify-between">
										<div class="flex items-center gap-2">
											<Checkbox
												id="use-custom-sample-ranges"
												bind:checked={useCustomSampleRanges}
												class="h-4 w-4"
											/>
											<Label
												for="use-custom-sample-ranges"
												class="cursor-pointer text-sm font-semibold"
											>
												Use Custom Sample Ranges
											</Label>
										</div>
										{#if useCustomSampleRanges}
											<Button
												variant="outline"
												size="sm"
												onclick={addSampleRange}
												class="h-6 gap-1 px-2 text-xs"
												disabled={false}
											>
												<Plus class="h-3 w-3" />
												Add
											</Button>
										{/if}
									</div>

									{#if !useCustomSampleRanges}
										<div
											class="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700"
										>
											Song will inherit sample ranges from quiz-wide settings.
										</div>
									{:else}
										{#if sampleRanges.length > 1}
											<div class="mb-2 flex flex-wrap gap-1">
												{#each sampleRanges as range, index}
													<Button
														variant={selectedRangeIndex === index ? 'default' : 'outline'}
														size="sm"
														onclick={() => (selectedRangeIndex = index)}
														class="h-6 px-2 text-xs"
														disabled={false}
													>
														Range {index + 1}
														{#if index !== selectedRangeIndex}
															<Button
																variant="ghost"
																size="sm"
																onclick={(e) => {
																	e.stopPropagation();
																	removeSampleRange(index);
																}}
																class="ml-1 h-4 w-4 p-0 text-red-600 hover:text-red-800"
																disabled={false}
															>
																<Trash2 class="h-2.5 w-2.5" />
															</Button>
														{/if}
													</Button>
												{/each}
											</div>
										{/if}

										{#if currentRange}
											<div class="space-y-2">
												<div class="flex flex-wrap items-center gap-2 text-xs">
													<span><strong>Start:</strong> {formatTime(currentRange.start)}</span>
													<span><strong>End:</strong> {formatTime(currentRange.end)}</span>
													<span class="text-primary font-semibold"
														><strong>Duration:</strong>
														{formatTime(currentRange.end - currentRange.start)}</span
													>
												</div>

												<!-- Random Start Position Checkbox -->
												<div
													class="flex items-center space-x-1.5 rounded-md border border-gray-200 bg-white p-2"
												>
													<Checkbox
														id="random-start-position"
														bind:checked={currentRange.randomStartPosition}
														onCheckedChange={(checked) => {
															currentRange.randomStartPosition = checked;
															// When unchecked, set end to song length
															if (!checked) {
																const max = getSliderMax();
																currentRange.end = max;
															}
														}}
														class="h-4 w-4"
													/>
													<Label for="random-start-position" class="cursor-pointer text-xs">
														Random Start Position
													</Label>
												</div>

												{#if currentRange.randomStartPosition}
													<!-- Two-handle range slider for random start position -->
													<div class="grid grid-cols-2 gap-2">
														<div class="space-y-0.5">
															<Label for="start-input" class="text-[10px]">Start Range (s)</Label>
															<Input
																id="start-input"
																type="number"
																value={formatSeconds(currentRange.start)}
																min={SLIDER_MIN}
																max={formatSeconds(currentRange.end)}
																step={SLIDER_STEP}
																on:change={handleStartInput}
																class="h-7 text-xs"
															/>
														</div>
														<div class="space-y-0.5">
															<Label for="end-input" class="text-[10px]">End (s)</Label>
															<Input
																id="end-input"
																type="number"
																value={formatSeconds(currentRange.end)}
																min={formatSeconds(currentRange.start)}
																max={formatSeconds(getSliderMax())}
																step={SLIDER_STEP}
																on:change={handleEndInput}
																class="h-7 text-xs"
															/>
														</div>
													</div>
													<div class="px-1 py-2">
														<RangeSlider
															values={[currentRange.start, currentRange.end]}
															min={SLIDER_MIN}
															max={getSliderMax()}
															step={SLIDER_STEP}
															range
															pips
															pipstep={getPipStep()}
															all="label"
															suffix="s"
															on:change={handleRangeChange}
															--slider="rgb(59, 130, 246)"
															--handle="rgb(59, 130, 246)"
															--range="rgb(59, 130, 246)"
															--progress="rgb(59, 130, 246)"
														/>
													</div>
												{:else}
													<!-- Single-handle slider (controls start position, end is set to songLength) -->
													<div class="space-y-0.5">
														<Label for="start-input" class="text-[10px]">Start (s)</Label>
														<Input
															id="start-input"
															type="number"
															value={formatSeconds(currentRange.start)}
															min={SLIDER_MIN}
															max={formatSeconds(getSliderMax())}
															step={SLIDER_STEP}
															on:change={(e) => {
																const parsed = parseFloat(e.currentTarget.value);
																if (!Number.isNaN(parsed)) {
																	const normalized = normalizeToStep(parsed);
																	const max = getSliderMax();
																	currentRange.start = normalized;
																	currentRange.end = max; // End is always song length when random start is off
																	if (videoElement && videoElement.currentTime < normalized) {
																		videoElement.currentTime = normalized;
																	}
																	e.currentTarget.value = formatSeconds(normalized);
																}
															}}
															class="h-7 text-xs"
														/>
													</div>
													<div class="px-1 py-2">
														<RangeSlider
															values={[currentRange.start]}
															min={SLIDER_MIN}
															max={getSliderMax()}
															step={SLIDER_STEP}
															pips
															pipstep={getPipStep()}
															all="label"
															suffix="s"
															on:change={(e) => {
																const newStart = e.detail.values[0];
																const max = getSliderMax();
																currentRange.start = newStart;
																currentRange.end = max; // End is always song length when random start is off
																if (videoElement && videoElement.currentTime < newStart) {
																	videoElement.currentTime = newStart;
																}
															}}
															--slider="rgb(59, 130, 246)"
															--handle="rgb(59, 130, 246)"
															--range="rgb(59, 130, 246)"
															--progress="rgb(59, 130, 246)"
														/>
													</div>
												{/if}
											</div>
										{/if}
									{/if}
								</div>

								<!-- Guess Time & Playback Speed -->
								<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
									<!-- Guess Time -->
									<div class="rounded border bg-gray-50 p-2">
										<div class="mb-1.5 flex items-center justify-between">
											<div class="flex items-center gap-1.5">
												<Clock class="h-3 w-3" />
												<h4 class="text-xs font-semibold">Guess Time</h4>
											</div>
											<Checkbox
												id="use-custom-guess-time"
												bind:checked={useCustomGuessTime}
												class="h-3.5 w-3.5"
											/>
										</div>
										{#if !useCustomGuessTime}
											<div
												class="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700"
											>
												Inherits from quiz-wide settings
											</div>
										{:else}
											<div class="space-y-1.5">
												<!-- Guess Time -->
												<div class="space-y-1">
													<div class="flex items-center gap-1.5">
														<Checkbox
															id="guess-time-random"
															bind:checked={guessTimeUseRange}
															class="h-3 w-3"
														/>
														<Label
															for="guess-time-random"
															class="cursor-pointer text-[10px] text-gray-600"
														>
															Random range
														</Label>
													</div>
													{#if guessTimeUseRange}
														<div class="grid grid-cols-2 gap-1.5">
															<div class="space-y-0.5">
																<Label for="guess-time-min" class="text-[10px]">Min (s)</Label>
																<Input
																	id="guess-time-min"
																	type="number"
																	bind:value={guessTimeMin}
																	min={MIN_GUESS_TIME}
																	max={guessTimeMax - 0.1}
																	step={0.1}
																	class="h-7 text-xs"
																/>
															</div>
															<div class="space-y-0.5">
																<Label for="guess-time-max" class="text-[10px]">Max (s)</Label>
																<Input
																	id="guess-time-max"
																	type="number"
																	bind:value={guessTimeMax}
																	min={guessTimeMin + 0.1}
																	max={MAX_GUESS_TIME}
																	step={0.1}
																	class="h-7 text-xs"
																/>
															</div>
														</div>
													{:else}
														<div class="space-y-0.5">
															<Label for="guess-time-input" class="text-[10px]"
																>Guess Time (s)</Label
															>
															<Input
																id="guess-time-input"
																type="number"
																bind:value={guessTime}
																min={MIN_GUESS_TIME}
																max={MAX_GUESS_TIME}
																step={0.1}
																class="h-7 text-xs"
															/>
														</div>
													{/if}
												</div>
												<!-- Extra Guess Time -->
												<div class="space-y-1">
													<div class="flex items-center gap-1.5">
														<Checkbox
															id="extra-guess-time-random"
															bind:checked={extraGuessTimeUseRange}
															class="h-3 w-3"
														/>
														<Label
															for="extra-guess-time-random"
															class="cursor-pointer text-[10px] text-gray-600"
														>
															Random range
														</Label>
													</div>
													{#if extraGuessTimeUseRange}
														<div class="grid grid-cols-2 gap-1.5">
															<div class="space-y-0.5">
																<Label for="extra-guess-time-min" class="text-[10px]">Min (s)</Label
																>
																<Input
																	id="extra-guess-time-min"
																	type="number"
																	bind:value={extraGuessTimeMin}
																	min={MIN_EXTRA_GUESS_TIME}
																	max={extraGuessTimeMax - 0.1}
																	step={0.1}
																	class="h-7 text-xs"
																/>
															</div>
															<div class="space-y-0.5">
																<Label for="extra-guess-time-max" class="text-[10px]">Max (s)</Label
																>
																<Input
																	id="extra-guess-time-max"
																	type="number"
																	bind:value={extraGuessTimeMax}
																	min={extraGuessTimeMin + 0.1}
																	max={MAX_EXTRA_GUESS_TIME}
																	step={0.1}
																	class="h-7 text-xs"
																/>
															</div>
														</div>
													{:else}
														<div class="space-y-0.5">
															<Label for="extra-guess-time-input" class="text-[10px]"
																>Extra Guess Time (s)</Label
															>
															<Input
																id="extra-guess-time-input"
																type="number"
																bind:value={extraGuessTime}
																min={MIN_EXTRA_GUESS_TIME}
																max={MAX_EXTRA_GUESS_TIME}
																step={0.1}
																class="h-7 text-xs"
															/>
														</div>
													{/if}
												</div>
											</div>
										{/if}
									</div>

									<!-- Playback Speed -->
									<div class="rounded border bg-gray-50 p-2">
										<div class="mb-1.5 flex items-center gap-1.5">
											<Gauge class="h-3 w-3" />
											<h4 class="text-xs font-semibold">Playback Speed</h4>
										</div>
										<div class="space-y-1.5">
											<div class="grid grid-cols-2 gap-1.5">
												{#each speedOptions as option}
													<div class="flex items-center gap-1.5">
														<Checkbox
															id="speed-{option.value}"
															checked={playbackSpeed.randomValues.includes(option.value)}
															onCheckedChange={(checked) =>
																handleSpeedToggle(option.value, checked)}
															class="h-3.5 w-3.5"
														/>
														<Label for="speed-{option.value}" class="cursor-pointer text-xs"
															>{option.label}</Label
														>
													</div>
												{/each}
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<DialogFooter class="pt-3">
			<div class="flex w-full items-center justify-between">
				{#if useCustomSampleRanges || useCustomGuessTime}
					<Button
						variant="ghost"
						onclick={removeCustomSettings}
						class="h-8 text-xs text-red-600 hover:text-red-800"
						disabled={false}
					>
						<Trash2 class="mr-1 h-3 w-3" />
						Remove Custom Settings
					</Button>
				{:else}
					<div></div>
				{/if}
				<div class="flex gap-2">
					<Button
						variant="outline"
						onclick={() => (open = false)}
						class="h-8 text-xs"
						disabled={false}>Cancel</Button
					>
					<Button
						onclick={handleSave}
						disabled={!song || (useCustomSampleRanges && sampleRanges.length === 0)}
						class="h-8 text-xs"
					>
						Save Changes
					</Button>
				</div>
			</div>
		</DialogFooter>
	</DialogContent>
</Dialog>
