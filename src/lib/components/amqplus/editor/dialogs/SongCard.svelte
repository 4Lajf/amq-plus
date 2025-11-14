<script>
	/**
	 * Song Card Component
	 * Displays individual song information with audio preview functionality
	 *
	 * @component
	 */

	import { Button } from '$lib/components/ui/button';
	import { Play, Pause } from 'lucide-svelte';

	let { song } = $props();

	let audio = $state(null);
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(15); // 15 seconds preview
	let isLoading = $state(false);
	let hasError = $state(false);

	/**
	 * Toggle audio playback
	 */
	function togglePlay() {
		if (hasError) return;

		if (!audio) {
			// Create audio element
			const startTime = 30; // Start at 30 seconds
			const audioUrl = getAudioUrl(song);

			if (!audioUrl) {
				hasError = true;
				return;
			}

			isLoading = true;
			audio = new Audio(audioUrl);

			// Set up event listeners
			audio.addEventListener('loadedmetadata', () => {
				isLoading = false;
				audio.currentTime = startTime;
			});

			audio.addEventListener('timeupdate', () => {
				const elapsed = audio.currentTime - startTime;
				currentTime = Math.max(0, elapsed);

				// Stop after 15 seconds
				if (elapsed >= duration) {
					audio.pause();
					audio.currentTime = startTime;
					isPlaying = false;
					currentTime = 0;
				}
			});

			audio.addEventListener('ended', () => {
				isPlaying = false;
				currentTime = 0;
			});

			audio.addEventListener('error', (e) => {
				console.error('Audio load error:', e);
				isLoading = false;
				hasError = true;
				isPlaying = false;
			});

			audio.addEventListener('canplay', () => {
				isLoading = false;
				if (isPlaying) {
					audio.play().catch((err) => {
						console.error('Play error:', err);
						hasError = true;
						isPlaying = false;
					});
				}
			});

			// Start playing
			isPlaying = true;
		} else {
			// Toggle play/pause
			if (isPlaying) {
				audio.pause();
				isPlaying = false;
			} else {
				isPlaying = true;
				audio.play().catch((err) => {
					console.error('Play error:', err);
					hasError = true;
					isPlaying = false;
				});
			}
		}
	}

	/**
	 * Get audio URL for a song
	 * @param {Object} song - Song object
	 * @returns {string|null} Audio URL or null if not available
	 */
	function getAudioUrl(song) {
		if (song.audio) {
			return `https://naedist.animemusicquiz.com/${song.audio}`;
		}
		// Fallback to video if no audio available
		if (song.HQ) {
			return `https://naedist.animemusicquiz.com/${song.HQ}`;
		}
		return null;
	}

	/**
	 * Clean up audio on component unmount
	 */
	$effect(() => {
		return () => {
			if (audio) {
				audio.pause();
				audio.src = '';
				audio = null;
			}
		};
	});
</script>

<div
	class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
>
	<div class="flex items-start gap-4">
		<!-- Play Button -->
		<Button
			variant="outline"
			size="icon"
			onclick={togglePlay}
			disabled={isLoading || hasError}
			class="shrink-0 {isPlaying ? 'border-blue-300 bg-blue-50' : ''}"
			aria-label="{isPlaying ? 'Pause' : 'Play'} {song.songName} by {song.songArtist}"
		>
			{#if isLoading}
				<div
					class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
				></div>
			{:else if isPlaying}
				<Pause class="h-4 w-4" aria-hidden="true" />
			{:else}
				<Play class="h-4 w-4" aria-hidden="true" />
			{/if}
		</Button>

		<!-- Song Info -->
		<div class="min-w-0 flex-1">
			<h4 class="truncate font-semibold text-gray-900">
				{song.animeRomajiName || song.animeJPName || song.animeENName}
			</h4>
			{#if song.animeENName && song.animeENName !== song.animeRomajiName}
				<p class="truncate text-xs text-gray-500">{song.animeENName}</p>
			{/if}
			<p class="mt-1 truncate text-sm text-gray-700">{song.songName}</p>
			<p class="truncate text-sm text-gray-500">{song.songArtist}</p>

			<div class="mt-2 flex flex-wrap gap-2 text-xs">
				<span class="rounded bg-blue-100 px-2 py-1 text-blue-800">
					{song.songType}
				</span>
				<span class="rounded bg-gray-100 px-2 py-1 text-gray-700">
					{song.animeType}
				</span>
				{#if song.songDifficulty !== undefined}
					<span class="rounded bg-purple-100 px-2 py-1 text-purple-800">
						Difficulty: {song.songDifficulty}%
					</span>
				{/if}
				{#if song.songCategory}
					<span class="rounded bg-green-100 px-2 py-1 text-green-800">
						{song.songCategory}
					</span>
				{/if}
			</div>

			{#if hasError}
				<p class="mt-2 text-xs text-red-600">Audio unavailable</p>
			{/if}
		</div>
	</div>

	<!-- Progress Bar -->
	{#if (isPlaying || currentTime > 0) && !hasError}
		<div class="mt-3">
			<div class="h-1 w-full overflow-hidden rounded-full bg-gray-200">
				<div
					class="h-full bg-blue-500 transition-all duration-100"
					style="width: {(currentTime / duration) * 100}%"
				></div>
			</div>
			<div class="mt-1 flex justify-between text-xs text-gray-500">
				<span>{Math.floor(currentTime)}s</span>
				<span>{duration}s</span>
			</div>
		</div>
	{/if}
</div>
