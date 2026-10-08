<script>
	import { beforeNavigate, goto } from '$app/navigation';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	let { dirty = false, builder = 'builder' } = $props();
	let open = $state(false);
	let pending = null;
	let allowNext = false;
	let opener = null;
	let clickedLink = null;
	function rememberLink(event) {
		clickedLink = event.target instanceof Element ? event.target.closest('a[href]') : null;
	}
	beforeNavigate((navigation) => {
		if (allowNext) {
			allowNext = false;
			return;
		}
		// The browser owns refresh, tab-close, and external-navigation warnings.
		if (!dirty || navigation.willUnload || !navigation.to) return;
		navigation.cancel();
		if (open) return;
		pending = {
			url: navigation.to.url,
			delta: navigation.type === 'popstate' ? navigation.delta : null
		};
		opener =
			navigation.type === 'link' && clickedLink instanceof HTMLElement
				? clickedLink
				: document.activeElement instanceof HTMLElement
					? document.activeElement
					: null;
		open = true;
	});
	async function leave() {
		const target = pending;
		pending = null;
		open = false;
		if (!target) return;
		allowNext = true;
		if (target.delta != null) {
			history.go(target.delta);
			return;
		}
		try {
			await goto(target.url);
		} finally {
			allowNext = false;
		}
	}
</script>

<svelte:document onclickcapture={rememberLink} />

<AlertDialog.Root bind:open>
	<AlertDialog.Content
		class=""
		portalProps={{}}
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			opener?.focus();
		}}
	>
		<AlertDialog.Header class="">
			<AlertDialog.Title class="">Leave the {builder}?</AlertDialog.Title>
			<AlertDialog.Description class=""
				>Your local draft is saved and can be restored when you return.</AlertDialog.Description
			>
		</AlertDialog.Header>
		<AlertDialog.Footer class="">
			<AlertDialog.Cancel class="">Stay here</AlertDialog.Cancel>
			<AlertDialog.Action class="" onclick={leave}>Leave builder</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
