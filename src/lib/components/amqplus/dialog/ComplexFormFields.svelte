<script>
	import SongsAndTypesSelection from './complex/SongsAndTypesSelection.svelte';

	import SongDifficulty from './complex/SongDifficulty.svelte';
	import ScoreRange from './complex/ScoreRange.svelte';
	import Vintage from './complex/Vintage.svelte';
	import GenresTags from './complex/GenresTags.svelte';
	import AnimeType from './complex/AnimeType.svelte';
	import SongCategories from './complex/SongCategories.svelte';
	import SongListSettingsForm from './SongListSettingsForm.svelte';
	import SourceSelector from './complex/SourceSelector.svelte';
	import AnimeTitleLength from './complex/AnimeTitleLength.svelte';
	import Popularity from './complex/Popularity.svelte';

	/**
	 * @typedef {Object} Props
	 * @property {Object} config
	 * @property {any} [editedValue]
	 * @property {boolean} [isValid]
	 * @property {string} [validationMessage]
	 * @property {() => string} [getNodeColor]
	 * @property {() => number | {min: number, max: number}} [getTotalSongs]
	 * @property {Function | null} [onAutoSave]
	 * @property {boolean} [readOnly]
	 */
	/** @type {Props} */
	let {
		config: rawConfig,
		editedValue = $bindable(),
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		getNodeColor = () => '#6366f1',
		getTotalSongs = () => 20,
		onAutoSave = null,
		readOnly = false
	} = $props();

	const TYPE_ALIASES = {
		'complex-genres': { type: 'complex-genres-tags', label: 'Genres' },
		'complex-tags': { type: 'complex-genres-tags', label: 'Tags' },
		'complex-player-score': { type: 'complex-score-range', label: 'Player Score', min: 1, max: 10 },
		'complex-anime-score': { type: 'complex-score-range', label: 'Anime Score', min: 1, max: 10 }
	};

	const config = $derived.by(() => {
		const alias = TYPE_ALIASES[rawConfig.type];
		if (alias) return { ...rawConfig, ...alias };
		return rawConfig;
	});
</script>

{#if config.type === 'complex-songs-and-types'}
	<SongsAndTypesSelection
		bind:editedValue
		{config}
		{getNodeColor}
		{getTotalSongs}
		{onAutoSave}
		{readOnly}
		bind:isValid
		bind:validationMessage
	/>
{:else if config.type === 'complex-song-difficulty'}
	<SongDifficulty
		bind:editedValue
		{config}
		{getNodeColor}
		{getTotalSongs}
		{readOnly}
		bind:isValid
		bind:validationMessage
	/>
{:else if config.type === 'complex-score-range'}
	<ScoreRange
		bind:editedValue
		{config}
		{getNodeColor}
		{readOnly}
		{getTotalSongs}
		bind:isValid
		bind:validationMessage
	/>
{:else if config.type === 'complex-vintage'}
	<Vintage
		bind:editedValue
		{config}
		{getNodeColor}
		{readOnly}
		{getTotalSongs}
		bind:isValid
		bind:validationMessage
	/>
{:else if config.type === 'complex-genres-tags'}
	<GenresTags
		bind:editedValue
		{config}
		{getNodeColor}
		{getTotalSongs}
		{readOnly}
		bind:isValid
		bind:validationMessage
	/>
{:else if config.type === 'complex-anime-type'}
	<AnimeType
		bind:editedValue
		{config}
		{getNodeColor}
		{getTotalSongs}
		{onAutoSave}
		{readOnly}
		bind:isValid
		bind:validationMessage
	/>
{:else if config.type === 'complex-song-categories'}
	<SongCategories
		bind:editedValue
		{config}
		{getNodeColor}
		{getTotalSongs}
		{readOnly}
		{onAutoSave}
		bind:isValid
		bind:validationMessage
	/>
{:else if config.type === 'complex-song-list'}
	<SongListSettingsForm bind:editedValue {onAutoSave} bind:isValid bind:validationMessage />
{:else if config.type === 'complex-source-selector'}
	<SourceSelector
		bind:editedValue
		{config}
		{getNodeColor}
		{getTotalSongs}
		{onAutoSave}
		{readOnly}
		bind:isValid
		bind:validationMessage
	/>
{:else if config.type === 'complex-anime-title-length'}
	<AnimeTitleLength
		bind:editedValue
		{config}
		{getNodeColor}
		{readOnly}
		bind:isValid
		bind:validationMessage
	/>
{:else if config.type === 'complex-popularity'}
	<Popularity
		bind:editedValue
		{config}
		{getNodeColor}
		{readOnly}
		bind:isValid
		bind:validationMessage
	/>
{:else}
	<div
		class="border-ed-border bg-ed-canvas-default text-ed-fg-subtle rounded-md border px-4 py-6 text-center"
	>
		<p class="font-dm text-xs">
			Complex form type "{config.type}" not yet implemented.
		</p>
	</div>
{/if}
