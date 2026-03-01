<script>
	import { updateBasicSettings, updateNumberOfSongs } from './editor2State.svelte.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { route } = $props();
	let expanded = $state(false);

	let bs = $derived(route.basicSettings);
	let nos = $derived(route.numberOfSongs);

	let guessTimeDisplay = $derived.by(() => {
		const gt = bs.guessTime?.value ?? bs.guessTime;
		if (!gt) return '20s';
		return gt.useRange ? `${gt.min}-${gt.max}s` : `${gt.staticValue}s`;
	});

	let extraTimeDisplay = $derived.by(() => {
		const et = bs.extraGuessTime?.value ?? bs.extraGuessTime;
		if (!et) return '0s';
		return et.useRange ? `${et.min}-${et.max}s` : `${et.staticValue}s`;
	});

	let songCountDisplay = $derived.by(() => {
		if (!nos) return '20';
		return nos.useRange ? `${nos.min}-${nos.max}` : `${nos.staticValue}`;
	});

	let sampleDisplay = $derived.by(() => {
		const sp = bs.samplePoint?.value ?? bs.samplePoint;
		if (!sp) return '0-100%';
		return sp.useRange ? `${sp.start}-${sp.end}%` : `${sp.staticValue}%`;
	});

	let speedDisplay = $derived.by(() => {
		const ps = bs.playbackSpeed?.value ?? bs.playbackSpeed;
		if (!ps) return '1x';
		const vals = speedActiveValues(ps);
		return vals.length === 0 ? '1x' : vals.map((v) => `${v}x`).join('/');
	});

	function speedActiveValues(ps) {
		if (ps.randomValues && ps.randomValues.length > 0) return ps.randomValues;
		if (ps.staticValue) return [ps.staticValue];
		return [1];
	}

	let duplicateShows = $derived(bs.duplicateShows?.value ?? true);
	let preventSpam = $derived(bs.preventSameSongSpam?.value ?? false);

	function setGuessTime(key, value) {
		const updated = JSON.parse(JSON.stringify(route.basicSettings));
		const gt = updated.guessTime.value;
		if (key === 'useRange') gt.useRange = value;
		else if (key === 'staticValue') gt.staticValue = Math.max(1, Math.min(60, value));
		else if (key === 'min') gt.min = Math.max(1, Math.min(gt.max, value));
		else if (key === 'max') gt.max = Math.max(gt.min, Math.min(60, value));
		updateBasicSettings(route.id, updated);
	}

	function setExtraTime(key, value) {
		const updated = JSON.parse(JSON.stringify(route.basicSettings));
		const et = updated.extraGuessTime.value;
		if (key === 'useRange') et.useRange = value;
		else if (key === 'staticValue') et.staticValue = Math.max(0, Math.min(15, value));
		else if (key === 'min') et.min = Math.max(0, Math.min(et.max, value));
		else if (key === 'max') et.max = Math.max(et.min, Math.min(15, value));
		updateBasicSettings(route.id, updated);
	}

	function setSongCount(key, value) {
		const updated = JSON.parse(JSON.stringify(route.numberOfSongs));
		if (key === 'useRange') updated.useRange = value;
		else if (key === 'staticValue') updated.staticValue = Math.max(1, Math.min(100, value));
		else if (key === 'min') updated.min = Math.max(1, Math.min(updated.max, value));
		else if (key === 'max') updated.max = Math.max(updated.min, Math.min(100, value));
		updateNumberOfSongs(route.id, updated);
	}

	function setSamplePoint(key, value) {
		const updated = JSON.parse(JSON.stringify(route.basicSettings));
		const sp = updated.samplePoint.value;
		if (key === 'useRange') sp.useRange = value;
		else if (key === 'staticValue') sp.staticValue = Math.max(0, Math.min(100, value));
		else if (key === 'start') sp.start = Math.max(0, Math.min(sp.end, value));
		else if (key === 'end') sp.end = Math.max(sp.start, Math.min(100, value));
		updateBasicSettings(route.id, updated);
	}

	const SPEED_OPTIONS = [
		{ value: 1, label: '1x' },
		{ value: 1.5, label: '1.5x' },
		{ value: 2, label: '2x' },
		{ value: 4, label: '4x' }
	];

	function toggleSpeed(speedValue) {
		const updated = JSON.parse(JSON.stringify(route.basicSettings));
		const ps = updated.playbackSpeed.value;
		const current = speedActiveValues(ps);
		if (current.includes(speedValue)) {
			ps.randomValues = current.filter((v) => v !== speedValue);
		} else {
			ps.randomValues = [...current, speedValue].sort((a, b) => a - b);
		}
		ps.mode = ps.randomValues.length === 1 ? 'static' : 'random';
		ps.staticValue = ps.randomValues[0] ?? 1;
		updateBasicSettings(route.id, updated);
	}

	function toggleDuplicateShows() {
		const updated = JSON.parse(JSON.stringify(route.basicSettings));
		updated.duplicateShows.value = !updated.duplicateShows.value;
		updateBasicSettings(route.id, updated);
	}

	function togglePreventSpam() {
		const updated = JSON.parse(JSON.stringify(route.basicSettings));
		updated.preventSameSongSpam.value = !updated.preventSameSongSpam.value;
		updateBasicSettings(route.id, updated);
	}

	function gridReveal(node, { duration = 260 } = {}) {
		return {
			duration,
			easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
			css: (t) => `display:grid;grid-template-rows:${t}fr;overflow:hidden`
		};
	}
