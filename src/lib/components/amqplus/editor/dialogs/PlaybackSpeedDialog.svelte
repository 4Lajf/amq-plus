<!-- Export the display text for parent component -->
<script module>
	export function getPlaybackSpeedDisplay(value) {
		const speedOptions = [
			{ value: 1.0, label: '1x' },
			{ value: 1.5, label: '1.5x' },
			{ value: 2.0, label: '2x' },
			{ value: 4.0, label: '4x' }
		];

		if (!value) return '1x';

		if (
			value.mode === 'random' &&
			Array.isArray(value.randomValues) &&
			value.randomValues.length > 1
		) {
			const labels = value.randomValues.map(
				(v) => speedOptions.find((opt) => opt.value === v)?.label || `${v}x`
			);
			return `Random: ${labels.join(', ')}`;
		} else {
			const speed = value.staticValue || value || 1.0;
			const option = speedOptions.find((opt) => opt.value === speed);
			return option?.label || `${speed}x`;
		}
	}
</script>

<script>
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let { open = $bindable(), value = $bindable(), onSave = () => {} } = $props();

	const speedOptions = [
		{ value: 1.0, label: '1x' },
		{ value: 1.5, label: '1.5x' },
		{ value: 2.0, label: '2x' },
		{ value: 4.0, label: '4x' }
	];

	// Local state for the dialog
	let localValue = $state({
		randomValues: [1.0] // Array of selected speeds - if 1 item = static, if >1 = random
	});

	// Initialize local value when dialog opens
	$effect(() => {
		if (open && value) {
			if (Array.isArray(value.randomValues) && value.randomValues.length > 0) {
				localValue = {
					randomValues: [...value.randomValues]
				};
			} else {
				const speed = value.staticValue || value || 1.0;
				localValue = {
					randomValues: [speed]
				};
			}
		}
	});

	function handleRandomToggle(speed, checked) {
		if (checked) {
			// Add speed if not already included
			if (!localValue.randomValues.includes(speed)) {
				localValue.randomValues = [...localValue.randomValues, speed].sort((a, b) => a - b);
			}
		} else {
			if (localValue.randomValues.length > 1) {
				localValue.randomValues = localValue.randomValues.filter((v) => v !== speed);
			}
		}
	}

	function handleSave() {
		// Create the final value object
		const finalValue = {
			mode: localValue.randomValues.length > 1 ? 'random' : 'static',
			staticValue: localValue.randomValues[0] || 1.0,
			randomValues: localValue.randomValues
		};

		value = finalValue;
		onSave(finalValue);
		open = false;
	}

	function handleCancel() {
		open = false;
	}

	// Get display text for current selection
	const displayText = $derived(
		!value
			? '1x'
			: value.mode === 'random' &&
				  Array.isArray(value.randomValues) &&
				  value.randomValues.length > 1
				? `Random: ${value.randomValues.map((v) => speedOptions.find((opt) => opt.value === v)?.label || `${v}x`).join(', ')}`
				: (() => {
						const speed = value.staticValue || value || 1.0;
						const option = speedOptions.find((opt) => opt.value === speed);
						return option?.label || `${speed}x`;
					})()
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-md" portalProps={{ class: '' }}>
		<Dialog.Header class="">
			<Dialog.Title class="">Configure Playback Speed</Dialog.Title>
			<Dialog.Description class="">
				Choose a fixed speed or select multiple speeds for random selection during gameplay.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<!-- Speed Selection -->
			<div class="space-y-3">
				<Label class="text-sm text-gray-600">Select playback speeds (choose at least one):</Label>
				<div class="space-y-2">
					{#each speedOptions as option}
						<div class="flex items-center gap-3">
							<Checkbox
								id="speed-{option.value}"
								checked={localValue.randomValues.includes(option.value)}
								onCheckedChange={(checked) => handleRandomToggle(option.value, checked)}
								class=""
							/>
							<Label for="speed-{option.value}" class="text-sm">
								{option.label}
							</Label>
						</div>
					{/each}
				</div>
				<div class="mt-2 text-xs text-gray-500">
					Selected: {localValue.randomValues.length} speed{localValue.randomValues.length === 1
						? ''
						: 's'}
					{#if localValue.randomValues.length === 1}
						<br />The selected speed will be used for all songs.
					{:else if localValue.randomValues.length > 1}
						<br />During gameplay, one speed will be randomly chosen from your selection for each
						song.
					{/if}
				</div>
			</div>
		</div>

		<Dialog.Footer class="flex gap-2">
			<Button variant="outline" onclick={handleCancel} class="" disabled={false}>Cancel</Button>
			<Button onclick={handleSave} class="" disabled={false}>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
