<script>
	// @ts-nocheck

	import '../app.css';
	import { Toaster } from '$lib/components/ui/sonner';
	import Navbar from '$lib/components/amqplus/Navbar.svelte';
	import Footer from '$lib/components/amqplus/Footer.svelte';

	/**
	 * @typedef {Object} LayoutData
	 * @property {import('@supabase/supabase-js').Session|null} session - User session
	 * @property {import('@supabase/supabase-js').CookieEntry[]} cookies - Cookies array
	 */

	/**
	 * Layout props
	 * @type {{data: LayoutData, children: import('svelte').Snippet}}
	 */
	let { data, children } = $props();
</script>

<div class="relative min-h-screen bg-gradient-to-br from-rose-50 to-pink-50">
	<div class="relative z-10">
		<Toaster richColors />
		<Navbar {data} />
		{@render children()}
		<Footer />
	</div>
</div>

<style>
	/* Override the dark theme for AMQ PLUS pages */
	:global(body) {
		background-color: white;
		color: rgb(17 24 39); /* gray-900 */
	}
</style>
