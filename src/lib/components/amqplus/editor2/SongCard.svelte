<script>
	/**
	 * Song Card Component
	 * Displays individual song information with audio preview functionality
	 *
	 * @component
	 */

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
	class="bg-ed-canvas-subtle rounded-lg border px-4 py-3.5 transition-[border-color,box-shadow] duration-150 hover:shadow-[0_2px_8px_rgba(0,0,0,0.25)] {isPlaying
		? 'border-ed-blue-deep/27'
		: 'border-ed-border hover:border-ed-border-muted'}"
>
	<div class="flex items-start gap-3.5">
		<button
			class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 {isPlaying
				? 'bg-ed-blue-deep/13 border-ed-blue-muted text-ed-blue hover:bg-ed-blue-deep/20 hover:border-ed-blue hover:text-ed-blue-bright'
				: 'bg-ed-border border-ed-border-muted text-ed-fg-subtle hover:bg-ed-border-muted hover:border-ed-border-subtle hover:text-ed-fg'}"
			onclick={togglePlay}
			disabled={isLoading || hasError}
			aria-label="{isPlaying ? 'Pause' : 'Play'} {song.songName} by {song.songArtist}"
		>
			{#if isLoading}
				<div class="song-play-spinner"></div>
			{:else if isPlaying}
				<Pause size={16} aria-hidden="true" />
			{:else}
				<Play size={16} aria-hidden="true" />
			{/if}
		</button>

		<div class="min-w-0 flex-1">
			<h4 class="text-ed-fg-emphasis m-0 truncate text-sm leading-[1.3] font-semibold">
				{song.animeRomajiName || song.animeJPName || song.animeENName}
			</h4>
			{#if song.animeENName && song.animeENName !== song.animeRomajiName}
				<p class="text-ed-fg-subtle m-0 truncate text-[11px]">{song.animeENName}</p>
			{/if}
			<p class="text-ed-fg mt-1 mb-0 truncate text-[13px]">{song.songName}</p>
			<p class="text-ed-fg-subtle m-0 truncate text-[13px]">{song.songArtist}</p>

			<div class="mt-2.5 flex flex-wrap gap-1.5">
				<span
					class="border-ed-blue-deep/27 bg-ed-blue-deep/13 text-ed-blue inline-flex items-center rounded-[5px] border px-2 py-[3px] text-[11px] leading-[1.3] font-semibold tracking-[0.01em] whitespace-nowrap"
				>
					{song.songType}
				</span>
				<span
					class="border-ed-border-muted bg-ed-border text-ed-fg-subtle inline-flex items-center rounded-[5px] border px-2 py-[3px] text-[11px] leading-[1.3] font-semibold tracking-[0.01em] whitespace-nowrap"
				>
					{song.animeType}
				</span>
				{#if song.songDifficulty !== undefined}
					<span
						class="border-ed-purple-deep/27 bg-ed-purple-deep/13 text-ed-purple inline-flex items-center rounded-[5px] border px-2 py-[3px] text-[11px] leading-[1.3] font-semibold tracking-[0.01em] whitespace-nowrap"
					>
						Difficulty: {song.songDifficulty}%
					</span>
				{/if}
				{#if song.songCategory}
					<span
						class="border-ed-green-dark/27 bg-ed-green-dark/13 text-ed-green inline-flex items-center rounded-[5px] border px-2 py-[3px] text-[11px] leading-[1.3] font-semibold tracking-[0.01em] whitespace-nowrap"
					>
						{song.songCategory}
					</span>
				{/if}
			</div>

			{#if hasError}
				<p class="text-ed-red mt-2 mb-0 text-xs">Audio unavailable</p>
			{/if}
		</div>
	</div>

	{#if (isPlaying || currentTime > 0) && !hasError}
		<div class="mt-3">
			<div class="bg-ed-border h-[3px] w-full overflow-hidden rounded-[3px]">
				<div
					class="bg-ed-blue-deep h-full rounded-[3px] transition-[width] duration-100 ease-linear"
					style="width: {(currentTime / duration) * 100}%"
				></div>
			</div>
			<div class="font-jb text-ed-border-subtle mt-1 flex justify-between text-[11px]">
				<span>{Math.floor(currentTime)}s</span>
				<span>{duration}s</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.song-play-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid #30363d;
		border-top-color: #58a6ff;
		border-radius: 50%;
		animation: song-spin 0.7s linear infinite;
	}
	@keyframes song-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
