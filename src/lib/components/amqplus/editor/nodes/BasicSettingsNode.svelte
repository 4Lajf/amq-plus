<script>
	/**
	 * Basic Settings Node component for the AMQ+ Editor.
	 * Handles core lobby settings like scoring, answering, players, team size, etc.
	 *
	 * @component
	 */

	import { Handle, Position, useEdges, useNodesData } from '@xyflow/svelte';
	import { NODE_CATEGORIES } from '../utils/nodeDefinitions.js';
	import { formatExecutionChance } from '../utils/displayUtils.js';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import DefaultSettingsModal from '../dialogs/DefaultSettingsModal.svelte';
	import ReadOnlyNodeDialog from '../dialogs/ReadOnlyNodeDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Select from '$lib/components/ui/select/index.js';
	import NodeEditDialog from '$lib/components/amqplus/NodeEditDialog.svelte';
	import RangeInput from '../ui/RangeInput.svelte';
	import PlaybackSpeedDialog, {
		getPlaybackSpeedDisplay
	} from '../dialogs/PlaybackSpeedDialog.svelte';
	import { settingConfigs } from '$lib/components/amqplus/dialog/settingsConfig.js';
	import { getNodeDisplayValue } from '../utils/nodeDefinitions.js';
	import {
		VALIDATION_BOUNDS,
		VALID_OPTIONS,
		clampValue,
		clampRange,
		isValidRange,
		isValidValue,
		ERROR_MESSAGES
	} from '../utils/validationConfig.js';
	import { BASIC_SETTINGS_DEFAULT_SETTINGS } from '../utils/defaultNodeSettings.js';

	/**
	 * @typedef {import('../utils/defaultNodeSettings.js').BasicSettings} BasicSettings
	 */

	/**
	 * Node data structure for Basic Settings.
	 * @typedef {Object} BasicSettingsNodeData
	 * @property {string} id - Node definition ID
	 * @property {'basicSettings'} type - Node category type
	 * @property {string} title - Display title
	 * @property {string} description - Description
	 * @property {string} icon - Emoji icon
	 * @property {string} color - Hex color code
	 * @property {boolean} deletable - Whether node can be deleted
	 * @property {boolean} unique - Whether only one instance is allowed
	 * @property {BasicSettings} defaultValue - Default settings
	 * @property {string} instanceId - Instance identifier
	 * @property {BasicSettings} currentValue - Current configuration values
	 * @property {number} executionChance - Execution probability (0-100)
	 * @property {(payload: {nodeId: string, newValue: any}) => void} [onValueChange] - Callback for value changes
	 * @property {(instanceId: string) => void} [onDelete] - Callback for node deletion
	 * @property {boolean} [userPositioned] - Whether node was manually positioned by user
	 * @property {boolean} [validationError] - Whether node has validation errors
	 * @property {string} [validationShortMessage] - Short validation error message
	 * @property {string} [validationMessage] - Full validation error message
	 * @property {boolean} [selectionModified] - Whether node is affected by selection modifiers
	 * @property {Array} [routeBadges] - Route badges from router connections
	 * @property {BasicSettings} [settings] - Alternative settings property
	 * @property {boolean} [openDefaultSettings] - Flag to open default settings dialog
	 */

	/**
	 * Component props.
	 * @type {{ data: BasicSettingsNodeData }}
	 */
	let { data } = $props();

	// Local state for settings - follow same pattern as other nodes
	/** @type {BasicSettings} */
	let settings = $state(
		/** @type {BasicSettings} */ (
			data.currentValue || data.settings || BASIC_SETTINGS_DEFAULT_SETTINGS
		)
	);
	let isExpanded = $state(true);

	// Watch for openDefaultSettings flag from context menu
	$effect(() => {
		if (data.openDefaultSettings) {
			readOnlyDialogOpen = true;
			// Reset the flag
			data.openDefaultSettings = false;
		}
	});

	// Configure dialogs (Sample Point, Modifiers, Playback Speed)
	let samplePointDialogOpen = $state(false);
	let playbackSpeedDialogOpen = $state(false);
	let defaultSettingsOpen = $state(false);
	let readOnlyDialogOpen = $state(false);

	const samplePointNodeData = $derived({
		id: 'sample-point',
		title: 'Sample Point',
		icon: '🎚️',
		color: data.color,
		currentValue: (() => {
			const v = settings.samplePoint?.value || BASIC_SETTINGS_DEFAULT_SETTINGS.samplePoint.value;
			// Normalize to dialog expected shape
			return {
				useRange: v.useRange ?? false,
				start: v.start ?? 1,
				end: v.end ?? 100,
				staticValue: v.staticValue ?? 20
			};
		})()
	});

	function openSamplePointDialog() {
		samplePointDialogOpen = true;
	}

	function handleSamplePointSave(saveData) {
		if (saveData?.newValue) {
			// Route through validator to auto-bounce into valid range
			updateSetting('samplePoint', saveData.newValue);
		}
	}

	function openPlaybackSpeedDialog() {
		playbackSpeedDialogOpen = true;
	}

	function savePlaybackSpeed(newValue) {
		updateSetting('playbackSpeed', newValue);
	}

	// Monitor changes to settings and notify parent (like other nodes)
	let lastNotifiedSettings = null;
	$effect(() => {
		if (data.onValueChange && settings !== lastNotifiedSettings) {
			lastNotifiedSettings = settings;
			data.onValueChange({
				nodeId: data.instanceId,
				newValue: settings
			});
		}
	});

	// Handle setting changes with auto-bounce to valid values
	function updateSetting(key, newValue) {
		const previous = settings[key] ?? {};

		// Auto-bounce to nearest valid value based on validation rules
		let validValue = newValue;

		switch (key) {
			case 'guessTime': {
				const bounds = VALIDATION_BOUNDS.guessTime;
				const incoming =
					newValue && typeof newValue === 'object'
						? newValue
						: { useRange: false, staticValue: Number(newValue) };
				if (incoming.useRange) {
					const range = { ...previous.value, ...incoming };
					const clamped = clampRange(range, bounds);
					validValue = { useRange: true, min: clamped.min, max: clamped.max };
				} else {
					const sv = clampValue(incoming.staticValue, bounds);
					validValue = {
						useRange: false,
						staticValue: sv,
						min: bounds.min,
						max: bounds.max
					};
				}
				break;
			}
			case 'extraGuessTime': {
				const bounds = VALIDATION_BOUNDS.extraGuessTime;
				const incoming =
					newValue && typeof newValue === 'object'
						? newValue
						: { useRange: false, staticValue: Number(newValue) };
				if (incoming.useRange) {
					const range = { ...previous.value, ...incoming };
					const clamped = clampRange(range, bounds);
					validValue = { useRange: true, min: clamped.min, max: clamped.max };
				} else {
					const sv = clampValue(incoming.staticValue, bounds);
					validValue = {
						useRange: false,
						staticValue: sv,
						min: bounds.min,
						max: bounds.max
					};
				}
				break;
			}
			case 'samplePoint': {
				const bounds = VALIDATION_BOUNDS.samplePoint;
				const incoming =
					newValue && typeof newValue === 'object'
						? newValue
						: { useRange: false, staticValue: Number(newValue) };
				if (incoming.useRange) {
					const range = { ...previous.value, ...incoming };
					const start = clampValue(range.start, bounds);
					const end = clampValue(range.end, bounds);
					validValue = { useRange: true, start: start, end: Math.max(start, end) };
				} else {
					const sv = clampValue(incoming.staticValue, bounds);
					validValue = { useRange: false, staticValue: sv };
				}
				break;
			}
			default: {
				validValue = newValue;
			}
		}

		settings[key] = { ...previous, value: validValue };
		// Parent notification now handled by reactive effect
	}

	// Toggle expanded view
	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	// Get display value for the node
	const displayValue = $derived(
		getNodeDisplayValue({
			id: data.instanceId,
			type: data.type,
			position: { x: 0, y: 0 },
			data: { ...data, currentValue: settings },
			deletable: data.deletable
		})
	);

	// Real-time validation
	/** @type {string[]} */
	let validationErrors = $state([]);
	$effect(() => {
		const errors = [];
		const gt = settings.guessTime?.value || BASIC_SETTINGS_DEFAULT_SETTINGS.guessTime.value;
		const sp = settings.samplePoint?.value || BASIC_SETTINGS_DEFAULT_SETTINGS.samplePoint.value;

		// Execution chance validation
		const execChance = Number(data.executionChance ?? 100); // Use direct default since this is a simple case
		if (!isValidValue(execChance, VALIDATION_BOUNDS.executionChance)) {
			errors.push(
				ERROR_MESSAGES.outOfRange(
					'Execution chance',
					VALIDATION_BOUNDS.executionChance.min,
					VALIDATION_BOUNDS.executionChance.max
				)
			);
		}

		// Guess time validation
		if (gt.useRange) {
			const min = Number(gt.min ?? VALIDATION_BOUNDS.guessTime.min);
			const max = Number(gt.max ?? VALIDATION_BOUNDS.guessTime.max);
			if (!isValidRange(min, max, VALIDATION_BOUNDS.guessTime)) {
				errors.push(
					ERROR_MESSAGES.invalidRange(
						'Guess time',
						VALIDATION_BOUNDS.guessTime.min,
						VALIDATION_BOUNDS.guessTime.max
					)
				);
			}
		} else {
			const sv = Number(
				gt.staticValue ?? BASIC_SETTINGS_DEFAULT_SETTINGS.guessTime.value.staticValue
			);
			if (!isValidValue(sv, VALIDATION_BOUNDS.guessTime)) {
				errors.push(
					ERROR_MESSAGES.outOfRange(
						'Guess time',
						VALIDATION_BOUNDS.guessTime.min,
						VALIDATION_BOUNDS.guessTime.max
					)
				);
			}
		}

		// Extra guess time validation
		const egt =
			settings.extraGuessTime?.value || BASIC_SETTINGS_DEFAULT_SETTINGS.extraGuessTime.value;
		if (egt.useRange) {
			const min = Number(egt.min ?? VALIDATION_BOUNDS.extraGuessTime.min);
			const max = Number(egt.max ?? VALIDATION_BOUNDS.extraGuessTime.max);
			if (!isValidRange(min, max, VALIDATION_BOUNDS.extraGuessTime)) {
				errors.push(
					ERROR_MESSAGES.invalidRange(
						'Extra guess time',
						VALIDATION_BOUNDS.extraGuessTime.min,
						VALIDATION_BOUNDS.extraGuessTime.max
					)
				);
			}
		} else {
			const sv = Number(
				egt.staticValue ?? BASIC_SETTINGS_DEFAULT_SETTINGS.extraGuessTime.value.staticValue
			);
			if (!isValidValue(sv, VALIDATION_BOUNDS.extraGuessTime)) {
				errors.push(
					ERROR_MESSAGES.outOfRange(
						'Extra guess time',
						VALIDATION_BOUNDS.extraGuessTime.min,
						VALIDATION_BOUNDS.extraGuessTime.max
					)
				);
			}
		}

		// Sample point validation
		const spsv = Number(
			sp.staticValue ?? BASIC_SETTINGS_DEFAULT_SETTINGS.samplePoint.value.staticValue
		);
		if (sp.useRange) {
			const start = Number(sp.start ?? VALIDATION_BOUNDS.samplePoint.min);
			const end = Number(sp.end ?? VALIDATION_BOUNDS.samplePoint.max);
			if (!isValidRange(start, end, VALIDATION_BOUNDS.samplePoint)) {
				errors.push(
					ERROR_MESSAGES.invalidRange(
						'Sample point',
						VALIDATION_BOUNDS.samplePoint.min,
						VALIDATION_BOUNDS.samplePoint.max
					)
				);
			}
		} else if (!isValidValue(spsv, VALIDATION_BOUNDS.samplePoint)) {
			errors.push(
				ERROR_MESSAGES.outOfRange(
					'Sample point',
					VALIDATION_BOUNDS.samplePoint.min,
					VALIDATION_BOUNDS.samplePoint.max
				)
			);
		}

		validationErrors = errors;
	});

	const hasValidationError = $derived(validationErrors.length > 0);
	const validationMessage = $derived(validationErrors.join('; '));

	// Dynamic border color for validation state
	const borderColor = $derived(hasValidationError || data.validationError ? '#ef4444' : data.color);

	// Computing Flows-style: check if any Selection Modifier targets this node type
	const edgesStore = useEdges();
	const modifierSourceIds = $derived(Array.from(new Set(edgesStore.current.map((e) => e.source))));
	const modifierSourcesData = $derived(useNodesData(modifierSourceIds));
	const modifierEdges = $derived(
		edgesStore.current.filter((e) =>
			modifierSourcesData.current.some(
				(n) => n && n.id === e.source && n.type === 'selectionModifier'
			)
		)
	);
	const modifierTargets = $derived(Array.from(new Set(modifierEdges.map((e) => e.target))));
	const modifierTargetsData = $derived(useNodesData(modifierTargets));
	const isSelectionModified = $derived(
		modifierTargetsData.current.some((n) => n && n.data?.id === data.id)
	);
	const routeBadges = $derived(Array.isArray(data.routeBadges) ? data.routeBadges : []);
