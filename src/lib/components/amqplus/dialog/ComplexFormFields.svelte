<script>
	import SongsAndTypesSelection from './complex/SongsAndTypesSelection.svelte';

	import SongDifficulty from './complex/SongDifficulty.svelte';
	import ScoreRange from './complex/ScoreRange.svelte';
	import Vintage from './complex/Vintage.svelte';
	import GenresTags from './complex/GenresTags.svelte';
	import AnimeType from './complex/AnimeType.svelte';
	import SongCategories from './complex/SongCategories.svelte';
	import SongListSettingsForm from '../editor/dialogs/SongListSettingsForm.svelte';
	import SourceSelector from './complex/SourceSelector.svelte';

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
		config,
		editedValue = $bindable(),
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		getNodeColor = () => '#6366f1',
		getTotalSongs = () => 20,
		onAutoSave = null, // Optional callback for auto-save
		readOnly = false
	} = $props();
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
{:else}
	<div class="p-8 text-center text-gray-500">
		<p>Complex form type "{config.type}" not yet implemented.</p>
		<p class="mt-2 text-sm">This will be a placeholder until the specific form is created.</p>
	</div>
{/if}
