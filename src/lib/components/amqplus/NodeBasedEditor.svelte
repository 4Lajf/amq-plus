<script>
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { goto } from '$app/navigation';

	// Sample node types for the editor
	const nodeTypes = [
		{
			name: 'Song List',
			description: 'Create custom playlists from your favorite songs',
			icon: '🎵',
			color: 'bg-blue-500'
		},
		{
			name: 'Community Quizzes',
			description: 'Access quizzes created by the community',
			icon: '⚙️',
			color: 'bg-purple-500'
		},
		{
			name: 'Content Filters',
			description: 'Filter by type, genre, tags, vintage and more',
			icon: '🔍',
			color: 'bg-red-500'
		},
		{
			name: 'Probabilistic Router',
			description: 'Execute configs with weighted probability',
			icon: '🎲',
			color: 'bg-yellow-500'
		},
		{
			name: 'Advanced Sliders',
			description: 'Control minimum, maximum song selection',
			icon: '📊',
			color: 'bg-green-500'
		},
		{
			name: 'Import AMQ Quizzes',
			description: 'Import your existing quizzes from AMQ',
			icon: '📤',
			color: 'bg-indigo-500'
		}
	];

	function startEditor() {
		goto('/quizzes/create');
	}
</script>

<section class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
	<Card class="border-amq-light relative rounded-xl border bg-white/95 shadow-lg backdrop-blur-sm">
		<CardHeader class="pb-4 text-center">
			<CardTitle class="!text-4xl font-bold text-gray-800 sm:text-3xl">
				Node-Based <span class="amq-gradient-text">Editor</span>
			</CardTitle>
			<p class="mt-2 !text-xl text-gray-600">
				Drag, connect, and configure nodes to create your perfect AMQ lobby setup
			</p>
		</CardHeader>
		<CardContent class="">
			<div class="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
				{#each nodeTypes as nodeType}
					<div class="group relative">
						<div
							class="hover:border-amq-primary/30 rounded-lg border border-gray-200 bg-white p-4 text-center transition-all duration-200 hover:shadow-md"
						>
							<div class="mb-2 text-2xl">{nodeType.icon}</div>
							<div class="mb-1 text-sm font-medium text-gray-800">{nodeType.name}</div>
							<div class="text-xs text-gray-500">{nodeType.description}</div>
						</div>
						<div
							class="absolute -top-1 -right-1 h-3 w-3 {nodeType.color} rounded-full opacity-80"
						></div>
					</div>
				{/each}
			</div>

			<div class="text-center">
				<button
					type="button"
					onclick={startEditor}
					class="inline-flex cursor-pointer items-center justify-center rounded-lg bg-rose-500 px-8 py-3 text-lg font-semibold text-white shadow-lg transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:bg-rose-600 hover:shadow-xl focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:outline-none active:bg-rose-700"
				>
					Start Building
				</button>
			</div>
		</CardContent>
	</Card>
</section>

<style>
	@import '$lib/styles/amqplus.css';
</style>
