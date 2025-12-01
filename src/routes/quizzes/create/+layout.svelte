<script>
	import '../../../app.css'; // Import global styles, including Tailwind
	import '$lib/styles/amqplus.css'; // Import AMQ PLUS specific styles
</script>

<!-- Fullscreen layout without navbar and footer - override parent layout -->
<div class="fixed inset-0 z-50 overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
	<slot />
</div>

<style>
	/* Override the dark theme for AMQ PLUS pages */
	:global(body) {
		background-color: white;
		color: rgb(17 24 39); /* gray-900 */
		overflow: hidden; /* Prevent scrolling on body */
	}

	/* Hide the parent layout content */
	:global(body > div:first-child) {
		display: none;
	}
</style>
