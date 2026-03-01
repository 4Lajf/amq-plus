<script>
	import { clamp } from '$lib/utils/mathUtils.js';
	import { ANIME_TITLE_LENGTH_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#8b5cf6',
		readOnly = false,
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

	if (!editedValue) {
		editedValue = { ...ANIME_TITLE_LENGTH_DEFAULT_SETTINGS };
	}

	if (editedValue.mode === undefined) editedValue.mode = 'disabled';
	if (editedValue.minWords === undefined) editedValue.minWords = 0;
	if (editedValue.maxWords === undefined) editedValue.maxWords = 99;
	if (editedValue.titleField === undefined) editedValue.titleField = 'auto';

	function validateValue() {
		if (!editedValue) return;
		const errors = [];

		if (editedValue.mode !== 'disabled') {
			const min = Number(editedValue.minWords ?? 0);
			const max = Number(editedValue.maxWords ?? 99);

			if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 99 || min > max) {
				errors.push('Word count must be between 0-99 with min ≤ max');
			}
		}

		isValid = errors.length === 0;
		validationMessage = errors.join('; ');
	}

	$effect(() => {
		validateValue();
	});

	const titleFieldOptions = [
		{ value: 'auto', label: 'Auto (EN or Romaji)' },
		{ value: 'english', label: 'English Only' },
		{ value: 'romaji', label: 'Romaji Only' }
	];
</script>

<div class="flex flex-col gap-3" style="--accent: {getNodeColor()}">
	{#if !isValid && validationMessage}
		<div
			class="text-ed-red flex items-center gap-2 rounded border border-[#f8514933] bg-[#f8514910] px-3 py-2 text-xs"
		>
			<span>⚠</span>
			<span>{validationMessage}</span>
		</div>
	{/if}

	<!-- Enable toggle -->
	<div
		class="border-ed-border bg-ed-canvas-default flex items-center justify-between rounded-md border px-3 py-2"
	>
		<div class="flex flex-col gap-0.5">
			<span class="font-dm text-ed-fg text-xs font-medium">Enable Filter</span>
			<span class="font-dm text-ed-fg-subtle text-[10px]">
				{editedValue.mode === 'disabled' ? 'Any word count allowed' : 'Filtering by word count'}
			</span>
		</div>
		<button
			aria-label={editedValue.mode === 'disabled' ? 'Enable filter' : 'Disable filter'}
			class="relative h-[18px] w-[34px] shrink-0 cursor-pointer rounded-full border-none transition-colors duration-150"
			class:bg-[#21262d]={editedValue.mode === 'disabled'}
			style={editedValue.mode !== 'disabled' ? `background: ${getNodeColor()}` : ''}
			disabled={readOnly}
			onclick={() => {
				editedValue.mode = editedValue.mode === 'disabled' ? 'range' : 'disabled';
			}}
		>
			<span
				class="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all duration-150"
				class:left-[2px]={editedValue.mode === 'disabled'}
				class:left-[18px]={editedValue.mode !== 'disabled'}
			></span>
		</button>
	</div>

	{#if editedValue.mode !== 'disabled'}
		<!-- Word count range -->
		<div class="border-ed-border bg-ed-canvas-default flex flex-col gap-3 rounded-md border p-3">
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1">
					<label for="atl-min-words" class="font-dm text-ed-fg-subtle text-[11px] font-medium"
						>Min Words</label
					>
					<input
						id="atl-min-words"
						type="number"
						class="df-input h-7 w-full"
						min={0}
						max={99}
						disabled={readOnly}
						value={editedValue.minWords}
						oninput={(e) => {
							const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value);
							if (!isNaN(val)) editedValue.minWords = clamp(val, 0, 99);
						}}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label for="atl-max-words" class="font-dm text-ed-fg-subtle text-[11px] font-medium"
						>Max Words</label
					>
					<input
						id="atl-max-words"
						type="number"
						class="df-input h-7 w-full"
						min={0}
						max={99}
						disabled={readOnly}
						value={editedValue.maxWords}
						oninput={(e) => {
							const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value);
							if (!isNaN(val)) editedValue.maxWords = clamp(val, 0, 99);
						}}
					/>
				</div>
			</div>

			<div class="flex flex-col gap-1">
				<label for="atl-title-field" class="font-dm text-ed-fg-subtle text-[11px] font-medium"
					>Title Field</label
				>
				<select
					id="atl-title-field"
					class="df-select h-7 w-full"
					bind:value={editedValue.titleField}
					disabled={readOnly}
				>
					{#each titleFieldOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<span class="text-ed-fg-subtle text-[10px]"
					>Which title(s) to check against the word limit</span
				>
			</div>
		</div>
	{/if}
</div>
