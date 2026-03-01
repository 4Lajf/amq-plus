<script>
	import RouteHeader from './RouteHeader.svelte';
	import FilterStack from './FilterStack.svelte';
	import {
		routes,
		removeRoute,
		updateRoutePercentage,
		updateRouteName,
		toggleRoute
	} from './editor2State.svelte.js';

	let { route, index } = $props();

	let editingName = $state(false);
	let nameInput = $state(route.name);

	function commitName() {
		updateRouteName(route.id, nameInput);
		editingName = false;
	}

	function handleNameKeydown(e) {
		if (e.key === 'Enter') commitName();
		if (e.key === 'Escape') {
			nameInput = route.name;
			editingName = false;
		}
	}
</script>

<div class="rounded-lg border border-ed-border bg-ed-canvas-default overflow-visible transition-[opacity,border-color] duration-200 hover:border-ed-border-muted {!route.enabled ? 'opacity-45' : ''}">
	<!-- Route chrome bar -->
	<div class="flex items-center justify-between px-3.5 py-2 bg-ed-canvas-inset border-b border-ed-border">
		<div class="flex items-center gap-2.5">
			<button
				class="route-toggle w-8 h-[18px] rounded-[9px] border-none cursor-pointer relative p-0 transition-colors duration-200 {route.enabled ? 'bg-ed-border-muted hover:bg-ed-border-subtle' : 'bg-ed-border hover:bg-ed-border-muted'}"
				aria-label={route.enabled ? 'Disable route' : 'Enable route'}
				onclick={() => toggleRoute(route.id)}
			>
				<span class="absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 {route.enabled ? 'left-[17px] bg-ed-green' : 'left-[3px] bg-ed-border-subtle'}"></span>
			</button>

			{#if editingName}
				<input
					class="font-dm text-[13px] font-semibold text-ed-fg bg-ed-canvas-subtle border border-ed-blue rounded-[4px] px-1.5 py-0.5 outline-none w-[140px]"
					bind:value={nameInput}
					onblur={commitName}
					onkeydown={handleNameKeydown}
				/>
			{:else}
				<button class="font-dm text-[13px] font-semibold text-ed-fg bg-transparent border-none cursor-text px-1 py-0.5 rounded-[4px] transition-colors duration-150 hover:bg-ed-border" ondblclick={() => { editingName = true; nameInput = route.name; }}>
					{route.name}
				</button>
			{/if}
		</div>

		<div class="flex items-center gap-2.5">
			<div class="flex items-center gap-0.5 bg-ed-canvas-subtle border border-ed-border rounded-sm p-0.5 pr-1">
				<input
					type="number"
					class="pct-input font-jb text-xs font-medium text-ed-fg bg-transparent border-none outline-none w-9 text-right px-0.5 py-0.5"
					min="0"
					max="100"
					value={route.percentage}
					oninput={(e) => updateRoutePercentage(route.id, parseInt(/** @type {HTMLInputElement} */(e.target).value) || 0)}
				/>
				<span class="font-jb text-[11px] text-ed-fg-subtle">%</span>
			</div>

			{#if routes.length > 1}
				<button
					class="flex items-center justify-center size-6 text-base bg-transparent border-none rounded-[4px] cursor-pointer transition-all duration-150 text-ed-fg-subtle hover:text-ed-red hover:bg-ed-red/13"
					onclick={() => removeRoute(route.id)}
				>×</button>
			{/if}
		</div>
	</div>

	<!-- Route body -->
	<div class="p-0">
		<RouteHeader {route} />
		<FilterStack {route} />
	</div>
</div>

<style>
	.pct-input {
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.pct-input::-webkit-inner-spin-button,
	.pct-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
