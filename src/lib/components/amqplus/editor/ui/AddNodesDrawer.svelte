<script>
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import {
		FILTER_NODE_DEFINITIONS,
		ROUTER_CONFIG,
		BASIC_SETTINGS_CONFIG,
		NUMBER_OF_SONGS_CONFIG,
		SONG_LIST_CONFIG,
		BATCH_USER_LIST_CONFIG,
		LIVE_NODE_CONFIG,
		NODE_CATEGORIES,
		SELECTION_MODIFIER_CONFIG,
		SOURCE_SELECTOR_CONFIG
	} from '../utils/nodeDefinitions.js';
	import { FilterRegistry } from '../utils/filters/index.js';

	let { isOpen = $bindable(), onAddNode, existingNodes = [] } = $props();

	// Handle adding a node
	function handleAddNode(nodeDefinition) {
		if (onAddNode) {
			onAddNode(nodeDefinition);
		}
	}

	// Get node categories for organization - dynamically from registry
	const allFilters = FilterRegistry.getAll();
	const nodeCategories = {
		'Content Filters': allFilters.map((filter) => filter.id)
	};
	
	// Build filter definitions map from registry
	const filterDefinitionsMap = Object.fromEntries(
		allFilters.map(filter => [
			filter.id,
			{
				id: filter.id,
				type: filter.metadata?.type || NODE_CATEGORIES.FILTER,
				title: filter.metadata?.title || filter.id,
				description: filter.metadata?.description || '',
				icon: filter.metadata?.icon || '🎯',
				color: filter.metadata?.color || '#6366f1',
				deletable: true,
				unique: false,
				formType: filter.formType || 'complex',
				defaultValue: filter.defaultSettings || {}
			}
		])
	);
</script>

<!-- Panel overlay -->
{#if isOpen}
	<div
		class="fixed inset-0 z-40 bg-black/20 transition-opacity"
		role="button"
		tabindex="0"
		aria-label="Close panel"
		onclick={() => (isOpen = false)}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') isOpen = false;
		}}
	></div>
{/if}

<!-- Right side panel -->
<div
	class="fixed top-0 right-0 bottom-0 z-50 w-80 transform border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300"
	class:translate-x-0={isOpen}
	class:translate-x-full={!isOpen}
