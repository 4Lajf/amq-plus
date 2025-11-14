<script>
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';

	let { isOpen = $bindable(), currentChance = 100, onSave, nodeTitle = 'Node' } = $props();

	// Support both static and range values
	let isRange = $state(false);
	let inputChance = $state(100);
	let inputMinChance = $state(50);
	let inputMaxChance = $state(100);
	let inputError = $state('');

	// Update input when currentChance changes
	$effect(() => {
		if (typeof currentChance === 'object' && currentChance !== null) {
			// Range value
			isRange = true;
			// @ts-ignore
			inputMinChance = currentChance.min || 50;
			// @ts-ignore
			inputMaxChance = currentChance.max || 100;
		} else {
			// Static value
			isRange = false;
			inputChance = currentChance || 100;
		}
		inputError = '';
	});

	function validateAndSave() {
		if (isRange) {
			const minChance = Number(inputMinChance);
			const maxChance = Number(inputMaxChance);

			if (isNaN(minChance) || isNaN(maxChance)) {
				inputError = 'Please enter valid numbers';
				return;
			}

			if (minChance < 0 || minChance > 100 || maxChance < 0 || maxChance > 100) {
				inputError = 'Percentages must be between 0 and 100';
				return;
			}

			if (minChance > maxChance) {
				inputError = 'Minimum must be less than or equal to maximum';
				return;
			}

			if (onSave) {
				onSave({ min: minChance, max: maxChance, kind: 'range' });
			}
		} else {
			const chance = Number(inputChance);

			if (isNaN(chance)) {
				inputError = 'Please enter a valid number';
				return;
			}

			if (chance < 0 || chance > 100) {
				inputError = 'Percentage must be between 0 and 100';
				return;
			}

			if (onSave) {
				onSave(chance);
			}
		}
		isOpen = false;
	}

	function handleCancel() {
		if (typeof currentChance === 'object' && currentChance !== null) {
			isRange = true;
			// @ts-ignore
			inputMinChance = currentChance.min || 50;
			// @ts-ignore
			inputMaxChance = currentChance.max || 100;
		} else {
			isRange = false;
			inputChance = currentChance || 100;
		}
		inputError = '';
		isOpen = false;
	}

	function handleKeydown(event) {
		if (event.key === 'Enter') {
			validateAndSave();
		} else if (event.key === 'Escape') {
			handleCancel();
		}
	}
</script>

<!-- Modal overlay -->
{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="0"
		onmousedown={handleCancel}
		onkeydown={handleKeydown}
	>
		<!-- Modal content -->
		<Card class="mx-4 w-full max-w-md" onmousedown={(e) => e.stopPropagation()}>
			<CardHeader class="">
				<CardTitle id="modal-title" class="text-lg">Set Execution Chance</CardTitle>
				<p class="text-sm text-gray-600">
					Configure the probability that "{nodeTitle}" will be executed
				</p>
			</CardHeader>
			<CardContent class="space-y-4">
				<!-- Mode selector -->
				<div class="space-y-2">
					<Label class="">Execution Mode</Label>
					<div class="flex gap-4">
						<label class="flex items-center space-x-2">
							<input type="radio" bind:group={isRange} value={false} class="text-blue-600" />
							<span class="text-sm">Static Value</span>
						</label>
						<label class="flex items-center space-x-2">
							<input type="radio" bind:group={isRange} value={true} class="text-blue-600" />
							<span class="text-sm">Range</span>
						</label>
					</div>
				</div>

				<!-- Static value input -->
				{#if !isRange}
					<div class="space-y-2">
						<Label for="chance-input" class="">Execution Chance (%)</Label>
						<Input
							id="chance-input"
							type="number"
							min="0"
							max="100"
							step="1"
							bind:value={inputChance}
							class={inputError ? 'border-red-500' : ''}
							placeholder="Enter percentage (0-100)"
							autofocus
						/>
					</div>
				{:else}
					<!-- Range inputs -->
					<div class="space-y-2">
						<Label class="">Execution Chance Range (%)</Label>
						<div class="grid grid-cols-2 gap-2">
							<div>
								<Label for="min-chance-input" class="text-xs">Minimum</Label>
								<Input
									id="min-chance-input"
									type="number"
									min="0"
									max="100"
									step="1"
									bind:value={inputMinChance}
									class={inputError ? 'border-red-500' : ''}
									placeholder="Min %"
								/>
							</div>
							<div>
								<Label for="max-chance-input" class="text-xs">Maximum</Label>
								<Input
									id="max-chance-input"
									type="number"
									min="0"
									max="100"
									step="1"
									bind:value={inputMaxChance}
									class={inputError ? 'border-red-500' : ''}
									placeholder="Max %"
								/>
							</div>
						</div>
					</div>
				{/if}

				{#if inputError}
					<p class="text-sm text-red-600">{inputError}</p>
				{/if}

				<div class="rounded-lg border border-blue-200 bg-blue-50 p-3">
					<h4 class="mb-1 text-sm font-medium text-blue-800">How it works:</h4>
					<ul class="space-y-1 text-xs text-blue-700">
						{#if !isRange}
							<li>• 100% = Always execute (default)</li>
							<li>• 50% = Execute half the time</li>
							<li>• 0% = Never execute</li>
						{:else}
							<li>• Range: Random chance between min and max</li>
							<li>• 50-100% = Execute 50-100% of the time randomly</li>
							<li>• 0-50% = Execute 0-50% of the time randomly</li>
						{/if}
						<li>• If not executed, default settings will be used in export</li>
					</ul>
				</div>

				<div class="flex justify-end gap-2">
					<Button variant="outline" onclick={handleCancel} class="" disabled={false}>Cancel</Button>
					<Button onclick={validateAndSave} class="" disabled={false}>Save</Button>
				</div>
			</CardContent>
		</Card>
	</div>
{/if}
