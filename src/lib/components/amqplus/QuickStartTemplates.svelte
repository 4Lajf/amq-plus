<script>
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let templates = $state([]);
	let isLoading = $state(true);
	let selectedTemplate = $state(null);

	// Load templates from database using the same mechanism as Load Quiz
	async function loadTemplatesFromStorage() {
		try {
			isLoading = true;

			// These stable IDs now resolve to three playable starter variants.
			const templateIds = [
				'0c27d99e-2a2c-459c-9786-99502ead9c68',
				'841e6154-5473-4981-81d2-253a256e67f6',
				'e88e6b4c-df74-4223-815a-d89ce36a4867'
			];

			const loadedTemplates = [];
			for (const templateId of templateIds) {
				try {
					const response = await fetch(`/api/templates/${templateId}`);
					if (response.ok) {
						const data = await response.json();
						const configData = data.configuration_data || {};
						loadedTemplates.push({
							id: templateId,
							name: data.name,
							description: data.description,
							creator_username: data.creator_username,
							configurationData: configData,
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

	onMount(loadTemplatesFromStorage);

	// Handle template loading - use the same mechanism as Load Quiz
	async function loadTemplate(template) {
		try {
			selectedTemplate = template.id;

			const configData = template.configurationData || {};

			sessionStorage.setItem(
				'templateToLoad',
				JSON.stringify({
					name: template.metadata?.name || template.name,
					description: template.metadata?.description || template.description || '',
					configuration_data: configData
				})
			);

			await goto('/quizzes/create');
		} catch (error) {
			console.error('Error loading template:', error);
			selectedTemplate = null;
		}
	}
</script>

<section class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
	<!-- Templates Section -->
	<Card class="border-amq-light rounded-xl border bg-white/95 shadow-lg backdrop-blur-sm">
		<CardHeader class="pb-4 text-center">
			<CardTitle class="text-2xl leading-snug font-bold text-gray-800 sm:text-3xl">
				Learn the builder <span class="amq-gradient-text">one layer at a time</span>
			</CardTitle>
			<p class="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-gray-600">
				Every preset is playable as-is. Start at the fundamentals, then add chances, routes, and
				modifiers.
			</p>
		</CardHeader>
		<CardContent class="" aria-live="polite" aria-busy={isLoading}>
			{#if isLoading}
				<div class="flex items-center justify-center py-12" role="status">
					<div class="text-gray-500">Loading templates...</div>
				</div>
			{:else if templates.length === 0}
				<div class="flex flex-col items-center justify-center gap-4 py-12 text-center" role="alert">
					<p class="text-gray-600">
						The starters could not be loaded. Your work is safe; try again or open the builder.
					</p>
					<div class="flex flex-wrap justify-center gap-3">
						<Button onclick={loadTemplatesFromStorage} variant="outline">Try again</Button>
						<Button onclick={() => goto('/quizzes/create')}>Open quiz builder</Button>
					</div>
				</div>
			{:else}
				<div class="grid gap-6 md:grid-cols-3">
					{#each templates as template (template.id)}
						<div
							class="group hover:border-amq-primary/30 relative flex flex-col rounded-lg border border-gray-200 bg-white p-6 transition-all duration-200 hover:shadow-md"
						>
							<div class="mb-4 flex items-start justify-between">
								<div>
									<span
										class="mb-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700"
									>
										{template.metadata?.levelOrder}. {template.metadata?.level}
									</span>
									<h3 class="text-lg leading-snug font-semibold text-gray-800">
										{template.metadata?.name || template.name}
									</h3>
								</div>
							</div>

							<p class="mb-6 text-sm whitespace-pre-line text-gray-600">
								{template.metadata?.description || template.description}
							</p>

							<ul class="mt-auto mb-5 space-y-2 text-sm text-gray-600">
								{#each template.metadata?.features ?? [] as feature (feature)}
									<li class="flex items-center gap-2">
										<span class="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true"></span>
										{feature}
									</li>
								{/each}
							</ul>

							<Button
								onclick={() => loadTemplate(template)}
								aria-label={`Use ${template.metadata?.name || template.name} template`}
								variant="outline"
								class="mt-auto w-full cursor-pointer border-2 border-rose-500 bg-white text-rose-600 transition-all duration-200 hover:border-rose-600 hover:bg-rose-500 hover:text-white"
								disabled={selectedTemplate === template.id}
							>
								{selectedTemplate === template.id ? 'Opening…' : 'Use this template'}
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