>
	<div class="flex h-full flex-col">
		<!-- Header -->
		<div class="border-b border-gray-200 p-4">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-800">Add Nodes</h2>
				<Button variant="ghost" size="sm" class="" disabled={false} onclick={() => (isOpen = false)}
					>×</Button
				>
			</div>
			<p class="mt-1 text-sm text-gray-600">
				Add filter nodes to customize your quiz configuration
			</p>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto p-4">
			<div class="space-y-6">
				<!-- Source nodes section -->
				<div class="space-y-3">
					<h3 class="border-b pb-1 text-sm font-medium text-gray-700">Source Nodes</h3>

					<!-- Song List -->
					<Card
						class="cursor-pointer border-blue-200 bg-blue-50 transition-all duration-200 hover:shadow-md"
						onclick={() => handleAddNode(SONG_LIST_CONFIG)}
					>
						<CardContent class="p-3">
							<div class="flex items-start gap-3">
								<div
									class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-sm text-blue-600"
								>
									📋
								</div>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h4 class="text-sm font-medium text-gray-800">Song List</h4>
									</div>
									<p class="text-xs text-gray-600">Choose base song pool (can add multiple)</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<!-- Batch User List -->
					<Card
						class="cursor-pointer border-purple-200 bg-purple-50 transition-all duration-200 hover:shadow-md"
						onclick={() => handleAddNode(BATCH_USER_LIST_CONFIG)}
					>
						<CardContent class="p-3">
							<div class="flex items-start gap-3">
								<div
									class="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-sm text-purple-600"
								>
									👥
								</div>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h4 class="text-sm font-medium text-gray-800">Batch User List</h4>
									</div>
									<p class="text-xs text-gray-600">
										Import multiple user lists at once (can add multiple)
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<!-- Live Node -->
					<Card
						class="cursor-pointer border-red-200 bg-red-50 transition-all duration-200 hover:shadow-md"
						onclick={() => handleAddNode(LIVE_NODE_CONFIG)}
					>
						<CardContent class="p-3">
							<div class="flex items-start gap-3">
								<div
									class="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-sm text-red-600"
								>
									🔴
								</div>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h4 class="text-sm font-medium text-gray-800">Live Node</h4>
									</div>
									<p class="text-xs text-gray-600">
										Gathers lists from players in the room (configured from AMQ)
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				<!-- Node categories -->
				{#each Object.entries(nodeCategories) as [categoryName, nodeIds]}
					<div class="space-y-3">
						<h3 class="border-b pb-1 text-sm font-medium text-gray-700">
							{categoryName}
						</h3>

						<div class="space-y-2">
							{#each nodeIds as nodeId}
								{@const nodeDefinition = filterDefinitionsMap[nodeId]}

								<Card
									class="cursor-pointer transition-all duration-200 hover:shadow-md"
									onclick={() => handleAddNode(nodeDefinition)}
								>
									<CardContent class="p-3">
										<div class="flex items-start gap-3">
											<!-- Icon -->
											<div
												class="flex h-8 w-8 items-center justify-center rounded-lg text-sm"
												style="background: rgba({nodeDefinition.color
													.slice(1)
													.match(/.{2}/g)
													.map((hex) => parseInt(hex, 16))
													.join(', ')}, 0.2); color: {nodeDefinition.color};"
											>
												{nodeDefinition.icon}
											</div>

											<!-- Content -->
											<div class="min-w-0 flex-1">
												<div class="mb-1 flex items-center gap-2">
													<h4 class="truncate text-sm font-medium text-gray-800">
														{nodeDefinition.title}
													</h4>
												</div>
												<p class="text-xs leading-relaxed text-gray-600">
													{nodeDefinition.description}
												</p>
											</div>
										</div>
									</CardContent>
								</Card>
							{/each}
						</div>
					</div>
				{/each}

				<!-- Core nodes section -->
				<div class="space-y-3">
					<h3 class="border-b pb-1 text-sm font-medium text-gray-700">Core Nodes</h3>

					<!-- Router -->
					<Card
						class="cursor-pointer border-purple-200 bg-purple-50 transition-all duration-200 hover:shadow-md"
						onclick={() => handleAddNode(ROUTER_CONFIG)}
					>
						<CardContent class="p-3">
							<div class="flex items-start gap-3">
								<div
									class="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-sm text-purple-600"
								>
									🔀
								</div>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h4 class="text-sm font-medium text-gray-800">Route Selector</h4>
									</div>
									<p class="text-xs text-gray-600">Redirects flow - randomly selects one route</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<!-- Basic Settings -->
					<Card
						class="cursor-pointer border-indigo-200 bg-indigo-50 transition-all duration-200 hover:shadow-md"
						onclick={() => handleAddNode(BASIC_SETTINGS_CONFIG)}
					>
						<CardContent class="p-3">
							<div class="flex items-start gap-3">
								<div
									class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-sm text-indigo-600"
								>
									⚙️
								</div>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h4 class="text-sm font-medium text-gray-800">Basic Settings</h4>
									</div>
									<p class="text-xs text-gray-600">Core lobby settings (can add multiple)</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<!-- Number of Songs -->
					<Card
						class="cursor-pointer border-red-200 bg-red-50 transition-all duration-200 hover:shadow-md"
						onclick={() => handleAddNode(NUMBER_OF_SONGS_CONFIG)}
					>
						<CardContent class="p-3">
							<div class="flex items-start gap-3">
								<div
									class="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-sm text-red-600"
								>
									🔢
								</div>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h4 class="text-sm font-medium text-gray-800">Number of Songs</h4>
									</div>
									<p class="text-xs text-gray-600">
										Determines final song count (can add multiple)
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<!-- Selection Modifier -->
					<Card
						class="cursor-pointer border-amber-200 bg-amber-50 transition-all duration-200 hover:shadow-md"
						onclick={() => handleAddNode(SELECTION_MODIFIER_CONFIG)}
					>
						<CardContent class="p-3">
							<div class="flex items-start gap-3">
								<div
									class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-sm text-amber-600"
								>
									🎯
								</div>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h4 class="text-sm font-medium text-gray-800">Selection Modifier</h4>
									</div>
									<p class="text-xs text-gray-600">
										Controls how many instances of connected types are used
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<!-- Source Selector -->
					<Card
						class="cursor-pointer border-orange-200 bg-orange-50 transition-all duration-200 hover:shadow-md"
						onclick={() => handleAddNode(SOURCE_SELECTOR_CONFIG)}
					>
						<CardContent class="p-3">
							<div class="flex items-start gap-3">
								<div
									class="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-sm text-orange-600"
								>
									🔗
								</div>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<h4 class="text-sm font-medium text-gray-800">Source Selector</h4>
									</div>
									<p class="text-xs text-gray-600">
										Restrict a filter to only affect a specific source node
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				<!-- Tips section -->
				<div class="space-y-3">
					<h3 class="border-b pb-1 text-sm font-medium text-gray-700">Tips</h3>

					<Card class="border-yellow-200 bg-yellow-50">
						<CardContent class="p-3">
							<div class="text-sm text-yellow-800">
								<div class="mb-1 font-medium">💡 How it works</div>
								<div class="space-y-1 text-xs">
									<div>• Nodes process songs from left to right</div>
									<div>• Order matters - filters apply left to right</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	</div>
</div>
