<script>
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import AMQPlusTitle from '$lib/components/amqplus/AMQPlusTitle.svelte';
	import AMQPlusFeatures from '$lib/components/amqplus/AMQPlusFeatures.svelte';
	import AMQPlusCTA from '$lib/components/amqplus/AMQPlusCTA.svelte';
	import NodeBasedEditor from '$lib/components/amqplus/NodeBasedEditor.svelte';
	import QuickStartTemplates from '$lib/components/amqplus/QuickStartTemplates.svelte';
	import InteractiveNodeGraph from '$lib/components/amqplus/InteractiveNodeGraph.svelte';
	import '$lib/styles/amqplus.css';

	const title = $derived('AMQ PLUS - Create Custom AMQ Lobbies with a Node-Based Editor');
	const description = $derived(
		'Visually design and customize your Anime Music Quiz lobby settings. Our node-based editor gives you the power to create unique and advanced configurations that go beyond the standard options.'
	);
	const imageUrl = $derived(
		browser ? `${window.location.origin}/api/og` : 'https://amqplus.moe/api/og'
	);
	const canonicalUrl = $derived(browser ? window.location.href : 'https://amqplus.moe');

	function tryFullEditor() {
		goto('/quizzes/create');
	}
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={imageUrl} />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={canonicalUrl} />
	<meta property="twitter:title" content={title} />
	<meta property="twitter:description" content={description} />
	<meta property="twitter:image" content={imageUrl} />

	<!-- Additional SEO metadata -->
	<meta
		name="keywords"
		content="anime music quiz, AMQ, custom lobby, settings editor, node editor, anime quiz, music quiz, AMQ PLUS, lobby settings, anime game, visual editor"
	/>
	<meta name="theme-color" content="#DF6975" />
	<meta name="author" content="AMQ PLUS" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={canonicalUrl} />
</svelte:head>

<div class="relative min-h-screen">
	<div class="relative z-10 flex min-h-screen flex-col px-3 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-12">
		<header class="mb-12 flex flex-1 flex-col items-center justify-center sm:mb-16 lg:mb-20">
			<div class="w-full">
				<AMQPlusTitle />
			</div>
		</header>

		<section class="mb-16 sm:mb-20 lg:mb-24">
			<NodeBasedEditor />
		</section>

		<section id="quick-start-templates" class="mb-16 sm:mb-20 lg:mb-24">
			<QuickStartTemplates />
		</section>

		<section class="mb-16 sm:mb-20 lg:mb-24">
			<div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				<div class="mb-8 text-center">
					<h2 class="mb-4 !text-4xl font-bold text-gray-800 sm:text-3xl">
						Visual <span class="amq-gradient-text">Node Editor</span>
					</h2>
					<p class="mx-auto max-w-2xl !text-xl text-gray-600">
						Experience the power of our interactive node-based editor. Drag nodes, create
						connections, and see your AMQ lobby configuration come to life.
					</p>
				</div>
				<InteractiveNodeGraph />
				<div class="mt-8 text-center">
					<button
						type="button"
						onclick={tryFullEditor}
						class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-rose-500 px-8 py-3 text-lg font-semibold text-white shadow-lg transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:bg-rose-600 hover:shadow-xl focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:outline-none active:bg-rose-700"
					>
						Try the Full Editor
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 7l5 5m0 0l-5 5m5-5H6"
							/>
						</svg>
					</button>
				</div>
			</div>
		</section>

		<main class="mb-20 sm:mb-24 lg:mb-32">
			<AMQPlusFeatures />
		</main>

		<section>
			<AMQPlusCTA />
		</section>
	</div>
</div>
