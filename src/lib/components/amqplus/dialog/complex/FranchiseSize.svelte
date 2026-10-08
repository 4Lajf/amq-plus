<script>
	import { clamp } from '$lib/utils/mathUtils.js';
	import { FRANCHISE_SIZE_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#8b5cf6',
		readOnly = false,
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

	if (!editedValue) {
		editedValue = { ...FRANCHISE_SIZE_DEFAULT_SETTINGS };
	}

	if (editedValue.minEntries === undefined) editedValue.minEntries = 1;
	if (editedValue.maxEntries === undefined) editedValue.maxEntries = 999;

	function validateValue() {
		const errors = [];
		const min = Number(editedValue.minEntries);
		const max = Number(editedValue.maxEntries);

		if (!Number.isFinite(min) || min < 1) {
			errors.push('Min entries must be at least 1');
		}
		if (!Number.isFinite(max) || max < 1) {
			errors.push('Max entries must be at least 1');
		}
		if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
			errors.push('Min entries cannot exceed max entries');
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

	<div
		class="border-ed-border bg-ed-canvas-default flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
	>
		<label class="flex items-center gap-3">
		<span class="font-dm text-ed-fg-subtle text-[11px] font-medium whitespace-nowrap">Min</span>
		<input
			type="number"
			class="df-input h-6 w-20"
			min={1}
			step={1}
			disabled={readOnly}
			value={editedValue.minEntries}
			aria-label="Minimum franchise entries"
			oninput={(e) => {
				const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
				if (!isNaN(v)) editedValue.minEntries = Math.max(1, v);
			}}
		/>
		</label>
		<label class="flex items-center gap-3">
		<span class="font-dm text-ed-fg-subtle text-[11px] font-medium whitespace-nowrap">Max</span>
		<input
			type="number"
			class="df-input h-6 w-20"
			min={1}
			step={1}
			disabled={readOnly}
			value={editedValue.maxEntries}
			aria-label="Maximum franchise entries"
			oninput={(e) => {
				const v = parseInt(/** @type {HTMLInputElement} */ (e.target).value, 10);
				if (!isNaN(v)) editedValue.maxEntries = Math.max(1, v);
			}}
		/>
		</label>
		<span class="text-ed-fg-subtle font-jb text-[10px]">entries</span>
	</div>

	<span class="text-ed-fg-subtle text-[10px]">
		Filters songs by the number of anime entries in their franchise (from AniList data).
		Standalone anime count as 1 entry.
	</span>
</div>
