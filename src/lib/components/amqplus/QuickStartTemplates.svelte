<script>
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { goto } from '$app/navigation';

	let templates = $state([]);
	let isLoading = $state(true);
	let selectedTemplate = $state(null);

	// Load templates from database using the same mechanism as Load Quiz
	async function loadTemplatesFromStorage() {
		try {
			isLoading = true;

			// Template IDs that should be accessible as templates
			const templateIds = [
				'0c27d99e-2a2c-459c-9786-99502ead9c68', // template-1
				'841e6154-5473-4981-81d2-253a256e67f6', // template-2
				'e88e6b4c-df74-4223-815a-d89ce36a4867' // template-3
			];

			const loadedTemplates = [];
			for (const templateId of templateIds) {
				try {
					const response = await fetch(`/api/templates/${templateId}`);
					if (response.ok) {
						const data = await response.json();
						loadedTemplates.push({
							id: templateId,
							name: data.name,
							description: data.description,
							creator_username: data.creator_username,
							nodes: data.configuration_data?.nodes || [],
							edges: data.configuration_data?.edges || [],
							metadata: data.metadata
						});
					}
				} catch (error) {
					console.error(`Error loading template ${templateId}:`, error);
				}
			}

			templates = loadedTemplates;
		} catch (error) {
			console.error('Error loading templates:', error);
			// Fallback to empty state if templates cannot be loaded
			templates = [];
		} finally {
			isLoading = false;
		}
	}

	// Load templates on component mount
	$effect(() => {
		loadTemplatesFromStorage();
	});

	// Handle template loading - use the same mechanism as Load Quiz
	async function loadTemplate(template) {
		try {
			selectedTemplate = template;

			// Store template data in sessionStorage for retrieval in editor
			// This matches the original template loading mechanism
			sessionStorage.setItem(
				'templateToLoad',
				JSON.stringify({
					nodes: template.nodes,
					edges: template.edges,
					name: template.name,
					metadata: template.metadata
				})
			);

			// Navigate to editor (same as original template loading)
			await goto('/quizzes/create');
		} catch (error) {
			console.error('Error loading template:', error);
		}
	}
</script>

<section class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
	<!-- Templates Section -->
	<Card class="border-amq-light rounded-xl border bg-white/95 shadow-lg backdrop-blur-sm">
		<CardHeader class="pb-4 text-center">
			<CardTitle class="!text-4xl font-bold text-gray-800 sm:text-3xl">
				Quick Start <span class="amq-gradient-text">Templates</span>
			</CardTitle>
			<p class="mt-2 !text-xl text-gray-600">
				Begin with pre-configured templates showcasing various complexity levels
			</p>
		</CardHeader>
		<CardContent class="">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<div class="text-gray-500">Loading templates...</div>
				</div>
			{:else if templates.length === 0}
				<div class="flex items-center justify-center py-12">
					<div class="text-gray-500">
						Templates not available. Create a new configuration from scratch.
					</div>
				</div>
			{:else}
				<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{#each templates as template}
						<div
							class="group hover:border-amq-primary/30 relative flex flex-col rounded-lg border border-gray-200 bg-white p-6 transition-all duration-200 hover:shadow-md"
						>
							<div class="mb-4 flex items-start justify-between">
								<h3 class="text-lg font-semibold text-gray-800">
									{template.metadata?.name || template.name}
								</h3>
							</div>

							<p class="mb-6 text-sm whitespace-pre-line text-gray-600">
								{template.metadata?.description || template.description}
							</p>

							<div class="mt-auto mb-4 flex items-center justify-between text-sm text-gray-500">
								<span class="font-medium">
									{template.metadata?.nodeCount || template.nodes?.length || 0} nodes
								</span>
							</div>

							<Button
								onclick={() => loadTemplate(template)}
								variant="outline"
								class="mt-auto w-full cursor-pointer border-2 border-rose-500 bg-white text-rose-600 transition-all duration-200 hover:border-rose-600 hover:bg-rose-500 hover:text-white"
								disabled={false}
							>
								Use Template
							</Button>
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>
</section>

<style>
	@import '$lib/styles/amqplus.css';
</style>
