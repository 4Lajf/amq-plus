<script>
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	let {
		label = '',
		value = $bindable(),
		min = 0,
		max = 100,
		step = 1,
		unit = '',
		onCommit = null,
		locked = false
	} = $props();

	// Ensure value has proper structure
	if (!value || typeof value !== 'object') {
		value = {
			useRange: false,
			staticValue: min,
			min: min,
			max: max
		};
	}

	// Handle static value change
	function handleStaticChange(newValue) {
		const numValue = Number(newValue);
		if (!isNaN(numValue)) {
			value.staticValue = Math.max(min, Math.min(max, numValue));
		}
	}

	// Handle min/max changes
	function handleMinChange(newValue) {
		const numValue = Number(newValue);
		if (!isNaN(numValue)) {
			value.min = Math.max(min, Math.min(value.max - step, numValue));
		}
	}

	function handleMaxChange(newValue) {
		const numValue = Number(newValue);
		if (!isNaN(numValue)) {
			value.max = Math.max(value.min + step, Math.min(max, numValue));
		}
	}

	// Handle range toggle
	function handleRangeToggle() {
		value.useRange = !value.useRange;
		if (onCommit) onCommit();
	}
</script>

<div class="space-y-2">
	<Label class="text-xs font-medium">{label}</Label>

	<!-- Range toggle -->
	<div class="flex items-center gap-2">
		<Switch
			checked={value.useRange}
			onCheckedChange={handleRangeToggle}
			disabled={locked}
			class=""
		/>
		<span class="text-xs text-gray-600">
			{value.useRange ? 'Random range' : 'Fixed value'}
			{#if locked}
				<span class="text-xs font-medium text-orange-600"> (Locked)</span>
			{/if}
		</span>
	</div>

	{#if value.useRange}
		<!-- Range inputs -->
		<div class="flex items-center gap-2" onfocusout={() => onCommit && onCommit()}>
			<div class="flex-1">
				<Label class="text-xs text-gray-500">Min</Label>
				<Input
					type="number"
					{min}
					max={value.max - step}
					{step}
					bind:value={value.min}
					class="h-10 text-sm"
				/>
			</div>
			<span class="pt-4 text-xs text-gray-400">to</span>
			<div class="flex-1">
				<Label class="text-xs text-gray-500">Max</Label>
				<Input
					type="number"
					min={value.min + step}
					{max}
					{step}
					bind:value={value.max}
					class="h-10 text-sm"
				/>
			</div>
			{#if unit}
				<span class="pt-4 text-xs text-gray-500">{unit}</span>
			{/if}
		</div>
		<div class="text-xs text-gray-500">
			Will randomly pick a value between {value.min} and {value.max}{unit}
		</div>
	{:else}
		<!-- Static input -->
		<div class="flex items-center gap-2" onfocusout={() => onCommit && onCommit()}>
			<Input
				type="number"
				{min}
				{max}
				{step}
				bind:value={value.staticValue}
				class="h-10 flex-1 text-sm"
			/>
			{#if unit}
				<span class="text-xs text-gray-500">{unit}</span>
			{/if}
		</div>
	{/if}
</div>
