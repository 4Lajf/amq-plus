<script>
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		closeOnOutsideClick = false,
		children,
		...restProps
	} = $props();

	let overlayRef = $state(null);

	function handleOverlayClick(e) {
		if (closeOnOutsideClick) {
			e.stopPropagation();
			// Trigger ESC key to close the dialog
			const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
			document.dispatchEvent(escEvent);
		}
	}
</script>

<AlertDialogPrimitive.Portal {...portalProps}>
	<AlertDialogOverlay bind:ref={overlayRef} class="" onclick={handleOverlayClick} />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		class={cn(
			'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</AlertDialogPrimitive.Content>
</AlertDialogPrimitive.Portal>
