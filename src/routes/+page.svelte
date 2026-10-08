<script>
	import { browser } from '$app/environment';
	import AMQPlusTitle from '$lib/components/amqplus/AMQPlusTitle.svelte';
	import AMQPlusFeatures from '$lib/components/amqplus/AMQPlusFeatures.svelte';
	import AMQPlusCTA from '$lib/components/amqplus/AMQPlusCTA.svelte';
	import QuickStartTemplates from '$lib/components/amqplus/QuickStartTemplates.svelte';
	import '$lib/styles/amqplus.css';

	const title = $derived('AMQ+ — Build Quizzes, Curate Song Lists, and Train in Anime Music Quiz');
	const description = $derived(
		'Build reusable Anime Music Quiz setups, curate song lists, and remember difficult songs with spaced-repetition training in AMQ.'
	);
	const imageUrl = $derived(
		browser ? `${window.location.origin}/api/og` : 'https://amqplus.moe/api/og'
	);
	const canonicalUrl = $derived(browser ? window.location.href : 'https://amqplus.moe');
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
		content="anime music quiz, AMQ, custom quiz, song lists, spaced repetition, anime songs, AMQ PLUS, lobby settings, training"
	/>
	<meta name="theme-color" content="#DF6975" />
	<meta name="author" content="AMQ PLUS" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={canonicalUrl} />
</svelte:head>

<div class="relative min-h-screen">
	<div class="relative z-10 flex min-h-screen flex-col px-3 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-12">
		<header class="mb-12 sm:mb-16 lg:mb-20">
			<div class="w-full">
				<AMQPlusTitle />
			</div>
		</header>

		<section id="quick-start-templates" class="mb-16 sm:mb-20 lg:mb-24">
			<QuickStartTemplates />
		</section>

		<main class="mb-20 sm:mb-24 lg:mb-32">
			<AMQPlusFeatures />
		</main>

		<section>
			<AMQPlusCTA />
		</section>
	</div>
</div>