</script>

<div class="border-ed-border border-b">
	<!-- Collapsed summary bar -->
	<button
		class="bg-ed-canvas-inset/40 hover:bg-ed-canvas-inset flex w-full cursor-pointer items-center justify-between border-none px-3.5 py-2 transition-colors duration-150"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex flex-wrap gap-1.5">
			<span
				class="pill font-jb inline-flex items-center gap-1 rounded-[4px] border border-indigo-500/20 bg-indigo-500/8 px-2 py-[3px] text-[11px] font-medium text-indigo-300"
			>
				<span class="text-[10px]">🎵</span>
				<span class="text-indigo-200">{songCountDisplay}</span>
			</span>
			<span
				class="pill font-jb text-ed-fg-subtle inline-flex items-center gap-1 rounded-[4px] border border-amber-500/20 bg-amber-500/6 px-2 py-[3px] text-[11px] font-medium"
			>
				<span class="text-[10px]">⏱</span>
				<span class="text-amber-400">{guessTimeDisplay}</span>
			</span>
			{#if extraTimeDisplay !== '0s'}
				<span
					class="pill font-jb border-ed-border-muted bg-ed-border text-ed-fg-subtle inline-flex items-center gap-1 rounded-[4px] border px-2 py-[3px] text-[11px] font-medium"
				>
					<span class="text-[10px]">+</span>
					<span class="text-ed-fg">{extraTimeDisplay}</span>
				</span>
			{/if}
			<span
				class="pill font-jb border-ed-border-muted bg-ed-border text-ed-fg-subtle inline-flex items-center gap-1 rounded-[4px] border px-2 py-[3px] text-[11px] font-medium"
			>
				<span class="text-[10px]">📍</span>
				<span class="text-ed-fg">{sampleDisplay}</span>
			</span>
			<span
				class="pill font-jb border-ed-border-muted bg-ed-border text-ed-fg-subtle inline-flex items-center gap-1 rounded-[4px] border px-2 py-[3px] text-[11px] font-medium"
			>
				<span class="text-[10px]">▶</span>
				<span class="text-ed-fg">{speedDisplay}</span>
			</span>
			{#if !duplicateShows}
				<span
					class="font-jb bg-ed-red/8 border-ed-red/20 text-ed-red inline-flex items-center rounded-[4px] border px-2 py-[3px] text-[10px] font-semibold"
					>No Dupes</span
				>
			{/if}
			{#if preventSpam}
				<span
					class="font-jb bg-ed-red/8 border-ed-red/20 text-ed-red inline-flex items-center rounded-[4px] border px-2 py-[3px] text-[10px] font-semibold"
					>Anti-Spam</span
				>
			{/if}
		</div>
		<span
			class="text-ed-fg-subtle text-sm leading-none transition-transform duration-200 {expanded
				? 'rotate-180'
				: ''}">▾</span
		>
	</button>

	<!-- Expanded settings -->
	{#if expanded}
		<div transition:gridReveal>
			<div class="header-expanded bg-ed-canvas-subtle/60 flex flex-col gap-2 px-3.5 py-3">
				<!-- Song Count -->
				<div class="flex items-center gap-3">
					<span class="font-dm text-ed-fg-subtle w-[72px] shrink-0 text-xs font-medium">Songs</span>
					<div class="flex flex-1 items-center gap-1.5">
						<button
							class="mode-toggle font-jb cursor-pointer rounded-[4px] border px-2 py-[3px] text-[10px] font-medium whitespace-nowrap transition-all duration-150 {nos.useRange
								? 'bg-ed-blue/13 border-ed-blue/33 text-ed-blue'
								: 'bg-ed-border border-ed-border-muted text-ed-fg-subtle hover:bg-ed-border-muted hover:text-ed-fg'}"
							onclick={() => setSongCount('useRange', !nos.useRange)}
						>
							{nos.useRange ? 'Range' : 'Fixed'}
						</button>
						{#if nos.useRange}
							<input
								type="number"
								class="num-input"
								value={nos.min}
								oninput={(e) => setSongCount('min', parseInt(e.currentTarget.value) || 1)}
							/>
							<span class="text-ed-fg-subtle text-xs">–</span>
							<input
								type="number"
								class="num-input"
								value={nos.max}
								oninput={(e) => setSongCount('max', parseInt(e.currentTarget.value) || 1)}
							/>
						{:else}
							<input
								type="number"
								class="num-input"
								value={nos.staticValue}
								oninput={(e) => setSongCount('staticValue', parseInt(e.currentTarget.value) || 1)}
							/>
						{/if}
					</div>
				</div>

				<!-- Guess Time -->
				<div class="flex items-center gap-3">
					<span class="font-dm text-ed-fg-subtle w-[72px] shrink-0 text-xs font-medium"
						>Guess Time</span
					>
					<div class="flex flex-1 items-center gap-1.5">
						<button
							class="mode-toggle font-jb cursor-pointer rounded-[4px] border px-2 py-[3px] text-[10px] font-medium whitespace-nowrap transition-all duration-150 {bs
								.guessTime.value.useRange
								? 'bg-ed-blue/13 border-ed-blue/33 text-ed-blue'
								: 'bg-ed-border border-ed-border-muted text-ed-fg-subtle hover:bg-ed-border-muted hover:text-ed-fg'}"
							onclick={() => setGuessTime('useRange', !bs.guessTime.value.useRange)}
						>
							{bs.guessTime.value.useRange ? 'Range' : 'Fixed'}
						</button>
						{#if bs.guessTime.value.useRange}
							<input
								type="number"
								class="num-input"
								value={bs.guessTime.value.min}
								oninput={(e) => setGuessTime('min', parseInt(e.currentTarget.value) || 1)}
							/>
							<span class="text-ed-fg-subtle text-xs">–</span>
							<input
								type="number"
								class="num-input"
								value={bs.guessTime.value.max}
								oninput={(e) => setGuessTime('max', parseInt(e.currentTarget.value) || 1)}
							/>
						{:else}
							<input
								type="number"
								class="num-input"
								value={bs.guessTime.value.staticValue}
								oninput={(e) => setGuessTime('staticValue', parseInt(e.currentTarget.value) || 1)}
							/>
						{/if}
						<span class="font-jb text-ed-fg-subtle text-[10px]">sec</span>
					</div>
				</div>

				<!-- Extra Guess Time -->
				<div class="flex items-center gap-3">
					<span class="font-dm text-ed-fg-subtle w-[72px] shrink-0 text-xs font-medium"
						>Extra Time</span
					>
					<div class="flex flex-1 items-center gap-1.5">
						<button
							class="mode-toggle font-jb cursor-pointer rounded-[4px] border px-2 py-[3px] text-[10px] font-medium whitespace-nowrap transition-all duration-150 {bs
								.extraGuessTime.value.useRange
								? 'bg-ed-blue/13 border-ed-blue/33 text-ed-blue'
								: 'bg-ed-border border-ed-border-muted text-ed-fg-subtle hover:bg-ed-border-muted hover:text-ed-fg'}"
							onclick={() => setExtraTime('useRange', !bs.extraGuessTime.value.useRange)}
						>
							{bs.extraGuessTime.value.useRange ? 'Range' : 'Fixed'}
						</button>
						{#if bs.extraGuessTime.value.useRange}
							<input
								type="number"
								class="num-input"
								value={bs.extraGuessTime.value.min}
								oninput={(e) => setExtraTime('min', parseInt(e.currentTarget.value) || 0)}
							/>
							<span class="text-ed-fg-subtle text-xs">–</span>
							<input
								type="number"
								class="num-input"
								value={bs.extraGuessTime.value.max}
								oninput={(e) => setExtraTime('max', parseInt(e.currentTarget.value) || 0)}
							/>
						{:else}
							<input
								type="number"
								class="num-input"
								value={bs.extraGuessTime.value.staticValue}
								oninput={(e) => setExtraTime('staticValue', parseInt(e.currentTarget.value) || 0)}
							/>
						{/if}
						<span class="font-jb text-ed-fg-subtle text-[10px]">sec</span>
					</div>
				</div>

				<!-- Sample Point -->
				<div class="flex items-center gap-3">
					<span class="font-dm text-ed-fg-subtle w-[72px] shrink-0 text-xs font-medium"
						>Sample Pt</span
					>
					<div class="flex flex-1 items-center gap-1.5">
						<button
							class="mode-toggle font-jb cursor-pointer rounded-[4px] border px-2 py-[3px] text-[10px] font-medium whitespace-nowrap transition-all duration-150 {bs
								.samplePoint.value.useRange
								? 'bg-ed-blue/13 border-ed-blue/33 text-ed-blue'
								: 'bg-ed-border border-ed-border-muted text-ed-fg-subtle hover:bg-ed-border-muted hover:text-ed-fg'}"
							onclick={() => setSamplePoint('useRange', !bs.samplePoint.value.useRange)}
						>
							{bs.samplePoint.value.useRange ? 'Range' : 'Fixed'}
						</button>
						{#if bs.samplePoint.value.useRange}
							<input
								type="number"
								class="num-input"
								value={bs.samplePoint.value.start}
								oninput={(e) => setSamplePoint('start', parseInt(e.currentTarget.value) || 0)}
							/>
							<span class="text-ed-fg-subtle text-xs">–</span>
							<input
								type="number"
								class="num-input"
								value={bs.samplePoint.value.end}
								oninput={(e) => setSamplePoint('end', parseInt(e.currentTarget.value) || 0)}
							/>
						{:else}
							<input
								type="number"
								class="num-input"
								value={bs.samplePoint.value.staticValue}
								oninput={(e) => setSamplePoint('staticValue', parseInt(e.currentTarget.value) || 0)}
							/>
						{/if}
						<span class="font-jb text-ed-fg-subtle text-[10px]">%</span>
					</div>
				</div>

				<!-- Playback Speed -->
				<div class="flex items-center gap-3">
					<span class="font-dm text-ed-fg-subtle w-[72px] shrink-0 text-xs font-medium">Speed</span>
					<div class="flex items-center gap-1">
						{#each SPEED_OPTIONS as opt}
							{@const active = speedActiveValues(bs.playbackSpeed.value).includes(opt.value)}
							<button
								class="speed-chip font-jb cursor-pointer rounded-[4px] border px-2 py-[3px] text-[10px] font-medium whitespace-nowrap transition-all duration-150 {active
									? 'bg-ed-blue/15 border-ed-blue/40 text-ed-blue'
									: 'bg-ed-border border-ed-border-muted text-ed-fg-subtle hover:bg-ed-border-muted hover:text-ed-fg'}"
								onclick={() => toggleSpeed(opt.value)}
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Toggles -->
				<div class="mt-1 flex items-center gap-2">
					<button
						class="font-dm inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 {duplicateShows
							? 'text-ed-green border-ed-green/33 bg-ed-green/7'
							: 'text-ed-fg-subtle bg-ed-border border-ed-border-muted hover:bg-ed-border-muted'}"
						onclick={toggleDuplicateShows}
					>
						<span class="w-3 text-center text-[11px]">{duplicateShows ? '✓' : ''}</span>
						Duplicate Shows
					</button>
					<Tooltip.Provider>
						<Tooltip.Root delayDuration={300}>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										class="font-dm inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 {preventSpam
											? 'text-ed-green border-ed-green/33 bg-ed-green/7'
											: 'text-ed-fg-subtle bg-ed-border border-ed-border-muted hover:bg-ed-border-muted'}"
										onclick={togglePreventSpam}
									>
										<span class="w-3 text-center text-[11px]">{preventSpam ? '✓' : ''}</span>
										Anti Song Spam
										<span class="text-[11px] leading-none opacity-100">?</span>
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content sideOffset={6} class="max-w-[220px] text-center leading-snug">
								Prevents the same song from appearing in consecutive rounds across the entire room,
								regardless of which route picked it.
							</Tooltip.Content>
						</Tooltip.Root>
					</Tooltip.Provider>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.header-expanded {
		min-height: 0;
	}

	.num-input {
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		color: #c9d1d9;
		background: #0d1117;
		border: 1px solid #21262d;
		border-radius: 4px;
		padding: 3px 6px;
		width: 50px;
		text-align: center;
		outline: none;
		transition: border-color 0.15s ease;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.num-input:focus {
		border-color: #58a6ff;
	}
	.num-input::-webkit-inner-spin-button,
	.num-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
