<script>
	/**
	 * Batch User List Dialog Wrapper
	 * Wraps the BatchUserListSettingsForm in a dialog component with proper state management.
	 *
	 * @component
	 */

	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import BatchUserListSettingsForm from './BatchUserListSettingsForm.svelte';

	/**
	 * @typedef {Object} Props
	 * @property {boolean} open - Whether the dialog is open
	 * @property {Object} value - Current batch user list configuration
	 * @property {Function} onSave - Callback when settings are saved
	 * @property {Object} nodeData - Node metadata (title, icon, color, etc.)
	 */

	/** @type {Props} */
	let { open = $bindable(false), value = $bindable(), onSave, nodeData } = $props();

	// Local edited value for the form
	let editedValue = $state(value ? JSON.parse(JSON.stringify(value)) : {});

	// Validation state
	let isValid = $state(true);
	let validationMessage = $state('');

	// Reset editedValue when dialog opens or value changes
	$effect(() => {
		if (open && value) {
			editedValue = JSON.parse(JSON.stringify(value));
		}
	});

	// Handle auto-save from form
	function onAutoSave(newValue) {
		editedValue = newValue;
	}

	// Handle save button
	function handleSave() {
		if (!isValid) {
			return;
		}

		if (onSave) {
			onSave(editedValue);
		}

		open = false;
	}

	// Handle cancel
	function handleCancel() {
		open = false;
	}

	// Handle dialog close (clicking outside or escape)
	function handleOpenChange(newOpen) {
		if (!newOpen) {
			open = false;
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="max-h-[90vh] max-w-3xl overflow-y-auto" portalProps={{ class: '' }}>
		<Dialog.Header class="">
			<Dialog.Title class="flex items-center gap-2">
				<span class="text-2xl">{nodeData?.icon || '👥'}</span>
				<span>{nodeData?.title || 'Batch User List Configuration'}</span>
			</Dialog.Title>
			<Dialog.Description class="">
				Import anime lists from multiple users at once. Each user's songs will be combined into a
				single pool.
			</Dialog.Description>
		</Dialog.Header>

		<div class="py-4">
			<BatchUserListSettingsForm
				bind:editedValue
				bind:isValid
				bind:validationMessage
				{onAutoSave}
			/>
		</div>

		<Dialog.Footer class="flex justify-between">
			<Button variant="outline" onclick={handleCancel} class="" disabled={false}>Cancel</Button>
			<Button onclick={handleSave} class="" disabled={!isValid}>Save Changes</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
