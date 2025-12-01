<script>
	/**
	 * Batch User List Settings Form Component
	 * Form for configuring Batch User List nodes with multiple user imports.
	 *
	 * @component
	 */

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Select from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import { AlertCircle, Plus, Trash2 } from 'lucide-svelte';
	import RangeSlider from 'svelte-range-slider-pips';

	import { validateBatchUserListConfig } from '../utils/batchUserListUtils.js';

	/**
	 * @typedef {Object} Props
	 * @property {Object} editedValue - Current settings value being edited
	 * @property {Function} onAutoSave - Callback for auto-saving changes
	 * @property {boolean} isValid - Whether current config is valid
	 * @property {string} validationMessage - Validation error message
	 * @property {Object} [nodeData] - Node metadata (optional, used to determine node type)
	 */

	/** @type {Props} */
	let {
		editedValue = $bindable(),
		onAutoSave = () => {},
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		nodeData = undefined
	} = $props();

	// Determine node type
	const isLiveNode = nodeData?.id === 'live-node' || nodeData?.type === 'liveNode';
	const isBatchUserList = !isLiveNode;

	// Force correct mode based on node type
	if (isLiveNode) {
		editedValue.mode = 'live';
	} else {
		editedValue.mode = 'manual';
	}

	// Initialize userEntries if not present
	if (!editedValue.userEntries || editedValue.userEntries.length === 0) {
		editedValue.userEntries = [
			{
				id: `user-${Date.now()}`,
				platform: 'anilist',
				username: '',
				selectedLists: {
					completed: true,
					watching: true,
					planning: false,
					on_hold: false,
					dropped: false
				}
			}
		];
	}

	// Initialize node-level songPercentage if it doesn't exist
	if (editedValue.songPercentage === undefined) {
		editedValue.songPercentage = null;
	}

	// Initialize songSelectionMode if it doesn't exist
	if (editedValue.songSelectionMode === undefined) {
		editedValue.songSelectionMode = 'default';
	}

	// Normalize node-level songPercentage format
	if (editedValue.songPercentage !== null && editedValue.songPercentage !== undefined) {
		if (typeof editedValue.songPercentage === 'number') {
			editedValue.songPercentage = {
				value: editedValue.songPercentage,
				random: false,
				min: 0,
				max: 100
			};
		} else if (typeof editedValue.songPercentage === 'object') {
			// Ensure new format has all required properties
			if (editedValue.songPercentage.random === undefined) {
				editedValue.songPercentage.random = false;
			}
			if (editedValue.songPercentage.min === undefined) {
				editedValue.songPercentage.min = 0;
			}
			if (editedValue.songPercentage.max === undefined) {
				editedValue.songPercentage.max = 100;
			}
		}
	}

	// Normalize per-user songPercentage format
	for (const entry of editedValue.userEntries) {
		if (entry.songPercentage !== null && entry.songPercentage !== undefined) {
			if (typeof entry.songPercentage === 'number') {
				entry.songPercentage = {
					value: entry.songPercentage,
					random: false,
					min: 0,
					max: 100
				};
			} else if (typeof entry.songPercentage === 'object') {
				// Ensure new format has all required properties
				if (entry.songPercentage.random === undefined) {
					entry.songPercentage.random = false;
				}
				if (entry.songPercentage.min === undefined) {
					entry.songPercentage.min = 0;
				}
				if (entry.songPercentage.max === undefined) {
					entry.songPercentage.max = 100;
				}
			}
		}
	}

	// Profile type options
	const profileTypes = [
		{ value: 'anilist', label: 'AniList' },
		{ value: 'mal', label: 'MyAnimeList' }
	];

	// Add a new user entry
	function addUserEntry() {
		editedValue.userEntries = [
			...editedValue.userEntries,
			{
				id: `user-${Date.now()}`,
				platform: 'anilist',
				username: '',
				selectedLists: {
					completed: true,
					watching: true,
					planning: false,
					on_hold: false,
					dropped: false
				},
				songPercentage: null
			}
		];
		validateAndAutoSave();
	}

	function removeUserEntry(index) {
		if (editedValue.userEntries.length <= 1) {
			return; // Keep at least one entry
		}
		editedValue.userEntries = editedValue.userEntries.filter((_, i) => i !== index);
		validateAndAutoSave();
	}

	// Validate and auto-save
	function validateAndAutoSave() {
		const validation = validateBatchUserListConfig(editedValue);
		isValid = validation.valid;
		validationMessage = validation.error || '';

		if (isValid) {
			onAutoSave(editedValue);
		}
	}

	// Handle use entire pool toggle
	function handleUseEntirePoolChange(checked) {
		editedValue.useEntirePool = checked;
		onAutoSave(editedValue);
	}

	// Preset functions for percentage distribution
	function applyEqualPreset() {
		const numUsers = editedValue.userEntries.length;
		const equalPercentage = Math.floor(100 / numUsers);
		const remainder = 100 % numUsers;

		editedValue.userEntries.forEach((entry, index) => {
			// Distribute remainder across first users (e.g., 3 users = 34%, 33%, 33%)
			const percentage = equalPercentage + (index < remainder ? 1 : 0);
			entry.songPercentage = {
				value: percentage,
				random: false,
				min: 0,
				max: 100
			};
		});
		validateAndAutoSave();
	}

	function applyRandomPreset() {
		editedValue.userEntries.forEach((entry) => {
			entry.songPercentage = {
				value: null,
				random: true,
				min: 0,
				max: 100
			};
		});
		validateAndAutoSave();
	}

	// Validate on mount
	$effect(() => {
		if (editedValue) {
			const validation = validateBatchUserListConfig(editedValue);
			isValid = validation.valid;
			validationMessage = validation.error || '';
		}
	});
