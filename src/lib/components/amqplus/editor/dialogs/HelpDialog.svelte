<script>
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { ChevronLeft, ChevronRight, X } from 'lucide-svelte';

	let { open = $bindable() } = $props();

	let currentStep = $state(0);

	const tutorialSteps = [
		{
			title: 'Welcome to AMQ Plus Editor',
			content: `
				<p class="mb-4">This editor uses a node-based system to create complex quiz configurations. Each node represents a different setting or filter that affects your quiz.</p>
				<p class="mb-4"><strong>Key Concepts:</strong></p>
				<ul class="list-disc list-inside space-y-1 text-sm">
					<li><strong>Nodes:</strong> Individual configuration blocks (Basic Settings, Filters, etc.)</li>
					<li><strong>Connections:</strong> Link nodes together to define which components are part of your quiz</li>
					<li><strong>Execution Chance:</strong> Probability that a node will be used (0-100%)</li>
					<li><strong>Multiple Instances:</strong> You can have multiple copies of most node types</li>
				</ul>
			`
		},
		{
			title: 'Available Node Types',
			content: `
				<p class="mb-4">The editor provides several node types for different purposes:</p>
				<div class="space-y-3 text-sm">
					<div class="p-3 bg-blue-50 rounded-lg">
						<p><strong>⚙️ Basic Settings:</strong> Core lobby settings (guess time, extra guess time, sample point, playback speed)</p>
					</div>
					<div class="p-3 bg-green-50 rounded-lg">
						<p><strong>🎵 Songs & Types:</strong> Filter by opening/ending/insert types and selection criteria (random vs watched)</p>
					</div>
					<div class="p-3 bg-purple-50 rounded-lg">
						<p><strong>📅 Vintage:</strong> Filter by anime release year and season ranges</p>
					</div>
					<div class="p-3 bg-red-50 rounded-lg">
						<p><strong>⭐ Song Difficulty:</strong> Filter songs by difficulty rating (easy, medium, hard, custom ranges)</p>
					</div>
					<div class="p-3 bg-orange-50 rounded-lg">
						<p><strong>🏆 Player Score:</strong> Filter by player score requirements</p>
					</div>
					<div class="p-3 bg-cyan-50 rounded-lg">
						<p><strong>⭐ Anime Score:</strong> Filter by anime rating/score</p>
					</div>
					<div class="p-3 bg-yellow-50 rounded-lg">
						<p><strong>📺 Anime Type:</strong> Filter by anime format (TV, Movie, OVA, ONA, Special)</p>
					</div>
					<div class="p-3 bg-pink-50 rounded-lg">
						<p><strong>🏷️ Song Categories:</strong> Filter by song categories (Standard, Instrumental, Chanting, Character)</p>
					</div>
					<div class="p-3 bg-emerald-50 rounded-lg">
						<p><strong>🎭 Genres:</strong> Include/Exclude/Optional genres with percentage/count modes</p>
					</div>
					<div class="p-3 bg-sky-50 rounded-lg">
						<p><strong>🔖 Tags:</strong> Include/Exclude/Optional tags with percentage/count modes</p>
					</div>
					<div class="p-3 bg-indigo-50 rounded-lg">
						<p><strong>🔢 Number of Songs:</strong> Set total song count (static value or range)</p>
					</div>
					<div class="p-3 bg-violet-50 rounded-lg">
						<p><strong>🎯 Selection Modifier:</strong> Control how many instances of connected nodes execute (MIN/MAX)</p>
					</div>
					<div class="p-3 bg-orange-50 rounded-lg">
						<p><strong>🔗 Source Selector:</strong> Restrict a filter to only affect songs from a specific source node (Song List, Batch User List, or Live Node)</p>
					</div>
					<div class="p-3 bg-amber-50 rounded-lg">
						<p><strong>🔀 Router:</strong> Create multiple quiz paths with different percentages</p>
					</div>
					<div class="p-3 bg-teal-50 rounded-lg">
						<p><strong>📋 Song List:</strong> Use entire database, user lists, or saved lists as song sources</p>
					</div>
					<div class="p-3 bg-rose-50 rounded-lg">
						<p><strong>👥 Batch User List:</strong> Import user lists from AniList or MyAnimeList</p>
					</div>
				</div>
			`
		},
		{
			title: 'Getting Started - Basic Workflow',
			content: `
				<p class="mb-4">Follow these steps to create your first quiz:</p>
				<ol class="list-decimal list-inside space-y-2 text-sm">
					<li><strong>Add Basic Settings:</strong> Click "Add Nodes" → "Basic Settings" to configure core lobby settings</li>
					<li><strong>Set Song Count:</strong> Add "Number of Songs" node to specify how many songs your quiz will have</li>
					<li><strong>Add Filters:</strong> Choose relevant filter nodes (Vintage, Difficulty, etc.) to narrow down song selection</li>
					<li><strong>Configure Nodes:</strong> Click on each node to set its specific properties and values</li>
					<li><strong>Connect Nodes:</strong> Drag from one node's output handle to another's input handle to include them in your quiz</li>
					<li><strong>Test Configuration:</strong> Use "Validate & Export" to preview which nodes will execute</li>
					<li><strong>Export Quiz:</strong> Generate the final AMQ configuration file</li>
				</ol>
			`
		},
		{
			title: 'Execution Chance & Selection',
			content: `
				<p class="mb-4">Understanding how nodes are selected and executed:</p>
				
				<div class="space-y-3 text-sm">
					<div class="p-3 bg-blue-50 rounded-lg">
						<p><strong>🎲 Execution Chance:</strong> Each node has a probability (0-100%) of being used</p>
						<ul class="list-disc list-inside mt-2 space-y-1">
							<li><strong>Static:</strong> Fixed percentage (e.g., 75% = executes 75% of the time)</li>
							<li><strong>Range:</strong> Random percentage within range (e.g., 50-100%)</li>
						</ul>
					</div>
					
					<div class="p-3 bg-green-50 rounded-lg">
						<p><strong>📊 Default Behavior:</strong> Most node types execute all instances by default</p>
						<p class="text-xs mt-1"><strong>Exception:</strong> Basic Settings and Number of Songs can only have one instance execute per route</p>
					</div>
					
					<div class="p-3 bg-amber-50 rounded-lg">
						<p><strong>🎯 Selection Modifier:</strong> Control execution with MIN/MAX limits</p>
						<ul class="list-disc list-inside mt-2 space-y-1">
							<li><strong>MIN:</strong> Guarantees at least this many nodes execute (forces if needed)</li>
							<li><strong>MAX:</strong> Stops trying once this many succeed</li>
							<li><strong>Applied per type:</strong> Each connected node type is handled separately</li>
						</ul>
					</div>
					
					<div class="p-3 bg-red-50 rounded-lg">
						<p><strong>🔄 Fallback System:</strong> If all instances of a required type fail their execution chance, one is randomly selected to ensure coverage</p>
					</div>
				</div>
				
				<p class="mt-4 text-sm"><strong>To set execution chance:</strong> Right-click any node → "Set Execution Chance"</p>
			`
		},
		{
			title: 'Source Selector - Advanced Filtering',
			content: `
				<p class="mb-4">The Source Selector node allows you to apply filters to specific song sources, enabling complex multi-source configurations.</p>
				
				<div class="space-y-3 text-sm">
					<div class="p-3 bg-blue-50 rounded-lg">
						<p class="font-semibold mb-2">How It Works:</p>
						<ul class="list-disc list-inside space-y-1 ml-2">
							<li>Connect a Source Selector to a filter's red input handle at the top center</li>
							<li>Configure the Source Selector to target a specific Song List, Batch User List, or Live Node</li>
							<li>That filter will only affect songs from the selected source</li>
							<li>Filters without a Source Selector apply to all sources (default behavior)</li>
						</ul>
					</div>
					
					<div class="p-3 bg-amber-50 rounded-lg">
						<p class="font-semibold mb-2">Important Notes:</p>
						<ul class="list-disc list-inside space-y-1 ml-2">
							<li>Only one Source Selector can be connected to each filter</li>
							<li>Only Source Selector nodes can connect to this red handle</li>
						</ul>
					</div>
			`
		},
		{
			title: 'Router Node - Creating Multiple Quiz Variations',
			content: `
				<p class="mb-4">The Router Node creates multiple quiz variations that can be randomly selected:</p>
				
				<div class="space-y-3 text-sm">
					<div class="p-3 bg-purple-50 rounded-lg">
						<p><strong>🎯 Purpose:</strong> Randomly select different quiz configurations based on percentages</p>
					</div>
					
					<div class="p-3 bg-blue-50 rounded-lg">
						<p><strong>⚙️ How it works:</strong></p>
						<ol class="list-decimal list-inside space-y-1 mt-2">
							<li>Configure multiple routes with names and percentages</li>
							<li>Each route gets a connection handle for linking nodes</li>
							<li>At export time, one route is randomly selected</li>
							<li>Only nodes connected to the selected route are considered</li>
						</ol>
					</div>
				</div>
				
				<div class="mt-4 p-3 bg-amber-50 rounded-lg">
					<p class="text-sm text-amber-800"><strong>⚠️ Important:</strong> Router percentages should add up to 100% for predictable results. The system will normalize percentages if they don't.</p>
				</div>
			`
		},
		{
			title: 'How Song Selection Works',
			content: `
				<p class="mb-4">Understanding how your quiz configuration determines which songs are selected:</p>
				
				<div class="space-y-3 text-sm">
					<div class="p-3 bg-green-50 rounded-lg">
						<p><strong>🎨 Visual Organization:</strong> Node layout is purely for your convenience and doesn't affect quiz generation</p>
						<p class="text-xs mt-1">Arrange nodes however makes sense for your workflow - the system doesn't care about position or order.</p>
					</div>
					
					<div class="p-3 bg-blue-50 rounded-lg">
						<p><strong>🔗 What Actually Matters:</strong> The connections between nodes determine which components are included</p>
						<ul class="list-disc list-inside mt-2 space-y-1">
							<li><strong>Connections:</strong> Link nodes together to include them in your quiz</li>
							<li><strong>Routes:</strong> Router nodes create separate quiz variations with different percentages</li>
							<li><strong>Execution:</strong> All connected nodes are considered regardless of layout</li>
						</ul>
					</div>
					
					<div class="p-3 bg-amber-50 rounded-lg">
						<p><strong>⚙️ What Affects Quiz Generation:</strong> These specific settings matter:</p>
						<ul class="list-disc list-inside mt-2 space-y-1">
							<li><strong>Multiple Routes:</strong> Router nodes create different quiz variations</li>
							<li><strong>Execution Chances:</strong> Probability settings determine if nodes run</li>
							<li><strong>Selection Modifiers:</strong> MIN/MAX controls affect node execution</li>
						</ul>
					</div>
					
					<div class="p-3 bg-purple-50 rounded-lg">
						<p><strong>🎯 Constraint-Based Selection:</strong> The system uses all constraints simultaneously</p>
						<p class="text-xs mt-1">Songs are selected that satisfy ALL criteria at once, not processed in any particular order.</p>
					</div>
				</div>
			`
		},
		{
			title: 'Export Process & Validation',
			content: `
				<p class="mb-4">How your configuration becomes a working AMQ quiz:</p>
				
				<div class="space-y-3 text-sm">
					<div class="p-3 bg-purple-50 rounded-lg">
						<p><strong>🔀 Route Selection:</strong> If Router nodes exist, one route is randomly selected based on configured percentages</p>
						<p class="text-xs mt-1">Determines which connected nodes are considered for the quiz.</p>
					</div>
					
					<div class="p-3 bg-amber-50 rounded-lg">
						<p><strong>🎲 Node Execution:</strong> Each node's execution chance is evaluated</p>
						<ul class="list-disc list-inside mt-2 space-y-1">
							<li><strong>Pass:</strong> Node contributes to final configuration</li>
							<li><strong>Fail:</strong> Node is skipped (unless Selection Modifier forces execution)</li>
							<li><strong>Fallback:</strong> If all instances fail, one is randomly selected</li>
						</ul>
					</div>
					
					<div class="p-3 bg-gray-50 rounded-lg">
						<p><strong>🔄 Configuration Assembly:</strong> Selected nodes combine to create the final quiz</p>
						<ul class="list-disc list-inside mt-2 space-y-1">
							<li><strong>Settings merge:</strong> Node configurations are combined</li>
							<li><strong>Conflict resolution:</strong> Multiple Basic Settings nodes are handled automatically</li>
							<li><strong>Validation:</strong> Final configuration is checked for consistency</li>
							<li><strong>Export:</strong> Configuration is formatted for AMQ use</li>
						</ul>
					</div>
				</div>
				
				<div class="mt-4 p-3 bg-blue-50 rounded-lg">
					<p class="text-sm text-blue-800"><strong>💡 Validation Modal:</strong> Use "Save Quiz" or "Validate" to simulate which nodes will execute and which songs get picked before saving the quiz.</p>
				</div>
			`
		}
	];

	function nextStep() {
		if (currentStep < tutorialSteps.length - 1) {
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	function closeDialog() {
		open = false;
		currentStep = 0;
	}

	// Get current step data
	const currentStepData = $derived(tutorialSteps[currentStep] || tutorialSteps[0]);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[80vh] max-w-2xl overflow-y-auto" portalProps={{}}>
		<Dialog.Header class="">
			<div>
				<Dialog.Title class="text-xl">{currentStepData.title}</Dialog.Title>
				<Dialog.Description class="">
					Step {currentStep + 1} of {tutorialSteps.length}
				</Dialog.Description>
			</div>
		</Dialog.Header>

		<div class="py-4">
			<!-- Progress indicator -->
			<div class="mb-6">
				<div class="flex space-x-1">
					{#each tutorialSteps as _, index}
						<div
							class="h-2 flex-1 rounded-full {index <= currentStep ? 'bg-blue-500' : 'bg-gray-200'}"
						></div>
					{/each}
				</div>
			</div>

			<!-- Step content -->
			<div class="prose prose-sm max-w-none">
				{@html currentStepData.content}
			</div>
		</div>

		<Dialog.Footer class="flex justify-between">
			<Button variant="outline" onclick={prevStep} disabled={currentStep === 0} class="">
				<ChevronLeft class="mr-1 h-4 w-4" />
				Previous
			</Button>

			<span class="text-sm text-gray-500">
				{currentStep + 1} / {tutorialSteps.length}
			</span>

			{#if currentStep === tutorialSteps.length - 1}
				<Button onclick={closeDialog} class="" disabled={false}>Finish Tutorial</Button>
			{:else}
				<Button onclick={nextStep} class="" disabled={false}>
					Next
					<ChevronRight class="ml-1 h-4 w-4" />
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