</script>

<div
	class="basic-settings-node relative transition-all duration-200"
	class:expanded={isExpanded}
	style="background: rgba(99, 102, 241, 0.1); border: 2px solid {borderColor}; border-radius: 12px; min-width: {isExpanded
		? '400px'
		: '280px'}; max-width: {isExpanded ? '500px' : '280px'};"
>
	<!-- Input handle (only accepts Router nodes) -->
	<Handle
		type="target"
		position={Position.Left}
		style="width: 12px; height: 12px; background: {data.color}; border: 2px solid white;"
	/>

	<!-- Output handle -->
	<Handle
		type="source"
		position={Position.Right}
		style="width: 12px; height: 12px; background: {data.color}; border: 2px solid white;"
	/>

	<!-- Top-right badges -->
	<div class="absolute -top-2 -right-2 flex flex-col gap-1">
		{#if data.executionChance !== undefined && data.executionChance !== null}
			{@const execChance = /** @type {number | {kind?: string, min?: number, max?: number}} */ (
				data.executionChance
			)}
			{@const executionChanceDisplay = formatExecutionChance(/** @type {any} */ (execChance))}
			{@const isNotDefault =
				typeof execChance === 'object'
					? execChance.kind === 'range' || (execChance.min !== undefined && execChance.min < 100)
					: execChance < 100}
			{#if isNotDefault}
				<Badge
					variant="outline"
					class="border-purple-200 bg-purple-50 text-xs text-purple-700"
					href={undefined}
				>
					{executionChanceDisplay}
				</Badge>
			{/if}
		{/if}

		{#if isSelectionModified}
			<Badge
				variant="outline"
				class="border-amber-200 bg-amber-50 text-xs text-amber-700"
				href={undefined}
			>
				🎯 Modified
			</Badge>
		{/if}

		{#each routeBadges as badge}
			<Badge
				variant="outline"
				class="border-indigo-200 bg-indigo-50 text-xs text-indigo-700"
				title={`Route: ${badge.name}`}
				href={undefined}
			>
				{badge.label}
			</Badge>
		{/each}
	</div>

	<Card class="border-0 bg-transparent shadow-none">
		<CardHeader class="pb-3">
			<div class="flex items-center justify-between">
				<CardTitle class="flex items-center gap-2 text-lg font-semibold text-gray-800">
					<span class="text-xl">{data.icon}</span>
					{isExpanded ? data.title : data.title}
				</CardTitle>
				<Button
					variant="ghost"
					size="sm"
					onclick={toggleExpanded}
					class="h-6 w-6 p-0"
					disabled={false}
				>
					{isExpanded ? '−' : '+'}
				</Button>
			</div>
			{#if isExpanded}
				<p class="text-sm text-gray-600">{data.description}</p>
			{/if}
		</CardHeader>

		{#if isExpanded}
			<CardContent class="space-y-4 pt-0">
				{#if hasValidationError || data.validationError}
					<div class="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
						{#if hasValidationError}
							{validationMessage}
						{:else}
							{data.validationMessage}
						{/if}
					</div>
				{/if}
				<!-- General Settings Section -->
				<div class="space-y-2">
					<h4 class="border-b pb-1 text-sm font-medium text-gray-700">General Settings</h4>
					<div class="grid grid-cols-2 gap-3">
						<!-- Guess Time -->
						<div>
						{#if settings.guessTime?.value !== undefined}
							<RangeInput
								label="Guess Time"
								bind:value={settings.guessTime.value}
								min={VALIDATION_BOUNDS.guessTime.min}
								max={99}
								unit=" seconds"
							/>
						{/if}
						</div>
						<!-- Extra Guess Time -->
						<div>
							{#if settings.extraGuessTime?.value !== undefined}
								<RangeInput
									label="Extra Guess Time"
									bind:value={settings.extraGuessTime.value}
									min={1}
									max={15}
									unit=" seconds"
								/>
							{/if}
						</div>
					</div>
				<!-- Duplicate Shows Toggle -->
				<div class="flex items-center gap-2 pt-2">
					<Checkbox
						checked={settings.duplicateShows.value}
						onCheckedChange={(checked) => {
							settings = {
								...settings,
								duplicateShows: {
									...settings.duplicateShows,
									value: checked
								}
							};
						}}
						id="duplicateShows"
						class=""
					/>
					<Label for="duplicateShows" class="cursor-pointer text-xs">Allow Duplicate Shows</Label>
					<span
						class="text-xs text-gray-500"
						title="When OFF: each anime can only appear once. When ON: reroll picks based on songs already chosen from that anime"
					>
						ⓘ
					</span>
				</div>
				</div>

				<!-- Audio Settings Section -->
				<div class="space-y-2">
					<h4 class="border-b pb-1 text-sm font-medium text-gray-700">Audio Settings</h4>
					<div class="grid grid-cols-3 gap-3">
						<!-- Sample Point -->
						<div class="space-y-1">
							<Label class="text-xs">Sample Point</Label>
							<div class="text-xs text-gray-600">
								{#if settings.samplePoint?.value?.useRange}
									Range: {settings.samplePoint.value.start || 0}% - {settings.samplePoint.value
										.end || 100}%
								{:else}
									Static: {settings.samplePoint?.value?.staticValue || 20}%
								{/if}
							</div>
							<Button
								variant="outline"
								size="sm"
								class="h-6 text-xs"
								onclick={openSamplePointDialog}
								disabled={false}
							>
								Configure
							</Button>
						</div>
						<!-- Playback Speed -->
						<div class="space-y-1">
							<Label class="text-xs">Playback Speed</Label>
							<div class="mb-1 text-xs text-gray-600">
								{getPlaybackSpeedDisplay(settings.playbackSpeed?.value)}
							</div>
							<Button
								variant="outline"
								size="sm"
								class="h-6 text-xs"
								onclick={openPlaybackSpeedDialog}
								disabled={false}
							>
								Configure
							</Button>
						</div>
					</div>
				</div>

				<!-- Song Categories moved to its own node -->
			</CardContent>
		{/if}
	</Card>

	{#if hasValidationError || data.validationError}
		<div
			class="absolute -bottom-2 left-2 rounded bg-red-500 px-2 py-0.5 text-[10px] text-white shadow"
		>
			Error: {hasValidationError ? validationErrors[0] : data.validationShortMessage}
		</div>
	{/if}
</div>

<!-- Configuration Dialogs -->
<NodeEditDialog
	bind:open={samplePointDialogOpen}
	nodeData={samplePointNodeData}
	onSave={handleSamplePointSave}
	onModalClose={() => {}}
	readOnly={false}
/>

<!-- Playback Speed Configuration Dialog -->
{#if settings.playbackSpeed?.value !== undefined}
	<PlaybackSpeedDialog
		bind:open={playbackSpeedDialogOpen}
		bind:value={settings.playbackSpeed.value}
		onSave={savePlaybackSpeed}
	/>
{/if}

<!-- Default Settings Modal -->
<DefaultSettingsModal bind:isOpen={defaultSettingsOpen} nodeData={data} />

<!-- Read-Only Default Settings Dialog -->
<ReadOnlyNodeDialog bind:open={readOnlyDialogOpen} nodeData={data} onClose={() => {}} />

<style>
	.basic-settings-node {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.basic-settings-node.expanded {
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
	}
</style>
