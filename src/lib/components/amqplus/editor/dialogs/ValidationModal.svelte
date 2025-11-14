<script>
	import {
		validateRouterNode,
		validateBasicSettingsNode,
		validateNumberOfSongsNode,
		getInheritedSongTotalForValidation,
		predictOutcomeUniqueBasicsAndSongs,
		generateHumanReport,
		buildValidationDetails,
		getNodeLabel,
		validateConfiguration
	} from '$lib/components/amqplus/editor/utils/validationUtils.js';
	import { NODE_CATEGORIES } from '$lib/components/amqplus/editor/utils/nodeDefinitions.js';
	import { FilterRegistry } from '$lib/components/amqplus/editor/utils/filters/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';

	let {
		isOpen = $bindable(false),
		nodes = [],
		edges = [],
		onClose = () => {},
		onMarkNodeError = () => {},
		onClearAllNodeErrors = () => {}
	} = $props();

	let report = $state(null);

	function validateAll() {
		try {
			onClearAllNodeErrors();

			const { issues, warnings } = validateConfiguration(nodes, edges);

			// Apply errors to nodes
			for (const e of issues) {
				if (e.nodeId) onMarkNodeError(e.nodeId, e.short, e.full, 'error');
			}

			// Apply warnings to nodes
			for (const w of warnings) {
				if (w.nodeId) onMarkNodeError(w.nodeId, w.short, w.full, 'warning');
			}

			// Build report
			const prediction = predictOutcomeUniqueBasicsAndSongs(nodes);
			const human = generateHumanReport(issues, warnings, prediction);
			const details = buildValidationDetails(nodes, edges);
			// Force reactivity by creating a new object
			report = {
				timestamp: new Date().toISOString(),
				errors: issues.map((e) => ({ nodeId: e.nodeId, short: e.short, full: e.full })),
				warnings: warnings.map((w) => ({ nodeId: w.nodeId, short: w.short, full: w.full })),
				prediction,
				human,
				details
			};

			// Show toast based on results - only show once
			if (issues.length > 0) {
				toast.error(
					`Validation failed: ${issues.length} error${issues.length === 1 ? '' : 's'}${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}`
				);
			} else if (warnings.length > 0) {
				toast.warning(
					`Validation passed with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
				);
			} else {
				toast.success('Validation passed');
			}
		} catch (error) {
			console.error('Validation error:', error);
			report = {
				timestamp: new Date().toISOString(),
				errors: [
					{
						nodeId: null,
						short: 'Validation System Error',
						full: `An error occurred during validation: ${error.message}`
					}
				],
				warnings: [],
				prediction: { hasBasics: false, hasSongs: false },
				human: 'Validation failed due to system error',
				details: { basics: [], songs: [], filters: [], routers: [], modifiers: [], totals: {} }
			};
			toast.error('Validation system error occurred');
		}
	}

	// Run validation when modal opens (only once)
	let validationRun = $state(false);
	$effect(() => {
		if (isOpen && !validationRun) {
			validationRun = true;
			validateAll();
		} else if (!isOpen) {
			validationRun = false;
		}
	});
</script>

{#if isOpen}
	<div
		class="absolute inset-0 z-40 flex items-center justify-center bg-black/30"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		onkeydown={(e) => (e.key === 'Escape' ? (isOpen = false) : null)}
		onclick={(e) => {
			if (e.currentTarget === e.target) isOpen = false;
		}}
	>
		<div
			class="max-h-[70vh] w-[720px] max-w-[90vw] overflow-auto rounded-md border bg-white p-4 shadow-xl"
			role="document"
		>
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-base font-semibold">Validation Results</h3>
				<Button
					variant="outline"
					size="sm"
					class=""
					disabled={false}
					onclick={() => (isOpen = false)}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ' ? (isOpen = false) : null)}
					>Close</Button
				>
			</div>

			{#if report}
				<div class="space-y-3 text-sm">
					{#if report.errors?.length}
						<div>
							<div class="mb-1 font-medium text-red-700">Errors</div>
							<ul class="list-disc pl-5 text-xs text-red-700">
								{#each report.errors as e}
									<li>
										<span class="font-semibold">{e.short}</span>{#if e.nodeId}<span
												class="opacity-70"
											>
												(node: {e.nodeId})</span
											>{/if}
										<div class="opacity-90">{e.full}</div>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if report.warnings?.length}
						<div>
							<div class="mb-1 font-medium text-amber-700">Warnings</div>
							<ul class="list-disc pl-5 text-xs text-amber-700">
								{#each report.warnings as w}
									<li>
										<span class="font-semibold">{w.short}</span>{#if w.nodeId}<span
												class="opacity-70"
											>
												(node: {w.nodeId})</span
											>{/if}
										<div class="opacity-90">{w.full}</div>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<div class="space-y-1">
						<div class="mt-2">
							<div class="mb-4 font-medium text-gray-900">Settings Summary</div>
							<div class="grid grid-cols-1 gap-4">
								{#if report.details?.router}
									<div
										class="rounded-lg border border-purple-200 bg-linear-to-r from-purple-50 to-purple-100 shadow-sm"
									>
										<div class="border-b border-purple-200 px-4 py-3">
											<div class="flex items-center gap-2">
												<span class="text-lg">🔀</span>
												<span class="font-semibold text-purple-900">Router</span>
											</div>
										</div>
										<div class="p-4">
											<div class="grid gap-2">
												{#each report.details.router.routes as r}
													<div
														class="flex items-center justify-between rounded-md border border-purple-100 bg-white/70 px-3 py-2"
													>
														<span class="font-medium text-purple-800">{r.name}</span>
														<span
															class="rounded-full bg-purple-600 px-2.5 py-0.5 text-xs font-medium text-white"
															>{r.percentage}%</span
														>
													</div>
												{/each}
											</div>
										</div>
									</div>
								{/if}

								{#if report.details?.basics?.length}
									<div
										class="rounded-lg border border-indigo-200 bg-linear-to-r from-indigo-50 to-indigo-100 shadow-sm"
									>
										<div class="border-b border-indigo-200 px-4 py-3">
											<div class="flex items-center gap-2">
												<span class="text-lg">⚙️</span>
												<span class="font-semibold text-indigo-900">Basic Settings</span>
												<span class="text-xs text-indigo-600">(choose one)</span>
											</div>
										</div>
										<div class="space-y-3 p-4">
											{#each report.details.basics as b}
												<div class="rounded-lg border border-indigo-100 bg-white/80 p-4 shadow-sm">
													<div class="mb-3 flex items-center gap-2">
														<span
															class="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-medium text-white"
															>{Math.round(b.probability * 100)}%</span
														>
													</div>
													<div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
														<div class="flex justify-between">
															<span class="text-gray-600">Guess Time:</span>
															<span class="font-medium text-indigo-900"
																>{b.displayValues?.guessTime?.kind === 'range'
																	? `${b.displayValues.guessTime.min || 0}-${b.displayValues.guessTime.max || 0}s`
																	: `${b.displayValues?.guessTime?.value || 0}s`}</span
															>
														</div>
														<div class="flex justify-between">
															<span class="text-gray-600">Sample Point:</span>
															<span class="font-medium text-indigo-900"
																>{b.displayValues?.samplePoint?.kind === 'range'
																	? `${b.displayValues.samplePoint.min || 0}-${b.displayValues.samplePoint.max || 0}%`
																	: `${b.displayValues?.samplePoint?.value || 0}%`}</span
															>
														</div>
														<div class="col-span-2 flex justify-between">
															<span class="text-gray-600">Playback:</span>
															<span class="font-medium text-indigo-900"
																>{b.displayValues?.playbackSpeed?.kind === 'static'
																	? `${b.displayValues.playbackSpeed.value}x`
																	: b.displayValues?.playbackSpeed?.values
																		? `random: ${b.displayValues.playbackSpeed.values.join(', ')}x`
																		: 'N/A'}</span
															>
														</div>
														{#if b.displayValues?.modifiers?.length > 0}
															<div class="col-span-2 flex justify-between">
																<span class="text-gray-600">Modifiers:</span>
																<span class="font-medium text-indigo-900"
																	>{b.displayValues.modifiers.join(', ')}</span
																>
															</div>
														{/if}
													</div>
												</div>
											{/each}
										</div>
									</div>
								{/if}

								{#if report.details?.numberOfSongs?.length}
									<div
										class="rounded-lg border border-red-200 bg-linear-to-r from-red-50 to-red-100 shadow-sm"
									>
										<div class="border-b border-red-200 px-4 py-3">
											<div class="flex items-center gap-2">
												<span class="text-lg">🎵</span>
												<span class="font-semibold text-red-900">Number of Songs</span>
												<span class="text-xs text-red-600">(choose one)</span>
											</div>
										</div>
										<div class="space-y-2 p-4">
											{#each report.details.numberOfSongs as s}
												<div
													class="flex items-center justify-between rounded-md border border-red-100 bg-white/70 px-4 py-3"
												>
													<div class="flex items-center gap-3">
														<span
															class="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-medium text-white"
															>{Math.round(s.probability * 100)}%</span
														>
													</div>
													<span class="text-lg font-semibold text-red-900">
														{s.displayValues?.kind === 'range'
															? `${s.displayValues.min || 0}-${s.displayValues.max || 0}`
															: s.displayValues?.value || 0} songs
													</span>
												</div>
											{/each}
										</div>
									</div>
								{/if}

								{#if report.details?.filters?.length}
									<div
										class="rounded-lg border border-emerald-200 bg-linear-to-r from-emerald-50 to-emerald-100 shadow-sm"
									>
										<div class="border-b border-emerald-200 px-4 py-3">
											<div class="flex items-center gap-2">
												<span class="text-lg">🔍</span>
												<span class="font-semibold text-emerald-900">Filters</span>
											</div>
										</div>
										<div class="space-y-4 p-4">
											{#each report.details.filters as f}
												<div class="rounded-lg border border-emerald-100 bg-white/80 p-4 shadow-sm">
													<div class="mb-3 flex items-center justify-between">
														<div class="flex items-center gap-2">
															<span class="font-semibold text-emerald-900 capitalize"
																>{f.definitionId.replace('-', ' ')}</span
															>
														</div>
														<div class="flex items-center gap-2">
															<span class="text-xs text-emerald-600"
																>P: {Math.round(
																	(f.estimatedExecutionProbability?.min || 0) * 100
																)}%-{Math.round(
																	(f.estimatedExecutionProbability?.max || 0) * 100
																)}%</span
															>
															{#if f.modifier}
																<span
																	class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"
																	>limited</span
																>
															{/if}
														</div>
													</div>
													{#if f.definitionId === 'songs-and-types' && f.settings}
														<div class="space-y-2 rounded-md bg-emerald-50/50 p-3">
															<div class="grid grid-cols-2 gap-4 text-sm">
																<div class="flex justify-between">
																	<span class="text-gray-600">Total Songs:</span>
																	<span class="font-medium text-emerald-900">
																		{f.settings?.total?.kind === 'range'
																			? `${f.settings.total.min || 0}-${f.settings.total.max || 0}`
																			: f.settings?.total?.value || 0}
																	</span>
																</div>
																<div class="flex justify-between">
																	<span class="text-gray-600">Mode:</span>
																	<span class="font-medium text-emerald-900 capitalize"
																		>{f.settings.mode}</span
																	>
																</div>
															</div>
															<div class="border-t border-emerald-200 pt-2">
																<div class="mb-2 text-xs font-medium text-emerald-800">
																	Song Types:
																</div>
																<div class="grid grid-cols-3 gap-2">
																	{#each f.settings.types as t}
																		<div
																			class="rounded border border-emerald-200 bg-white px-2 py-1 text-center"
																		>
																			<div class="text-xs text-gray-600 capitalize">
																				{t.label}
																			</div>
																			<div class="font-medium text-emerald-900">
																				{t?.kind === 'range'
																					? `${t.min || 0}-${t.max || 0}`
																					: t?.value || 0}{f.settings?.mode === 'percentage'
																					? '%'
																					: ''}
																			</div>
																		</div>
																	{/each}
																</div>
															</div>
															<div class="border-t border-emerald-200 pt-2">
																<div class="mb-2 text-xs font-medium text-emerald-800">
																	Song Selection:
																</div>
																<div class="grid grid-cols-2 gap-3">
																	<div class="flex justify-between">
																		<span class="text-xs text-gray-600">Random:</span>
																		<span class="text-xs font-medium text-emerald-900">
																			{f.settings?.songSelection?.random?.kind === 'range'
																				? `${f.settings.songSelection.random.min || 0}-${f.settings.songSelection.random.max || 0}${f.settings?.mode === 'percentage' ? '%' : ''}`
																				: `${f.settings?.songSelection?.random?.value || 0}${f.settings?.mode === 'percentage' ? '%' : ''}`}
																		</span>
																	</div>
																	<div class="flex justify-between">
																		<span class="text-xs text-gray-600">Watched:</span>
																		<span class="text-xs font-medium text-emerald-900">
																			{f.settings?.songSelection?.watched?.kind === 'range'
																				? `${f.settings.songSelection.watched.min || 0}-${f.settings.songSelection.watched.max || 0}${f.settings?.mode === 'percentage' ? '%' : ''}`
																				: `${f.settings?.songSelection?.watched?.value || 0}${f.settings?.mode === 'percentage' ? '%' : ''}`}
																		</span>
																	</div>
																</div>
															</div>
														</div>
													{/if}

													{#if f.definitionId === 'anime-type' && f.settings}
														<div class="rounded-md bg-emerald-50/50 p-3">
															{#if f.settings.mode === 'basic'}
																<div class="mb-2 text-xs font-medium text-emerald-800">
																	Enabled Anime Types:
																</div>
																<div class="flex flex-wrap gap-1">
																	{#each f.settings.enabled || [] as type}
																		<span
																			class="rounded bg-emerald-200 px-2 py-1 text-xs font-medium text-emerald-800 uppercase"
																		>
																			{type}
																		</span>
																	{/each}
																</div>
															{:else}
																<div class="mb-2 text-xs font-medium text-emerald-800">
																	Anime Type Values ({f.settings.mode === 'percentage'
																		? '%'
																		: 'songs'}):
																</div>
																<div class="grid grid-cols-2 gap-2">
																	{#each Object.entries(f.settings.types || {}) as [type, value]}
																		<div class="rounded border border-emerald-200 bg-white px-2 py-1">
																			<div class="text-xs font-medium text-gray-700 uppercase">
																				{type}
																			</div>
																			<div class="text-xs text-gray-600">
																				{value}{f.settings?.mode === 'percentage' ? '%' : ''}
																			</div>
																		</div>
																	{/each}
																</div>
															{/if}
														</div>
													{:else if f.definitionId === 'anime-type' && f.rawCurrentValue}
														<div class="rounded-md bg-emerald-50/50 p-3">
															<div class="mb-2 text-xs font-medium text-emerald-800">
																{#if f.rawCurrentValue.viewMode === 'advanced'}
																	Anime Type Values ({f.rawCurrentValue.mode === 'percentage'
																		? '%'
																		: 'songs'}):
																{:else}
																	Enabled Anime Types:
																{/if}
															</div>
															<div class="grid grid-cols-2 gap-2">
																{#if f.rawCurrentValue.viewMode === 'advanced' && f.rawCurrentValue.advanced}
																	{#each ['tv', 'movie', 'ova', 'ona', 'special'] as type}
																		{#if f.rawCurrentValue.advanced[type]?.enabled}
																			<div
																				class="rounded border border-emerald-200 bg-white px-2 py-1"
																			>
																				<div class="text-xs font-medium text-gray-700 uppercase">
																					{type}
																				</div>
																				<div class="text-xs text-gray-600">
																					{#if f.rawCurrentValue?.advanced?.[type]?.random}
																						{f.rawCurrentValue.advanced[type].min || 0}-{f
																							.rawCurrentValue.advanced[type].max || 0}
																					{:else}
																						{f.rawCurrentValue?.advanced?.[type]?.value || 0}
																					{/if}
																					{f.rawCurrentValue?.mode === 'percentage' ? '%' : ''}
																				</div>
																			</div>
																		{/if}
																	{/each}
																{:else}
																	{#each ['tv', 'movie', 'ova', 'ona', 'special'] as type}
																		{#if f.rawCurrentValue[type]}
																			<div
																				class="rounded border border-emerald-200 bg-white px-2 py-1"
																			>
																				<div class="text-xs font-medium text-gray-700 uppercase">
																					{type}
																				</div>
																				<div class="text-xs text-green-600">✓</div>
																			</div>
																		{/if}
																	{/each}
																{/if}
															</div>
														</div>
													{/if}

													{#if f.definitionId === 'song-categories' && f.settings}
														<div class="rounded-md bg-emerald-50/50 p-3">
															<div class="mb-2 text-xs font-medium text-emerald-800">
																Category Values ({f.settings.mode === 'percentage'
																	? '%'
																	: 'songs'}):
															</div>
															<div class="space-y-2">
																{#each f.settings.rows as rowData}
																	<div>
																		<div class="mb-1 text-xs font-medium text-gray-700 capitalize">
																			{rowData.row}:
																		</div>
																		<div class="flex flex-wrap gap-1">
																			{#each rowData.categories as catData}
																				<span
																					class="inline-block rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800"
																				>
																					{catData?.col}:
																					{#if catData?.kind === 'range'}
																						{catData.min || 0}-{catData.max || 0}
																					{:else}
																						{catData?.value || 0}
																					{/if}
																					{f.settings?.mode === 'percentage' ? '%' : ''}
																				</span>
																			{/each}
																		</div>
																	</div>
																{/each}
															</div>
														</div>
													{:else if f.definitionId === 'song-categories' && f.rawCurrentValue}
														<div class="rounded-md bg-emerald-50/50 p-3">
															<div class="mb-2 text-xs font-medium text-emerald-800">
																{#if f.rawCurrentValue.viewMode === 'advanced'}
																	Category Values ({f.rawCurrentValue.mode === 'percentage'
																		? '%'
																		: 'songs'}):
																{:else}
																	Song Category Status:
																{/if}
															</div>
															<div class="space-y-2">
																{#each ['openings', 'endings', 'inserts'] as row}
																	<div>
																		<div class="mb-1 text-xs font-medium text-gray-700 capitalize">
																			{row}:
																		</div>
																		<div class="flex flex-wrap gap-1">
																			{#if f.rawCurrentValue.viewMode === 'advanced' && f.rawCurrentValue.advanced?.[row]}
																				{#each Object.entries(f.rawCurrentValue.advanced[row]) as [catName, catData]}
																					{#if catData?.enabled}
																						<span
																							class="inline-block rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800"
																						>
																							{#if catData?.random}
																								{catName}: {catData.min || 0}-{catData.max || 0}
																							{:else}
																								{catName}: {catData?.value || 0}
																							{/if}
																						</span>
																					{/if}
																				{/each}
																			{:else}
																				{#each ['standard', 'instrumental', 'chanting', 'character'] as catName}
																					{@const enabled =
																						f.rawCurrentValue[row]?.[catName] || false}
																					<div
																						class="inline-block rounded border border-emerald-200 bg-white px-2 py-1 text-center"
																					>
																						<div class="text-xs font-medium text-gray-700">
																							{catName}
																						</div>
																						<div
																							class="text-xs {enabled
																								? 'text-green-600'
																								: 'text-red-600'}"
																						>
																							{enabled ? '✓' : '✗'}
																						</div>
																					</div>
																				{/each}
																			{/if}
																		</div>
																	</div>
																{/each}
															</div>
														</div>
													{/if}

												{#if f.definitionId === 'song-difficulty' && f.rawCurrentValue}
													{@const filter = FilterRegistry.get('song-difficulty')}
													{@const difficultyDisplay = filter?.extract?.(
														f.rawCurrentValue,
														{ inheritedSongCount: getInheritedSongTotalForValidation() }
													)}
														<div class="rounded-md bg-emerald-50/50 p-3">
															<div class="mb-2 text-xs font-medium text-emerald-800">
																{#if f.rawCurrentValue.viewMode === 'advanced'}
																	Difficulty Ranges:
																{:else}
																	Difficulty Distribution:
																{/if}
															</div>
															{#if f.rawCurrentValue.viewMode === 'advanced'}
																<!-- Advanced mode: show ranges with appropriate mode display -->
																<div class="space-y-2">
																	{#each f.rawCurrentValue.ranges || [] as range, index}
																		<div
																			class="rounded border border-emerald-200 bg-white px-3 py-2"
																		>
																			<div class="flex items-center justify-between">
																				<span class="text-sm font-medium text-emerald-900"
																					>Range {index + 1}</span
																				>
																				<span class="text-sm text-emerald-900"
																					>{range.from || 0}% - {range.to || 0}%</span
																				>
																			</div>
																			<div class="mt-1 text-xs text-gray-600">
																				{#if f.rawCurrentValue.mode === 'percentage'}
																					Song count: {range.songCount || 0}% of songs
																				{:else}
																					Song count: {range.songCount || 0} songs
																				{/if}
																			</div>
																		</div>
																	{/each}
																	{#if (f.rawCurrentValue.ranges || []).length === 0}
																		<div class="py-2 text-center text-gray-500">
																			No ranges defined
																		</div>
																	{/if}
																</div>
															{:else}
																<!-- Basic mode: show actual allocation values -->
																<div class="grid grid-cols-3 gap-2">
																	{#each ['easy', 'medium', 'hard'] as level}
																		{#if difficultyDisplay.difficulties[level]}
																			<div
																				class="rounded border border-emerald-200 bg-white px-2 py-1 text-center"
																			>
																				<div class="text-xs text-gray-600 capitalize">
																					{level}
																				</div>
																				<div class="font-medium text-emerald-900">
																					{#if difficultyDisplay.difficulties[level].kind === 'random' || difficultyDisplay.difficulties[level].kind === 'range'}
																						{#if difficultyDisplay.mode === 'percentage'}
																							{difficultyDisplay.difficulties[level].min ??
																								0}-{difficultyDisplay.difficulties[level].max ?? 0}%
																						{:else}
																							{difficultyDisplay.difficulties[level].min ??
																								0}-{difficultyDisplay.difficulties[level].max ?? 0}
																						{/if}
																					{:else if difficultyDisplay.mode === 'percentage'}
																						{difficultyDisplay.difficulties[level].value ?? 0}%
																					{:else}
																						{difficultyDisplay.difficulties[level].value ?? 0}
																					{/if}
																				</div>
																			</div>
																		{:else}
																			<!-- Show disabled difficulty with gray styling -->
																			<div
																				class="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-center"
																			>
																				<div class="text-xs text-gray-400 capitalize">
																					{level}
																				</div>
																				<div class="valign-middle text-sm text-gray-400">
																					Disabled
																				</div>
																			</div>
																		{/if}
																	{/each}
																</div>
															{/if}
														</div>
													{/if}

													{#if f.definitionId === 'vintage' && f.settings}
														<div class="rounded-md bg-emerald-50/50 p-3">
															<div class="mb-2 text-xs font-medium text-emerald-800">
																Vintage Ranges:
															</div>
															<div class="mb-2 grid grid-cols-2 gap-4 text-sm">
																<div class="flex justify-between">
																	<span class="text-gray-600">Mode:</span>
																	<span class="font-medium text-emerald-900 capitalize"
																		>{f.settings.mode}</span
																	>
																</div>
																<div class="flex justify-between">
																	<span class="text-gray-600">Advanced Total:</span>
																	<span class="font-medium text-emerald-900">
																		{f.settings.mode === 'percentage'
																			? `${f.settings.advancedTotal}%`
																			: `${f.settings.advancedTotal}`}
																	</span>
																</div>
															</div>
															{#if f.settings.remaining > 0}
																<div
																	class="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
																>
																	Remaining {f.settings.mode === 'percentage'
																		? `${f.settings.remaining}%`
																		: `${f.settings.remaining}`}
																	will be randomly distributed across {f.settings.hasRandomRanges
																		? 'random ranges'
																		: 'all ranges'}.
																</div>
															{/if}
															{#if (f.settings.ranges || []).length > 0}
																<div class="space-y-2">
																	{#each f.settings.ranges as entry, index}
																		<div
																			class="rounded border border-emerald-200 bg-white px-3 py-2"
																		>
																			<div class="flex items-center justify-between">
																				<span class="text-sm font-medium text-emerald-900"
																					>Range {index + 1}</span
																				>
																				<span class="text-sm text-emerald-900">
																					{entry.from.season}
																					{entry.from.year} - {entry.to.season}
																					{entry.to.year}
																				</span>
																			</div>
																			{#if entry.source === 'advanced'}
																				<div class="mt-1 text-xs text-emerald-700">
																					{f.settings.mode === 'percentage'
																						? `${entry.value}%`
																						: `${entry.value}`}
																				</div>
																			{:else}
																				<div class="mt-1 text-xs text-amber-600">
																					Random within remaining allocation
																				</div>
																			{/if}
																		</div>
																	{/each}
																</div>
															{:else}
																<div class="py-2 text-center text-gray-500">
																	All years (1944-2025)
																</div>
															{/if}
														</div>
													{/if}

													{#if (f.definitionId === 'player-score' || f.definitionId === 'anime-score') && f.settings}
														<div class="space-y-2 rounded-md bg-emerald-50/50 p-3">
															<div class="text-xs font-medium text-emerald-800">Score Filter:</div>
															<div class="grid grid-cols-2 gap-4 text-sm">
																<div class="flex justify-between">
																	<span class="text-gray-600">Mode:</span>
																	<span class="font-medium text-emerald-900 capitalize"
																		>{f.settings.mode}</span
																	>
																</div>
																<div class="flex justify-between">
																	<span class="text-gray-600">Range:</span>
																	<span class="font-medium text-emerald-900"
																		>{f.settings.min}-{f.settings.max}</span
																	>
																</div>
															</div>
															{#if (f.settings.percentageEntries || []).length > 0}
																<div class="border-t border-emerald-200 pt-2">
																	<div class="mb-1 text-xs font-medium text-emerald-800">
																		Per-score Percentage:
																	</div>
																	<div class="flex flex-wrap gap-1">
																		{#each f.settings.percentageEntries as entry}
																			<span
																				class="inline-block rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800"
																			>
																				{entry.score}: {entry.value}%
																			</span>
																		{/each}
																	</div>
																</div>
															{/if}
															{#if (f.settings.countEntries || []).length > 0}
																<div class="border-t border-emerald-200 pt-2">
																	<div class="mb-1 text-xs font-medium text-emerald-800">
																		Per-score Count:
																	</div>
																	<div class="flex flex-wrap gap-1">
																		{#each f.settings.countEntries as entry}
																			<span
																				class="inline-block rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800"
																			>
																				{entry.score}: {entry.value}
																			</span>
																		{/each}
																	</div>
																</div>
															{/if}
															{#if (f.settings.disabled || []).length > 0}
																<div class="border-t border-emerald-200 pt-2">
																	<div class="mb-1 text-xs font-medium text-emerald-800">
																		Disabled Scores:
																	</div>
																	<div class="flex flex-wrap gap-1">
																		{#each f.settings.disabled as score}
																			<span
																				class="inline-block rounded bg-red-200 px-2 py-0.5 text-xs font-medium text-red-800"
																			>
																				{score}
																			</span>
																		{/each}
																	</div>
																</div>
															{/if}
														</div>
													{/if}

													{#if (f.definitionId === 'genres' || f.definitionId === 'tags') && f.settings}
														<div class="rounded-md bg-emerald-50/50 p-3">
															<div class="mb-2 text-xs font-medium text-emerald-800">
																{f.definitionId === 'genres' ? 'Genres' : 'Tags'} Configuration:
															</div>
															{#if f.settings.mode === 'basic'}
																{#if f.settings.included?.length > 0 || f.settings.excluded?.length > 0 || f.settings.optional?.length > 0}
																	<div class="flex flex-wrap gap-1">
																		{#each f.settings.included as item}
																			<div
																				class="flex items-center gap-1 rounded bg-green-100 px-2 py-1 text-xs text-green-800"
																			>
																				<span class="font-mono text-xs">+</span>
																				<span>{item}</span>
																			</div>
																		{/each}
																		{#each f.settings.excluded as item}
																			<div
																				class="flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs text-red-800"
																			>
																				<span class="font-mono text-xs">−</span>
																				<span>{item}</span>
																			</div>
																		{/each}
																		{#each f.settings.optional as item}
																			<div
																				class="flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs text-amber-800"
																			>
																				<span class="font-mono text-xs">~</span>
																				<span>{item}</span>
																			</div>
																		{/each}
																	</div>
																{:else}
																	<div class="text-xs text-gray-600">
																		No {f.definitionId} configured
																	</div>
																{/if}
															{:else if f.settings.showRates && f.settings.items && f.settings.items.length > 0}
																<div class="space-y-1">
																	<div class="text-xs font-medium text-emerald-800">
																		Advanced Mode ({f.settings.mode === 'percentage'
																			? 'Percentage'
																			: 'Count'}):
																	</div>
																	<div class="flex flex-wrap gap-1">
																		{#each f.settings.items as item}
																			<div
																				class="flex items-center gap-1 rounded px-2 py-1 text-xs {item.status ===
																				'include'
																					? 'bg-green-100 text-green-800'
																					: item.status === 'exclude'
																						? 'bg-red-100 text-red-800'
																						: 'bg-amber-100 text-amber-800'}"
																			>
																				<span class="font-mono text-xs">
																					{item.status === 'include'
																						? '+'
																						: item.status === 'exclude'
																							? '−'
																							: '~'}
																				</span>
																				<span>{item.label}</span>
																				<span class="font-semibold">
																					{item.value}{f.settings.mode === 'percentage' ? '%' : ''}
																				</span>
																			</div>
																		{/each}
																	</div>
																</div>
															{:else if f.settings.showRates && (!f.settings.items || f.settings.items.length === 0)}
																<div class="text-xs text-gray-600">
																	Advanced mode enabled but no {f.definitionId} configured
																</div>
															{:else}
																<div class="text-xs text-gray-600">
																	Advanced mode configuration is not displayed in this summary.
																</div>
															{/if}
														</div>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								{/if}
							</div>
							<div class="mt-2">
								<!-- Prediction (raw) removed -->
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="text-sm text-gray-600">
					<p>⚠️ Validation data not available</p>
					<p class="mt-2 text-xs">
						Unable to load validation results. Please try refreshing the page.
					</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
