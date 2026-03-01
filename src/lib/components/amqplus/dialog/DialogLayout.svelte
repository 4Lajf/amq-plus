<script>
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	let {
		open = $bindable(false),
		nodeData = $bindable(null),
		dialogSize = 'medium',
		isValid = true,
		getNodeColor = () => '#6366f1',
		onSave = () => {},
		onCancel = () => {},
		onModalClose = () => {},
		readOnly = false,
		children
	} = $props();

	function handleSave() {
		if (!isValid || !nodeData) return;
		onSave();
		open = false;
		// Call the modal close callback as a safety measure
		onModalClose();
	}

	function handleCancel() {
		onCancel();
		open = false;
		// Call the modal close callback as a safety measure
		onModalClose();
	}
</script>

<Dialog
	{open}
	onOpenChange={(v) => {
		open = v;
		// If dialog is being closed, call the modal close callback
		if (!v) {
			onModalClose();
		}
	}}
>
	<!-- Apply a dynamic class based on the 'size' from config -->
	<DialogContent
		class="dialog-size-{dialogSize} flex max-h-[90vh] flex-col"
		showCloseButton={false}
		portalProps={{}}
	>
		<!-- UNIFIED LAYOUT FOR ALL DIALOG SIZES -->
		<DialogHeader
			class="shrink-0 {dialogSize === 'fullscreen' ? 'px-4 pt-0 pb-0 text-center' : 'p-6 pb-4'}"
		>
			<DialogTitle
				class="flex items-center {dialogSize === 'fullscreen'
					? 'justify-center text-2xl'
					: 'text-xl'}"
			>
				<span
					class="mr-3 {dialogSize === 'fullscreen' ? 'mr-3 text-3xl' : 'text-2xl'}"
					style="color: {getNodeColor()}">{nodeData?.icon}</span
				>
				{nodeData?.title}
			</DialogTitle>
		</DialogHeader>

		<div
			class="flex-1 {dialogSize === 'fullscreen'
				? 'space-y-4 p-0 pb-4'
				: 'p-6 pt-0'} overflow-y-auto"
		>
			{@render children()}
		</div>

		<DialogFooter
			class="shrink-0 {dialogSize === 'fullscreen' ? 'flex justify-center gap-4 p-0' : 'p-6 pt-4'}"
		>
			{#if readOnly}
				<Button
					variant="outline"
					onclick={handleCancel}
					class={dialogSize === 'fullscreen' ? 'px-6 py-2' : ''}
					disabled={false}
				>
					Close
				</Button>
			{:else}
				<Button
					variant="outline"
					onclick={handleCancel}
					class={dialogSize === 'fullscreen' ? 'px-6 py-2' : ''}
					disabled={false}
				>
					Cancel
				</Button>
				<Button
					onclick={handleSave}
					disabled={!isValid}
					class="focus:ring-opacity-50 transition-all hover:opacity-90 focus:ring-2 focus:ring-offset-2 {dialogSize ===
					'fullscreen'
						? 'px-6 py-2'
						: ''}"
					style="background-color: {getNodeColor()}; focus-ring-color: {getNodeColor()};"
				>
					Save
				</Button>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>

<style>
	/* Dialog size classes */
	:global(.dialog-size-small) {
		max-width: min(400px, 90vw);
		max-height: 90vh;
	}

	:global(.dialog-size-medium) {
		max-width: min(600px, 90vw);
		max-height: 90vh;
	}

	:global(.dialog-size-large) {
		max-width: min(800px, 90vw);
		max-height: 90vh;
	}

	:global(.dialog-size-fullscreen) {
		width: 95vw;
		height: 90vh;
		max-width: 95vw;
		max-height: 90vh;
	}

	/* Mobile responsive adjustments */
	@media (max-width: 640px) {
		:global(.dialog-size-small),
		:global(.dialog-size-medium),
		:global(.dialog-size-large),
		:global(.dialog-size-fullscreen) {
			max-width: 95vw;
			max-height: 85vh;
			margin: 1rem;
		}
	}
</style>
