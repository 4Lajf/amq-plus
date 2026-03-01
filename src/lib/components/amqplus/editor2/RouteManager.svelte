<script>
	import RouteContainer from './RouteContainer.svelte';
	import {
		routes,
		addRoute
	} from './editor2State.svelte.js';
</script>

<div class="flex flex-col max-w-[900px] mx-auto">
	{#each routes as route, i (route.id)}
		<RouteContainer {route} index={i} />

		{#if i < routes.length - 1}
			<div class="flex items-center justify-center py-3">
				<div class="w-full h-px bg-linear-to-r from-transparent via-ed-border-muted to-transparent"></div>
			</div>
		{/if}
	{/each}

	<button
		class="flex items-center justify-center gap-2 w-full p-3.5 mt-4 bg-transparent border-[1.5px] border-dashed border-ed-border-muted rounded-lg text-ed-fg-subtle font-dm text-[13px] font-medium cursor-pointer transition-all duration-200 hover:border-ed-blue/33 hover:text-ed-blue hover:bg-ed-blue/3"
		onclick={addRoute}
	>
		<span class="text-lg font-light leading-none">+</span>
		<span>Add Route</span>
	</button>
</div>
