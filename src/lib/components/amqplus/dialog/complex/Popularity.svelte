<script>
	import { clamp } from '$lib/utils/mathUtils.js';
	import { POPULARITY_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#f59e0b',
		readOnly = false,
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

	if (!editedValue) {
		editedValue = { ...POPULARITY_DEFAULT_SETTINGS };
	}

	if (editedValue.mode !== 'count' && editedValue.mode !== 'percentage')
		editedValue.mode = 'percentage';
	if (editedValue.percentageValue === undefined) editedValue.percentageValue = 100;
	if (editedValue.countValue === undefined) editedValue.countValue = 500;
	if (editedValue.reverse === undefined) editedValue.reverse = false;

	function validateValue() {
		const errors = [];

		if (editedValue.mode === 'percentage') {
			const percentageValue = Number(editedValue.percentageValue);
			if (!Number.isFinite(percentageValue) || percentageValue < 1 || percentageValue > 100) {
				errors.push('Top percentage must be between 1 and 100');
			}
		} else {
			const countValue = Number(editedValue.countValue);
			if (!Number.isFinite(countValue) || countValue < 1) {
				errors.push('Top count must be at least 1');
			}
		}

		isValid = errors.length === 0;
		validationMessage = errors.join('; ');
	}

	$effect(() => {
		validateValue();
	});
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

	<!-- Mode + value in one row -->
	<div
		class="border-ed-border bg-ed-canvas-default flex items-center gap-3 rounded-md border px-3 py-2"
	>
		<span class="font-dm text-ed-fg-subtle text-[11px] font-medium whitespace-nowrap">Mode</span>
		<div class="df-pill-group">
			<button
				class:active={editedValue.mode === 'percentage'}
				disabled={readOnly}
				onclick={() => {
					editedValue.mode = 'percentage';
				}}>Top %</button
			>
			<button
				class:active={editedValue.mode === 'count'}
				disabled={readOnly}
				onclick={() => {
					editedValue.mode = 'count';
				}}>Top Count</button
			>
		</div>

		<div class="ml-auto flex items-center gap-1.5">
			{#if editedValue.mode === 'percentage'}
				<input
					type="number"
					class="df-input h-6 w-16"
					min={1}
					max={100}
					disabled={readOnly}
					value={editedValue.percentageValue}
					oninput={(e) => {
						const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
						if (!isNaN(v)) editedValue.percentageValue = clamp(v, 1, 100);
					}}
				/>
				<span class="text-ed-fg-subtle font-jb text-[10px]">%</span>
			{:else}
				<input
					type="number"
					class="df-input h-6 w-20"
					min={1}
					step={1}
					disabled={readOnly}
					value={editedValue.countValue}
					oninput={(e) => {
						const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
						if (!isNaN(v)) editedValue.countValue = Math.max(1, v);
					}}
				/>
				<span class="text-ed-fg-subtle font-jb text-[10px]">anime</span>
			{/if}
		</div>
	</div>

	<!-- Reverse toggle -->
	<div
		class="border-ed-border bg-ed-canvas-default flex items-center justify-between rounded-md border px-3 py-2"
	>
		<div class="flex flex-col gap-0.5">
			<span class="font-dm text-ed-fg text-xs font-medium">Reverse Direction</span>
			<span class="font-dm text-ed-fg-subtle text-[10px]">
				{editedValue.reverse ? 'Least popular first' : 'Most popular first'}
			</span>
		</div>
		<button
			aria-label={editedValue.reverse ? 'Sort most popular first' : 'Sort least popular first'}
			class="relative h-[18px] w-[34px] shrink-0 cursor-pointer rounded-full border-none transition-colors duration-150"
			class:bg-[#21262d]={!editedValue.reverse}
			style={editedValue.reverse ? `background: ${getNodeColor()}` : ''}
			disabled={readOnly}
			onclick={() => {
				editedValue.reverse = !editedValue.reverse;
			}}
		>
			<span
				class="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all duration-150"
				class:left-[2px]={!editedValue.reverse}
				class:left-[18px]={editedValue.reverse}
			></span>
		</button>
	</div>

	<span class="text-ed-fg-subtle text-[10px]">
		Filters by anime popularity rank (not song popularity)
	</span>
</div>
