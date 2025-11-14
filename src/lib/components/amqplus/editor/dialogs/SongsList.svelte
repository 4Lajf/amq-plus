<script>
	/**
	 * Songs List Component
	 * Displays a scrollable list of songs with count header
	 *
	 * @component
	 */

	import SongCard from './SongCard.svelte';

	let { songs } = $props();
</script>

<div class="space-y-4">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-lg font-semibold text-gray-900">
			{songs.length}
			{songs.length === 1 ? 'Song' : 'Songs'} Selected
		</h3>
	</div>

	<div class="custom-scrollbar grid max-h-[60vh] gap-3 overflow-y-auto pr-2">
		{#each songs as song (song.annSongId)}
			<SongCard {song} />
		{/each}
	</div>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 8px;
	}

	.custom-scrollbar::-webkit-scrollbar-track {
		background: #f1f1f1;
		border-radius: 4px;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: #888;
		border-radius: 4px;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: #555;
	}
</style>
