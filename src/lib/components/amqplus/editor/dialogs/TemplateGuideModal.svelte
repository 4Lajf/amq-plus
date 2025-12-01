<script>
	import { Button } from '$lib/components/ui/button/index.js';
	import { X } from 'lucide-svelte';

	let { isOpen = $bindable(false), templateMetadata = null } = $props();

	function closeModal() {
		isOpen = false;
	}

	// Format description with proper line breaks
	function formatDescription(text) {
		if (!text) return '';
		return text
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	let descriptionLines = $derived(
		templateMetadata?.detailedExplanation
			? formatDescription(templateMetadata.detailedExplanation)
			: templateMetadata?.description
				? formatDescription(templateMetadata.description)
				: []
	);
</script>

{#if isOpen && templateMetadata}
	<div
		class="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		onkeydown={(e) => (e.key === 'Escape' ? closeModal() : null)}
		onclick={(e) => {
			if (e.currentTarget === e.target) closeModal();
		}}
	>
		<div
			class="max-h-[85vh] w-[900px] max-w-[95vw] overflow-auto rounded-lg border-2 border-amber-400 bg-white shadow-2xl"
			role="document"
		>
			<!-- Header -->
			<div
				class="sticky top-0 z-10 border-b-2 border-amber-400 bg-linear-to-r from-amber-50 to-yellow-50 px-6 py-4"
			>
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<div class="mb-1 flex items-center gap-3">
							<span class="text-2xl">📚</span>
							<h2 class="text-2xl font-bold text-amber-900">{templateMetadata.name}</h2>
						</div>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onclick={closeModal}
						class="text-amber-700 hover:bg-amber-100 hover:text-amber-900"
						disabled={false}
					>
						<X class="h-5 w-5" />
					</Button>
				</div>
			</div>

			<!-- Content -->
			<div class="px-6 py-6">
				<!-- Features -->
				{#if templateMetadata.features && templateMetadata.features.length > 0}
					<div class="mb-6">
						<h3 class="mb-3 text-sm font-semibold tracking-wide text-gray-700 uppercase">
							Key Features
						</h3>
						<div class="flex flex-wrap gap-2">
							{#each templateMetadata.features as feature}
								<span
									class="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800"
								>
									{feature}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Detailed Explanation -->
				<div class="prose prose-sm max-w-none">
					{#each descriptionLines as line}
						{#if line.startsWith('**') && line.endsWith('**')}
							<!-- Bold heading -->
							<h3 class="mt-6 mb-3 text-lg font-bold text-gray-900">
								{line.replace(/\*\*/g, '')}
							</h3>
						{:else if line.startsWith('###')}
							<!-- Subheading -->
							<h4 class="mt-4 mb-2 text-base font-semibold text-gray-800">
								{line.replace(/^###\s+/, '')}
							</h4>
						{:else if line.startsWith('##')}
							<!-- Heading -->
							<h3 class="mt-5 mb-3 text-lg font-bold text-gray-900">
								{line.replace(/^##\s+/, '')}
							</h3>
						{:else if line.startsWith('•') || line.startsWith('-')}
							<!-- Bullet point -->
							<div class="mb-2 ml-4 flex gap-2">
								<span class="text-amber-600">•</span>
								<span class="flex-1 text-gray-700">
									{@html line
										.replace(/^[•\-]\s+/, '')
										.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
								</span>
							</div>
						{:else if line.match(/^\d+\./)}
							<!-- Numbered list -->
							<div class="mb-2 ml-4 text-gray-700">
								{@html line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
							</div>
						{:else}
							<!-- Regular paragraph -->
							<p class="mb-3 leading-relaxed text-gray-700">
								{@html line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
							</p>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Footer -->
			<div class="border-t border-gray-200 bg-gray-50 px-6 py-4">
				<div class="flex items-center justify-between">
					<p class="text-sm text-gray-600">
						💡 Tip: Customize this template to match your quiz preferences
					</p>
					<Button onclick={closeModal} class="bg-amber-500 hover:bg-amber-600" disabled={false}>
						Got it!
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Custom prose styling for better readability */
	.prose h3 {
		color: #78350f;
	}

	.prose h4 {
		color: #92400e;
	}
</style>
