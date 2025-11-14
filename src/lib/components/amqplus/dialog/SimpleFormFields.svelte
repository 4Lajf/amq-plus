<script>
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import RangeSlider from 'svelte-range-slider-pips';

	let {
		config,
		editedValue = $bindable(),
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		getNodeColor = () => '#6366f1',
		readOnly = false // Whether the form is in read-only mode
	} = $props();

	// Validation function
	function validateValue(value, config) {
		if (!config) return { valid: true, message: '' };

		switch (config.type) {
			case 'number':
				const num = Number(value);
				if (isNaN(num) || num < config.min || num > config.max) {
					return { valid: false, message: `Value must be between ${config.min} and ${config.max}` };
				}
				break;
			case 'number-with-random':
				if (typeof value === 'object' && value.random) {
					if (value.min < config.min || value.max > config.max || value.min > value.max) {
						return {
							valid: false,
							message: `Range must be between ${config.min}-${config.max} and min ≤ max`
						};
					}
				} else if (typeof value === 'object' && value.value !== undefined) {
					const num = Number(value.value);
					if (isNaN(num) || num < config.min || num > config.max) {
						return {
							valid: false,
							message: `Value must be between ${config.min} and ${config.max}`
						};
					}
				} else {
					const num = Number(value);
					if (isNaN(num) || num < config.min || num > config.max) {
						return {
							valid: false,
							message: `Value must be between ${config.min} and ${config.max}`
						};
					}
				}
				break;
			case 'range':
				if (value.start < config.min || value.end > config.max || value.start > value.end) {
					return {
						valid: false,
						message: `Range must be between ${config.min}-${config.max}% and start ≤ end`
					};
				}
				break;
			case 'sample-point-with-static':
				if (value.useRange) {
					if (value.start < config.min || value.end > config.max || value.start > value.end) {
						return {
							valid: false,
							message: `Range must be between ${config.min}-${config.max}% and start ≤ end`
						};
					}
				} else {
					const staticVal = Number(value.staticValue);
					if (isNaN(staticVal) || staticVal < config.min || staticVal > config.max) {
						return {
							valid: false,
							message: `Static value must be between ${config.min} and ${config.max}`
						};
					}
				}
				break;
		}
		return { valid: true, message: '' };
	}

	// Update validation when editedValue changes
	$effect(() => {
		if (editedValue && config) {
			const validation = validateValue(editedValue, config);
			isValid = validation.valid;
			validationMessage = validation.message;
		}
	});
</script>

