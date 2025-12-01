<script>
	/**
	 * Live Node Dialog Wrapper
	 * Shows read-only view of live node data configured from AMQ side.
	 *
	 * @component
	 */

	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import LiveNodeSettingsForm from './LiveNodeSettingsForm.svelte';

	/**
	 * @typedef {Object} Props
	 * @property {boolean} open - Whether the dialog is open
	 * @property {Object} value - Current live node configuration
	 * @property {Function} onSave - Callback when settings are saved (shouldn't happen for Live Node, but kept for consistency)
	 * @property {Object} nodeData - Node metadata (title, icon, color, etc.)
	 */

	/** @type {Props} */
	let { open = $bindable(false), value = $bindable(), onSave, nodeData } = $props();

	// Local edited value for the form
	let editedValue = $state(
		value
			? JSON.parse(JSON.stringify(value))
			: {
					useEntirePool: false,
					userEntries: []
				}
	);

	// Validation state
	let isValid = $state(true);
	let validationMessage = $state('');

	// Reset editedValue when dialog opens or value changes
	$effect(() => {
		if (open && value) {
			editedValue = JSON.parse(JSON.stringify(value));
		}
	});

	// Handle auto-save from form - immediately propagate to parent
	function onAutoSave() {
		// Call onSave to propagate changes immediately
		if (onSave) {
			onSave(editedValue);
		}
	}

	// Handle save button (shouldn't be used for Live Node)
	function handleSave() {
		if (!isValid) {
			return;
		}

		if (onSave) {
			onSave(editedValue);
		}

		open = false;
	}

	// Handle cancel - save changes before closing
	function handleCancel() {
		if (onSave && editedValue) {
			onSave(editedValue);
		}
		open = false;
	}

	// Handle dialog close (clicking outside or escape) - save changes
	function handleOpenChange(newOpen) {
		if (!newOpen) {
			// Save changes before closing
			if (onSave && editedValue) {
				onSave(editedValue);
			}
			open = false;
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="max-h-[90vh] max-w-3xl overflow-y-auto" portalProps={{ class: '' }}>
		<Dialog.Header class="">
			<Dialog.Title class="flex items-center gap-2">
				<span class="text-2xl">{nodeData?.icon || '🔴'}</span>
				<span>{nodeData?.title || 'Live Node Configuration'}</span>
			</Dialog.Title>
		</Dialog.Header>

		<div class="py-4">
			<LiveNodeSettingsForm bind:editedValue bind:isValid bind:validationMessage {onAutoSave} />
		</div>

		<Dialog.Footer class="flex justify-between">
			<Button variant="outline" onclick={handleCancel} class="" disabled={false}>Close</Button>
			<Button
				onclick={handleSave}
				disabled={!isValid}
				class="focus:ring-opacity-50 transition-all hover:opacity-90 focus:ring-2 focus:ring-offset-2"
				style="background-color: {nodeData?.color || '#6366f1'}; focus-ring-color: {nodeData?.color || '#6366f1'};"
			>
				Save
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
