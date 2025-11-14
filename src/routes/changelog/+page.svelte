<script>
	import { browser } from '$app/environment';
	import { Calendar, Star } from 'lucide-svelte';

	const title = $derived('Changelog - AMQ PLUS');
	const description = $derived(
		'Stay updated with the latest features, improvements, and fixes in AMQ PLUS - your advanced lobby settings editor for Anime Music Quiz.'
	);
	const imageUrl = $derived(
		browser ? `${window.location.origin}/api/og` : 'https://amqplus.moe/api/og'
	);
	const canonicalUrl = $derived(browser ? window.location.href : 'https://amqplus.moe/changelog');

	const changelogEntries = [
		{
			version: '1.0.0',
			date: new Date().toISOString().split('T')[0],
			type: 'major',
			title: 'Initial Release',
			description:
				'We are excited to announce the initial release of AMQ PLUS! This is the first version of our advanced lobby settings editor for Anime Music Quiz.',
			highlights: [
				'Initial release of AMQ PLUS',
				'Advanced lobby settings editor',
				'Support for Anime Music Quiz configurations'
			],
			icon: Star
		}
	];

	function getTypeColor(type) {
		switch (type) {
			case 'major':
				return 'bg-purple-100 text-purple-800 border-purple-200';
			case 'feature':
				return 'bg-green-100 text-green-800 border-green-200';
			case 'improvement':
				return 'bg-blue-100 text-blue-800 border-blue-200';
			default:
				return 'bg-gray-100 text-gray-800 border-gray-200';
		}
	}

	function formatDate(dateString) {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
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

	<link rel="canonical" href={canonicalUrl} />
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 py-12">
	<div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-12 text-center">
			<h1 class="mb-4 text-4xl font-bold text-gray-900 sm:text-5xl">
				<span class="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
					Changelog
				</span>
			</h1>
			<p class="mx-auto max-w-2xl text-xl text-gray-600">
				Stay updated with the latest features, improvements, and fixes in AMQ PLUS
			</p>
		</div>

		<!-- Changelog Entries -->
		<div class="space-y-8">
			{#each changelogEntries as entry}
				{@const Icon = entry.icon}
				<div
					class="overflow-hidden rounded-xl border border-gray-200/50 bg-white/80 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl"
				>
					<div class="p-6 sm:p-8">
						<!-- Header -->
						<div class="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
							<div class="mb-2 flex items-center space-x-3 sm:mb-0">
								<div class="rounded-lg bg-rose-100 p-2">
									<Icon class="h-5 w-5 text-rose-600" />
								</div>
								<div>
									<h2 class="text-xl font-semibold text-gray-900">{entry.title}</h2>
									<div class="flex items-center space-x-2 text-sm text-gray-500">
										<span class="font-medium">v{entry.version}</span>
										<span>•</span>
										<div class="flex items-center space-x-1">
											<Calendar size={14} />
											<span>{formatDate(entry.date)}</span>
										</div>
									</div>
								</div>
							</div>
							<span
								class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium {getTypeColor(
									entry.type
								)}"
							>
								{entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}
							</span>
						</div>

						<!-- Description -->
						<p class="mb-4 leading-relaxed text-gray-700">
							{entry.description}
						</p>

						<!-- Highlights -->
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
