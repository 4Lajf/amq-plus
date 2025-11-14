<script>
	/**
	 * Live Node Settings Form
	 * Read-only display of live node configuration from AMQ.
	 * Shows players' lists but doesn't allow editing from this side.
	 *
	 * @component
	 */

	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import RangeSlider from 'svelte-range-slider-pips';

	/** @type {Object} */
	let {
		editedValue = $bindable(),
		isValid = $bindable(true),
		validationMessage = $bindable(''),
		onAutoSave
	} = $props();

	// Ensure editedValue has required structure
	$effect(() => {
		if (!editedValue) {
			editedValue = {
				useEntirePool: false,
				userEntries: [],
				songPercentage: null
			};
		}
		if (!editedValue.userEntries) {
			editedValue.userEntries = [];
		}
		if (editedValue.useEntirePool === undefined) {
			editedValue.useEntirePool = false;
		}
		if (editedValue.songPercentage === undefined) {
			editedValue.songPercentage = null;
		}

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
	});

	// Validation function
	function validateAndAutoSave() {
		if (onAutoSave) {
			onAutoSave();
		}
	}

	// Player count
	const playerCount = $derived(editedValue?.userEntries?.length || 0);

	// Safe access to useEntirePool with default
	const useEntirePool = $derived(editedValue?.useEntirePool || false);

	// Platform badge colors
	function getPlatformColor(platform) {
		switch (platform) {
			case 'anilist':
				return 'bg-blue-100 text-blue-800 border-blue-300';
			case 'mal':
				return 'bg-green-100 text-green-800 border-green-300';
			case 'kitsu':
				return 'bg-purple-100 text-purple-800 border-purple-300';
			default:
				return 'bg-gray-100 text-gray-800 border-gray-300';
		}
	}

	// Format platform name
	function formatPlatform(platform) {
		switch (platform) {
			case 'anilist':
				return 'AniList';
			case 'mal':
				return 'MyAnimeList';
			case 'kitsu':
				return 'Kitsu';
			default:
				return platform;
		}
	}

	// Format percentage display
	function formatPercentage(entry) {
		if (!entry.songPercentage) {
			return 'No limit';
		}
		if (entry.songPercentage.random) {
			return `${entry.songPercentage.min || 0}% - ${entry.songPercentage.max || 100}% (random)`;
		}
		return `${entry.songPercentage.value || 0}%`;
	}

	// Get selected lists display
	function getSelectedListsDisplay(entry) {
		const lists = [];
		if (entry.selectedLists?.completed) lists.push('Completed');
		if (entry.selectedLists?.watching) lists.push('Watching');
		if (entry.selectedLists?.planning) lists.push('Planning');
		if (entry.selectedLists?.on_hold) lists.push('On Hold');
		if (entry.selectedLists?.dropped) lists.push('Dropped');
		return lists.length > 0 ? lists.join(', ') : 'None';
	}
</script>

<div class="space-y-4">
	<!-- Info Banner -->
	<div class="rounded-lg border border-blue-200 bg-blue-50 p-3">
		<div class="flex items-start gap-2">
			<svg
				class="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600"
				fill="currentColor"
				viewBox="0 0 20 20"
			>
				<path
					fill-rule="evenodd"
					d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
					clip-rule="evenodd"
				/>
			</svg>
			<div class="flex-1 text-xs text-blue-800">
				<p class="mb-1 font-semibold">Configured from AMQ</p>
				<p class="text-blue-700">
					This node is configured from the Anime Music Quiz side. Player lists are gathered
					automatically from the lobby. To modify player lists, use the sync controls in AMQ. You
					can toggle the filter bypass here.
				</p>
			</div>
		</div>
	</div>

	<!-- Use Entire Pool Toggle -->
	<div class="space-y-2">
		<Label class="text-xs">Use Entire Pool</Label>
		<div class="flex items-center space-x-2">
			<input
				type="checkbox"
				checked={useEntirePool}
				onchange={(e) => {
					if (e.target instanceof HTMLInputElement) {
						if (!editedValue) {
							editedValue = {
								useEntirePool: false,
								userEntries: [],
								songPercentage: null
							};
						}
						editedValue.useEntirePool = e.target.checked;
						if (onAutoSave) {
							onAutoSave();
						}
					}
				}}
				class="h-4 w-4 cursor-pointer rounded border-gray-300"
			/>
			<span class="text-xs text-gray-600"> Use the entire pool - ignore all options </span>
		</div>
	</div>

	<!-- Node-level Percentage -->
	<div class="space-y-3">
		<Label for="live-node-song-percentage" class="text-base font-semibold">
			Node-level percentage (Optional)
		</Label>
		<div class="space-y-3">
			{#if editedValue.songPercentage}
				<!-- Random toggle and remove button -->
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-2">
						<Checkbox
							id="live-node-song-percentage-random"
							bind:checked={editedValue.songPercentage.random}
							onCheckedChange={() => validateAndAutoSave()}
							class=""
						/>
						<Label for="live-node-song-percentage-random" class="text-sm font-normal">
							Use random range
						</Label>
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
				Specify what percentage of the total songs should come from this Live Node (0-100). If any
				source list has a percentage set, all source lists must have percentages that sum to 100%.
			</p>
		</div>
	</div>
</div>
