<script>
	import RouteContainer from './RouteContainer.svelte';
	import {
		routes,
		addRoute
	} from './editor2State.svelte.js';

	let enabledCount = $derived(routes.filter((r) => r.enabled).length);
</script>

<div class="flex flex-col max-w-[900px] mx-auto">
	<!--
		Routes are alternatives, not layers. People kept building several routes and
		wondering why the pool was smaller than the union of all of them, so say it.
	-->
	{#if enabledCount > 1}
		<div class="mb-3 flex items-start gap-2 rounded-md border border-ed-blue/25 bg-ed-blue/6 px-3 py-2">
			<span class="text-ed-blue text-[11px] leading-5">🎲</span>
			<span class="font-dm text-ed-fg-subtle text-[11px] leading-relaxed">
				<span class="text-ed-fg font-medium">One route is chosen at random each time the quiz
				generates</span> — routes are alternatives, not layers. The percentages are the odds of each
				one being picked; songs from the other routes are not included in that quiz. To draw from
				several sources in a single quiz, add them to one route with the
				<span class="font-jb text-ed-fg">+</span> on a filter node instead.
			</span>
		</div>
	{/if}

	{#each routes as route, i (route.id)}
		<RouteContainer {route} index={i} />

		{#if i < routes.length - 1}
			<div class="flex items-center justify-center gap-3 py-3">
				<div class="h-px flex-1 bg-linear-to-r from-transparent to-ed-border-muted"></div>
				<span class="font-jb text-ed-fg-subtle shrink-0 text-[10px] tracking-wide uppercase">
					or
				</span>
				<div class="h-px flex-1 bg-linear-to-l from-transparent to-ed-border-muted"></div>
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