{#if config.type === 'select'}
	<div class="space-y-2">
		<Label for="setting-value" class="">{config.label}</Label>
		<Select.Root bind:value={editedValue} disabled={readOnly} type="single">
			<Select.Trigger class="w-full" disabled={readOnly}>
				{editedValue
					? config.options.find((opt) => opt.value === editedValue)?.label || editedValue
					: 'Select an option...'}
			</Select.Trigger>
			<Select.Content class="" portalProps={{}}>
				{#each config.options as option}
					<Select.Item value={option.value} class="" label={option.label}
						>{option.label}</Select.Item
					>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
{:else if config.type === 'number'}
	<div class="space-y-2">
		<Label for="setting-value" class="">{config.label}</Label>
		<div class="max-w-xs">
			<Input
				id="setting-value"
				type="number"
				bind:value={editedValue}
				min={config.min}
				max={config.max}
				disabled={readOnly}
				class={!isValid ? 'border-red-500' : ''}
			/>
		</div>
		{#if !isValid}
			<p class="text-sm text-red-500">{validationMessage}</p>
		{/if}
	</div>
{:else if config.type === 'number-with-random'}
	<div class="space-y-4">
		<Label class="">{config.label}</Label>
		<div class="flex items-center space-x-2">
			<Checkbox bind:checked={editedValue.random} id="random-toggle" disabled={readOnly} class="" />
			<Label for="random-toggle" class="text-sm font-normal">Use random range</Label>
		</div>
		{#if editedValue.random}
			<div class="grid grid-cols-2 gap-2">
				<div>
					<Label for="min-value" class="text-sm">Min</Label>
					<Input
						id="min-value"
						type="number"
						bind:value={editedValue.min}
						min={config.min}
						max={config.max}
						disabled={readOnly}
						class={!isValid ? 'border-red-500' : ''}
					/>
				</div>
				<div>
					<Label for="max-value" class="text-sm">Max</Label>
					<Input
						id="max-value"
						type="number"
						bind:value={editedValue.max}
						min={config.min}
						max={config.max}
						disabled={readOnly}
						class={!isValid ? 'border-red-500' : ''}
					/>
				</div>
			</div>
		{:else}
			<Input
				type="number"
				bind:value={editedValue.value}
				min={config.min}
				max={config.max}
				disabled={readOnly}
				class={!isValid ? 'border-red-500' : ''}
			/>
		{/if}
		{#if !isValid}
			<p class="text-sm text-red-500">{validationMessage}</p>
		{/if}
	</div>
{:else if config.type === 'range'}
	<div class="space-y-8">
		<div class="text-center">
			<Label class="text-2xl font-bold text-gray-800">{config.label}</Label>
			<p class="mt-2 text-gray-600">Use the slider below to set the sample point range.</p>
		</div>
		<div class="space-y-6">
			<div class="rounded-lg border-2 border-gray-200 bg-white px-8 py-12 shadow-inner">
				<RangeSlider
					values={[editedValue.start || config.min, editedValue.end || config.max]}
					min={config.min}
					max={config.max}
					step={1}
					range
					pushy
					pips
					pipstep={10}
					all="label"
					disabled={readOnly}
					on:change={(e) => {
						editedValue.start = e.detail.values[0];
						editedValue.end = e.detail.values[1];
					}}
					--slider={getNodeColor()}
					--handle={getNodeColor()}
					--range={getNodeColor()}
				/>
			</div>
			<div class="grid grid-cols-3 gap-4 text-center">
				<div class="rounded-lg border bg-white p-4">
					<div class="text-sm text-gray-600">Start</div>
					<div class="text-2xl font-bold" style="color: {getNodeColor()}">
						{editedValue.start || config.min}%
					</div>
				</div>
				<div class="rounded-lg border bg-white p-4">
					<div class="text-sm text-gray-600">End</div>
					<div class="text-2xl font-bold" style="color: {getNodeColor()}">
						{editedValue.end || config.max}%
					</div>
				</div>
				<div class="rounded-lg border bg-white p-4">
					<div class="text-sm text-gray-600">Range</div>
					<div class="text-2xl font-bold" style="color: {getNodeColor()}">
						{(editedValue.end || config.max) - (editedValue.start || config.min)}%
					</div>
				</div>
			</div>
		</div>
		{#if !isValid}
			<p class="text-sm text-red-500">{validationMessage}</p>
		{/if}
	</div>
{:else if config.type === 'sample-point-with-static'}
	<div class="space-y-4">
		<!-- Content with Side Controls -->
		<div class="flex gap-4">
			<!-- Main Content -->
			<div class="flex-1">
				{#if editedValue.useRange}
					<!-- Range Mode -->
					<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
						<div class="space-y-4">
							<div class="rounded-lg border-2 border-gray-200 bg-white px-4 py-8 shadow-inner">
								<RangeSlider
									values={[editedValue.start || config.min, editedValue.end || config.max]}
									min={config.min}
									max={config.max}
									step={1}
									range
									pushy
									pips
									pipstep={10}
									all="label"
									on:change={(e) => {
										editedValue.start = e.detail.values[0];
										editedValue.end = e.detail.values[1];
									}}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
								/>
							</div>
							<div class="grid grid-cols-3 gap-3 text-center">
								<div class="rounded-lg border bg-white p-3">
									<div class="text-sm text-gray-600">Start</div>
									<div class="text-xl font-bold" style="color: {getNodeColor()}">
										{editedValue.start || config.min}%
									</div>
								</div>
								<div class="rounded-lg border bg-white p-3">
									<div class="text-sm text-gray-600">End</div>
									<div class="text-xl font-bold" style="color: {getNodeColor()}">
										{editedValue.end || config.max}%
									</div>
								</div>
								<div class="rounded-lg border bg-white p-3">
									<div class="text-sm text-gray-600">Range</div>
									<div class="text-xl font-bold" style="color: {getNodeColor()}">
										{(editedValue.end || config.max) - (editedValue.start || config.min)}%
									</div>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<!-- Static Mode -->
					<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
						<div class="space-y-4">
							<div class="rounded-lg border-2 border-gray-200 bg-white px-4 py-8 shadow-inner">
								<RangeSlider
									values={[editedValue.staticValue || 50]}
									min={config.min}
									max={config.max}
									step={1}
									pips
									pipstep={10}
									all="label"
									disabled={readOnly}
									on:change={(e) => (editedValue.staticValue = e.detail.value)}
									--slider={getNodeColor()}
									--handle={getNodeColor()}
									--range={getNodeColor()}
								/>
							</div>
							<div class="text-center">
								<div class="inline-block rounded-lg border bg-white p-3">
									<div class="text-sm text-gray-600">Sample Point</div>
									<div class="text-xl font-bold" style="color: {getNodeColor()}">
										{editedValue.staticValue || 50}%
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Side Controls -->
			<div class="w-64 flex-shrink-0">
				<div class="sticky top-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
					<!-- Mode Toggle -->
					<div class="mb-4">
						<Label class="mb-2 block text-sm font-medium text-gray-700">Mode</Label>
						<div class="flex items-center space-x-2">
							<Label
								for="sample-mode-switch"
								class="text-sm {editedValue.useRange
									? 'font-semibold text-blue-600'
									: 'text-gray-500'}">Range</Label
							>
							<Switch
								id="sample-mode-switch"
								checked={!editedValue.useRange}
								disabled={readOnly}
								onCheckedChange={(checked) => (editedValue.useRange = !checked)}
								class=""
							/>
							<Label
								for="sample-mode-switch"
								class="text-sm {!editedValue.useRange
									? 'font-semibold text-blue-600'
									: 'text-gray-500'}">Static</Label
							>
						</div>
					</div>

					<!-- Info -->
					<div class="border-t pt-2 text-xs text-gray-500">
						<div>Range: {config.min}% - {config.max}%</div>
						<div class="mt-1">
							{#if editedValue.useRange}
								Dynamic sample point range
							{:else}
								Fixed sample point
							{/if}
						</div>
						<div
							class="mt-3 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700"
						>
							<strong>Note:</strong> This serves as the default sample point. It can be overwritten by
							individual song list settings.
						</div>
					</div>
				</div>
			</div>
		</div>

		{#if !isValid}
			<p class="text-sm text-red-500">{validationMessage}</p>
		{/if}
	</div>
{:else if config.type === 'checkboxes'}
	<div class="space-y-3">
		<Label class="">{config.label}</Label>
		{#each config.options as option}
			<div class="flex items-center space-x-2">
				<Checkbox
					bind:checked={editedValue[option.key]}
					id={option.key}
					disabled={readOnly}
					class=""
				/>
				<Label for={option.key} class="text-sm font-normal">{option.label}</Label>
			</div>
		{/each}
	</div>
{:else if config.type === 'select-with-random'}
	<div class="space-y-4">
		<Label class="">{config.label}</Label>
		<div class="flex items-center space-x-2">
			<Checkbox
				bind:checked={editedValue.random}
				id="random-speed-toggle"
				disabled={readOnly}
				class=""
			/>
			<Label for="random-speed-toggle" class="text-sm font-normal">Use random range</Label>
		</div>
		{#if editedValue.random}
			<div class="space-y-2">
				<Label class="text-sm">Select allowed options:</Label>
				{#each config.options as option}
					<div class="flex items-center space-x-2">
						<Checkbox
							bind:checked={editedValue.options[option.value]}
							id={`option-${option.value}`}
							disabled={readOnly}
							class=""
						/>
						<Label for={`option-${option.value}`} class="text-sm font-normal">{option.label}</Label>
					</div>
				{/each}
			</div>
		{:else}
			<Select.Root bind:value={editedValue.value} disabled={readOnly} type="single">
				<Select.Trigger class="w-full" disabled={readOnly}>
					{editedValue.value
						? config.options.find((opt) => opt.value === editedValue.value)?.label ||
							editedValue.value
						: 'Select an option...'}
				</Select.Trigger>
				<Select.Content class="" portalProps={{}}>
					{#each config.options as option}
						<Select.Item value={option.value} class="" label={option.label}
							>{option.label}</Select.Item
						>
					{/each}
				</Select.Content>
			</Select.Root>
		{/if}
	</div>
{/if}
