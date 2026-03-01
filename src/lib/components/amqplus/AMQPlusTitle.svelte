<script>
	// @ts-ignore
	import { fade } from 'svelte/transition';
	import GradualSpacing from '$lib/components/magic-ui/GradualSpacing.svelte';

	let mounted = $state(false);

	$effect(() => {
		mounted = true;
	});
</script>

<div class="px-4 text-center">
	<h1
		class="xs:text-5xl mb-6 text-4xl leading-tight font-bold sm:text-6xl md:text-7xl lg:text-8xl"
	>
		{#if mounted}
			<GradualSpacing
				words="AMQ PLUS"
				class="amq-gradient-text"
				duration={0.6}
				delayMultiple={0.08}
			/>
		{:else}
			<span class="amq-gradient-text opacity-0">AMQ PLUS</span>
		{/if}
	</h1>

	{#if mounted}
		<div
			class="xs:text-xl mb-4 text-lg font-medium text-gray-600 sm:text-2xl md:text-3xl"
			in:fade={{ duration: 600, delay: 800 }}
		>
			<span class="block sm:inline">Custom Quiz Configurations</span>
			<span class="text-amq-primary mx-2 hidden sm:inline">•</span>
			<span class="block sm:inline">Visual Node Editor</span>
		</div>
	{:else}
		<div
			class="xs:text-xl mb-4 text-lg font-medium text-gray-600 sm:text-2xl md:text-3xl opacity-0"
		>
			<span class="block sm:inline">Custom Quiz Configurations</span>
			<span class="text-amq-primary mx-2 hidden sm:inline">•</span>
			<span class="block sm:inline">Visual Node Editor</span>
		</div>
	{/if}

	{#if mounted}
		<div
			class="mx-auto mt-6 max-w-5xl px-2 text-base leading-relaxed text-gray-500 sm:text-lg md:text-xl"
			in:fade={{ duration: 600, delay: 1000 }}
		>
			Build powerful AMQ lobby configurations with advanced node-based control flow. Design complex
			quiz settings using filters, probabilistic routing, and smart configuration generation.
		</div>
	{:else}
		<div
			class="mx-auto mt-6 max-w-5xl px-2 text-base leading-relaxed text-gray-500 sm:text-lg md:text-xl opacity-0"
		>
			Build powerful AMQ lobby configurations with advanced node-based control flow. Design complex
			quiz settings using filters, probabilistic routing, and smart configuration generation.
		</div>
	{/if}

	<!-- Decorative elements -->
	{#if mounted}
		<div
			class="mt-4 flex justify-center space-x-2"
			in:fade={{ duration: 600, delay: 1200 }}
		>
			<div class="h-2 w-2 animate-pulse rounded-full bg-rose-500"></div>
			<div
				class="h-2 w-2 animate-pulse rounded-full bg-pink-500"
				style="animation-delay: 0.2s;"
			></div>
			<div
				class="h-2 w-2 animate-pulse rounded-full bg-rose-400"
				style="animation-delay: 0.4s;"
			></div>
		</div>
	{:else}
		<div class="mt-4 flex justify-center space-x-2 opacity-0">
			<div class="h-2 w-2 animate-pulse rounded-full bg-rose-500"></div>
			<div
				class="h-2 w-2 animate-pulse rounded-full bg-pink-500"
				style="animation-delay: 0.2s;"
			></div>
			<div
				class="h-2 w-2 animate-pulse rounded-full bg-rose-400"
				style="animation-delay: 0.4s;"
			></div>
		</div>
	{/if}
</div>

<style>
	@import '$lib/styles/amqplus.css';
</style>