</script>

<div class="space-y-6">
	<!-- Info Banner for Live Node -->
	{#if isLiveNode}
		<div class="rounded-lg border border-amber-200 bg-amber-50 p-3">
			<p class="text-xs text-amber-800">
				<strong>Live Node:</strong> User lists are automatically synced from the AMQ lobby. Configure
				this node from the AMQ+ Connector script in-game.
			</p>
		</div>
	{/if}

	<!-- User Entries -->
	<div class="space-y-4">
		<div class="flex flex-col gap-2">
			<div class="flex items-center justify-between">
				<Label class="text-base font-semibold">
					{#if isLiveNode}
						Player Entries
					{:else}
						User Entries
					{/if}
				</Label>
				{#if isBatchUserList}
					<Button size="sm" variant="outline" onclick={addUserEntry} class="" disabled={false}>
						<Plus class="mr-2 h-4 w-4" />
						Add User
					</Button>
				{/if}
			</div>
			<!-- Percentage Presets (compact inline) -->
			{#if isBatchUserList}
				<div class="flex items-center gap-2">
					<span class="text-xs text-gray-600">Presets:</span>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onclick={applyEqualPreset}
						class="h-7 px-2 text-xs"
						disabled={editedValue.userEntries.length === 0}
					>
						Equal
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onclick={applyRandomPreset}
						class="h-7 px-2 text-xs"
						disabled={editedValue.userEntries.length === 0}
					>
						Random
					</Button>
				</div>
			{/if}
		</div>

		<!-- User Entry List -->
		<div class="space-y-4">
			{#each editedValue.userEntries as entry, index (entry.id)}
				<div class="space-y-3 rounded-lg border p-4">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-gray-700">
							{#if isLiveNode}
								Player {index + 1}
							{:else}
								User {index + 1}
							{/if}
						</span>
						{#if isBatchUserList && editedValue.userEntries.length > 1}
							<Button
								size="sm"
								variant="ghost"
								onclick={() => removeUserEntry(index)}
								class="h-8 w-8 p-0"
								disabled={false}
							>
								<Trash2 class="h-4 w-4 text-red-600" />
							</Button>
						{/if}
					</div>

					<!-- Platform & Username -->
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-2">
							<Label class="text-xs">Platform</Label>
							{#if isLiveNode}
								<Input
									value={profileTypes.find((p) => p.value === entry.platform)?.label ||
										entry.platform}
									readonly
									class="h-9 bg-gray-50"
									type="text"
								/>
							{:else}
								<Select.Root
									type="single"
									bind:value={entry.platform}
									onValueChange={() => validateAndAutoSave()}
								>
									<Select.Trigger class="h-9 w-full">
										{profileTypes.find((p) => p.value === entry.platform)?.label ||
											'Select platform'}
									</Select.Trigger>
									<Select.Content class="" portalProps={{}}>
										{#each profileTypes as type (type.value)}
											<Select.Item value={type.value} label={type.label} class="">
												{type.label}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							{/if}
						</div>

						<div class="space-y-2">
							<Label class="text-xs">Username</Label>
							<Input
								bind:value={entry.username}
								placeholder={isLiveNode ? 'Synced from AMQ' : 'Enter username...'}
								oninput={() => validateAndAutoSave()}
								readonly={isLiveNode}
								class="{isLiveNode ? 'bg-gray-50' : ''} h-9"
								type="text"
							/>
						</div>
					</div>

					<!-- List Types to Import -->
					<div class="space-y-2">
						<Label class="text-xs">List Types to Import</Label>
						<div class="flex flex-wrap gap-3">
							{#each Object.entries(entry.selectedLists) as [status, checked]}
								<label class="flex items-center space-x-2">
									<Checkbox
										bind:checked={entry.selectedLists[status]}
										onCheckedChange={() => validateAndAutoSave()}
										disabled={isLiveNode}
										class=""
									/>
									<span class="text-xs capitalize">{status.replace('_', ' ')}</span>
								</label>
							{/each}
						</div>
					</div>

					<!-- Song Percentage Limit -->
					<div class="space-y-2">
						<Label class="text-xs">Song Percentage Limit (Optional)</Label>

						{#if entry.songPercentage}
							<!-- Percentage mode selection (native HTML radio buttons) and remove button -->
							<div class="mb-2 flex items-center justify-between">
								<div class="flex items-center gap-4">
									<label class="flex cursor-pointer items-center gap-2">
										<input
											type="radio"
											name="percentage-mode-{entry.id}"
											checked={!entry.songPercentage.random}
											onchange={() => {
												entry.songPercentage.random = false;
												validateAndAutoSave();
											}}
											class="h-4 w-4"
										/>
										<span class="text-xs font-normal">Static value</span>
									</label>
									<label class="flex cursor-pointer items-center gap-2">
										<input
											type="radio"
											name="percentage-mode-{entry.id}"
											checked={entry.songPercentage.random}
											onchange={() => {
												entry.songPercentage.random = true;
												validateAndAutoSave();
											}}
											class="h-4 w-4"
										/>
										<span class="text-xs font-normal">Random range</span>
									</label>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={false}
									onclick={() => {
										entry.songPercentage = null;
										validateAndAutoSave();
									}}
									class="h-6 px-2 text-xs"
								>
									Remove
								</Button>
							</div>

							{#if entry.songPercentage.random}
								<!-- Random range slider -->
								<div class="space-y-2">
									<div class="px-1">
										<RangeSlider
											values={[entry.songPercentage.min ?? 0, entry.songPercentage.max ?? 100]}
											min={0}
											max={100}
											step={1}
											range
											pushy
											pips
											pipstep={10}
											all="label"
											on:change={(e) => {
												entry.songPercentage.min = e.detail.values[0];
												entry.songPercentage.max = e.detail.values[1];
												validateAndAutoSave();
											}}
											--slider="#6366f1"
											--handle="#6366f1"
											--range="#6366f1"
										/>
									</div>
									<div class="flex items-center justify-center gap-2 text-xs">
										<Input
											class="h-7 w-16 text-center text-xs"
											type="number"
											min={0}
											max={100}
											value={entry.songPercentage.min ?? 0}
											oninput={(e) => {
												entry.songPercentage.min = Math.max(
													0,
													Math.min(100, Number(e.target.value) || 0)
												);
												validateAndAutoSave();
											}}
										/>
										<span class="text-gray-600">to</span>
										<Input
											class="h-7 w-16 text-center text-xs"
											type="number"
											min={0}
											max={100}
											value={entry.songPercentage.max ?? 100}
											oninput={(e) => {
												entry.songPercentage.max = Math.max(
													0,
													Math.min(100, Number(e.target.value) || 100)
												);
												validateAndAutoSave();
											}}
										/>
										<span class="text-gray-600">%</span>
									</div>
								</div>
							{:else}
								<!-- Static value slider -->
								<div class="space-y-2">
									<div class="px-1">
										<RangeSlider
											values={[entry.songPercentage.value ?? 0]}
											min={0}
											max={100}
											step={1}
											pips
											pipstep={25}
											all="label"
											on:change={(e) => {
												entry.songPercentage.value = e.detail.values[0];
												validateAndAutoSave();
											}}
											--slider="#6366f1"
											--handle="#6366f1"
											--range="#6366f1"
										/>
									</div>
									<div class="flex items-center justify-center gap-2 text-xs">
										<Input
											class="h-7 w-16 text-center text-xs"
											type="number"
											min={0}
											max={100}
											placeholder="Leave empty"
											value={entry.songPercentage.value ?? ''}
											oninput={(e) => {
												const val = e.target.value === '' ? null : Number(e.target.value);
												entry.songPercentage.value =
													val !== null ? Math.max(0, Math.min(100, val)) : null;
												validateAndAutoSave();
											}}
										/>
										<span class="text-gray-600">%</span>
									</div>
								</div>
							{/if}
						{:else}
							<!-- Initialize button -->
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={false}
								onclick={() => {
									entry.songPercentage = { value: null, random: false, min: 0, max: 100 };
									validateAndAutoSave();
								}}
								class="h-9 w-full"
							>
								Set Percentage
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<Separator class="" />

	<!-- Node-level Percentage -->
	<div class="space-y-3">
		<Label class="text-base font-semibold">Node-level percentage (Optional)</Label>
		<div class="space-y-3">
			{#if editedValue.songPercentage}
				<!-- Percentage mode selection (native HTML radio buttons) and remove button -->
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-4">
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="radio"
								name="node-percentage-mode"
								checked={!editedValue.songPercentage.random}
								onchange={() => {
									editedValue.songPercentage.random = false;
									validateAndAutoSave();
								}}
								class="h-4 w-4"
							/>
							<span class="text-sm font-normal">Static value</span>
						</label>
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="radio"
								name="node-percentage-mode"
								checked={editedValue.songPercentage.random}
								onchange={() => {
									editedValue.songPercentage.random = true;
									validateAndAutoSave();
								}}
								class="h-4 w-4"
							/>
							<span class="text-sm font-normal">Random range</span>
						</label>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={false}
						onclick={() => {
							editedValue.songPercentage = null;
							validateAndAutoSave();
						}}
						class="text-xs"
					>
						Remove
					</Button>
				</div>

				{#if editedValue.songPercentage.random}
					<!-- Random range slider -->
					<div class="space-y-3">
						<div class="px-2">
							<RangeSlider
								values={[
									editedValue.songPercentage.min ?? 0,
									editedValue.songPercentage.max ?? 100
								]}
								min={0}
								max={100}
								step={1}
								range
								pushy
								pips
								pipstep={10}
								all="label"
								on:change={(e) => {
									editedValue.songPercentage.min = e.detail.values[0];
									editedValue.songPercentage.max = e.detail.values[1];
									validateAndAutoSave();
								}}
								--slider="#6366f1"
								--handle="#6366f1"
								--range="#6366f1"
							/>
						</div>
						<div class="flex items-center justify-center gap-2 text-sm">
							<Input
								class="h-8 w-16 text-center"
								type="number"
								min={0}
								max={100}
								value={editedValue.songPercentage.min ?? 0}
								oninput={(e) => {
									editedValue.songPercentage.min = Math.max(
										0,
										Math.min(100, Number(e.target.value) || 0)
									);
									validateAndAutoSave();
								}}
							/>
							<span class="text-gray-600">to</span>
							<Input
								class="h-8 w-16 text-center"
								type="number"
								min={0}
								max={100}
								value={editedValue.songPercentage.max ?? 100}
								oninput={(e) => {
									editedValue.songPercentage.max = Math.max(
										0,
										Math.min(100, Number(e.target.value) || 100)
									);
									validateAndAutoSave();
								}}
							/>
							<span class="text-gray-600">%</span>
						</div>
					</div>
				{:else}
					<!-- Static value slider -->
					<div class="space-y-3">
						<div class="px-2">
							<RangeSlider
								values={[editedValue.songPercentage.value ?? 0]}
								min={0}
								max={100}
								step={1}
								pips
								pipstep={25}
								all="label"
								on:change={(e) => {
									editedValue.songPercentage.value = e.detail.values[0];
									validateAndAutoSave();
								}}
								--slider="#6366f1"
								--handle="#6366f1"
								--range="#6366f1"
							/>
						</div>
						<div class="flex items-center justify-center gap-2 text-sm">
							<Input
								class="h-8 w-16 text-center"
								type="number"
								min={0}
								max={100}
								placeholder="0"
								value={editedValue.songPercentage.value ?? ''}
								oninput={(e) => {
									const val = e.target.value === '' ? null : Number(e.target.value);
									editedValue.songPercentage.value =
										val !== null ? Math.max(0, Math.min(100, val)) : null;
									validateAndAutoSave();
								}}
							/>
							<span class="text-gray-600">%</span>
						</div>
					</div>
				{/if}
			{:else}
				<!-- Initialize button -->
				<Button
					type="button"
					variant="outline"
					disabled={false}
					onclick={() => {
						editedValue.songPercentage = { value: null, random: false, min: 0, max: 100 };
						validateAndAutoSave();
					}}
					class="w-full"
				>
					Set Node-level percentage
				</Button>
			{/if}

			<p class="text-xs text-gray-600">
				Specify what percentage of the total songs should come from this Batch User List (0-100). If
				any source list has a percentage set, all source lists must have percentages that sum to
				100%.
			</p>
		</div>
	</div>

	<Separator class="" />

	<!-- Use Entire Pool Option -->
	<div class="space-y-3">
		<div class="flex items-center space-x-2">
			<Checkbox
				bind:checked={editedValue.useEntirePool}
				onCheckedChange={handleUseEntirePoolChange}
				id="use-entire-pool"
				class=""
			/>
			<Label for="use-entire-pool" class="cursor-pointer font-semibold text-yellow-900">
				Use the entire pool - ignore all options
			</Label>
		</div>

		{#if editedValue.useEntirePool}
			<div class="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-4">
				<div class="flex items-start gap-3">
					<div class="text-2xl">⚠️</div>
					<div>
						<div class="font-semibold text-yellow-900">Warning: All Filters Bypassed</div>
						<div class="mt-1 text-sm text-yellow-800">
							When this option is enabled, ALL songs from these users will bypass ALL filters in the
							configuration. They will be added directly to the final song pool without any
							filtering applied.
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<Separator class="" />

	<!-- List Distribution Mode -->
	<div class="space-y-3">
		<Label class="text-base font-semibold">List Distribution Mode</Label>
		<div class="space-y-2">
			<Select.Root
				type="single"
				bind:value={editedValue.songSelectionMode}
				onValueChange={() => validateAndAutoSave()}
			>
				<Select.Trigger class="w-full" title="Controls how songs are prioritized during selection">
					{editedValue.songSelectionMode === 'default'
						? 'Random'
						: editedValue.songSelectionMode === 'many-lists'
							? 'All Shared'
							: editedValue.songSelectionMode === 'few-lists'
								? 'No Shared'
								: 'Select distribution mode'}
				</Select.Trigger>
				<Select.Content class="" portalProps={{}}>
					<Select.Item
						value="default"
						label="Random"
						class=""
						title="Random: Songs are selected randomly without prioritizing based on list overlap"
					>
						Random
					</Select.Item>
					<Select.Item
						value="many-lists"
						label="All Shared"
						class=""
						title="All Shared: Prioritizes songs that appear on the most user lists (songs everyone knows)"
					>
						All Shared
					</Select.Item>
					<Select.Item
						value="few-lists"
						label="No Shared"
						class=""
						title="No Shared: Prioritizes songs that appear on the fewest user lists (unique/rare songs)"
					>
						No Shared
					</Select.Item>
				</Select.Content>
			</Select.Root>
			<p class="text-xs text-gray-600">
				Controls how songs are prioritized during selection. "Random" maintains current behavior.
				"All Shared" prioritizes songs that appear on the most user lists (songs everyone knows).
				"No Shared" prioritizes songs that appear on the fewest user lists (unique/rare songs).
			</p>
		</div>
	</div>

	<!-- Validation Error -->
	{#if !isValid && validationMessage}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
			<AlertCircle class="mr-2 inline h-4 w-4" />
			{validationMessage}
		</div>
	{/if}
</div>
