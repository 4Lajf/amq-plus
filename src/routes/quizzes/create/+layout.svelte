<script>
	import '../../../app.css';
	import '$lib/styles/amqplus.css';
	import '$lib/styles/dark-form.css';

	/** @type {{children: import('svelte').Snippet}} */
	let { children } = $props();

	$effect(() => {
		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = originalOverflow;
		};
	});
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@300;400;500;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="editor2-layout">
	{@render children()}
</div>

<style>
	:global(body) {
		background-color: #0f1117 !important;
		color: #e2e8f0 !important;
	}

	.editor2-layout {
		position: fixed;
		inset: 0;
		z-index: 50;
		overflow: hidden;
		background: #0f1117;
		font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
	}

	/* Remove blue edges from svelte-dnd-action dragged elements */
	:global(#dnd-action-dragged-el) {
		outline: none !important;
		box-shadow: none !important;
	}
	:global(#dnd-action-dragged-el *) {
		outline: none !important;
	}
</style>
