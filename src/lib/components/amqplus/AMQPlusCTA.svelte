<script>
	import { Card, CardContent } from '$lib/components/ui/card';
	import { goto } from '$app/navigation';

	function launchEditor() {
		goto('/quizzes/create');
	}

	function scrollToTemplates() {
		const templatesSection = document.getElementById('quick-start-templates');
		if (templatesSection) {
			templatesSection.scrollIntoView({
				behavior: 'smooth',
				block: 'start'
			});
		}
	}
</script>

<section class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
	<Card
		class="border-amq-light relative rounded-xl border bg-white/90 p-6 text-center shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl sm:p-8 md:p-12 lg:p-16"
	>
		<CardContent class="space-y-8">
			<div class="space-y-6">
				<h2 class="xs:text-4xl text-3xl leading-tight font-bold text-gray-800">
					Build Your <span class="amq-gradient-text">Perfect</span> AMQ Setup
				</h2>

				<p class="mx-auto max-w-3xl text-lg leading-relaxed text-gray-600 sm:text-xl">
					Use our visual editor to create AMQ lobby settings exactly how you want them.
				</p>
			</div>

			<div class="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
				<button
					type="button"
					onclick={launchEditor}
					class="inline-flex min-w-[200px] cursor-pointer items-center justify-center rounded-lg bg-rose-500 px-8 py-3 text-lg font-semibold text-white shadow-lg transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:bg-rose-600 hover:shadow-xl focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:outline-none active:bg-rose-700 sm:min-w-[220px] sm:px-10 sm:py-4 sm:text-xl"
				>
					Launch Editor
				</button>

				<button
					type="button"
					onclick={scrollToTemplates}
					class="inline-flex min-w-[200px] cursor-pointer items-center justify-center rounded-lg border-2 border-rose-500 bg-white px-8 py-3 text-lg font-semibold text-rose-600 shadow-sm transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:border-rose-600 hover:bg-gray-100 hover:shadow-md focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:outline-none active:bg-rose-600 sm:min-w-[220px] sm:px-10 sm:py-4 sm:text-xl"
				>
					View Examples
				</button>
			</div>
		</CardContent>
	</Card>
</section>

<style>
	@import '$lib/styles/amqplus.css';
</style>
