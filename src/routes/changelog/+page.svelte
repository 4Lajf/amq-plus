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
		// 1.2.x
		{
			version: '1.2.1',
			date: '2026-02-13',
			type: 'improvement',
			title: 'Song List & Filtering Enhancements',
			description:
				'ANN Song IDs import for song lists, Negative Song List support, Popularity filter with anime-only clarification, Provider source option, and improved song list create page with pagination, constraint feasibility metrics, and ProfileImport refinements.',
			icon: Star
		},
		{
			version: '1.2.0',
			date: '2026-02-04',
			type: 'feature',
			title: 'The Great Bugfixing | Merge Training Data',
			description:
				'Merge training history from one quiz into another. Clone Data button for safe backups. Delete songlist option, resizable Song Progress table. Anime Title Length filter node. Session History now shows user answers. In progress toggle. Fixed genre filter, training progress records, skip button recording, rating buttons appearing in non-training, imported data marking, Due Today count, Songs Discovered cap, and season search endpoint.',
			icon: Star
		},
		// 1.1.x
		{
			version: '1.1.1',
			date: '2026-01-29',
			type: 'feature',
			title: '1v1 Duel Mode & UI Overhaul',
			description:
				'1v1 Duel Mode for head-to-head song overlap matches. Major UI overhaul of the AMQ+ settings modal with cleaner layout, Basic/Advanced mode toggle, and improved tab navigation.',
			icon: Star
		},
		// 1.0.x
		{
			version: '1.0.28',
			date: '2026-01-10',
			type: 'improvement',
			title: 'Double-Click Rating Fix',
			description:
				'Merged community PR fixing double-click for rating buttons. Song skip behavior during replay phase now correct when using double-click without the setting enabled.',
			icon: Star
		},
		{
			version: '1.0.27',
			date: '2026-01-04',
			type: 'improvement',
			title: 'Training UI & Due Song Fixes',
			description:
				'New button at bottom of Song Progress table to start fresh without backlog. "Spread over 30 days" button for breathing room on due songs. Fixes for due song calculation and invalid due count.',
			icon: Star
		},
		{
			version: '1.0.26',
			date: '2025-12-28',
			type: 'improvement',
			title: 'annSongId Fix & Song Library Update',
			description:
				'Song matching switched from amqSongId to annSongId to correctly separate songs across seasons. Song library synced with AnisongDB (Fall 2025).',
			icon: Star
		},
		{
			version: '1.0.25',
			date: '2025-12-27',
			type: 'improvement',
			title: 'FSRS Naming & Connector 1.0.26',
			description:
				'Training mode terminology aligned with FSRS naming. Connector script (1.0.26) restrains new songs from being added when 0% is set. Delete song records with confirmation. Removed mastered category.',
			icon: Star
		},
		{
			version: '1.0.23',
			date: '2025-12-22',
			type: 'improvement',
			title: 'Legacy Import & Training Improvements',
			description:
				'Fixed legacy training data import. Default Anime Score changed to 1-10. Fixed quiz not found error and dropdown selection in Training tab. Added inactive status for songs outside quiz pool. Double-click option for difficulty modal. Missing filter nodes no longer block quiz.',
			icon: Star
		},
		{
			version: '1.0.22',
			date: '2025-12-21',
			type: 'improvement',
			title: 'Server & Connector Fixes',
			description:
				'Mostly server-side fixes. Update connector script for compatibility. AMQ+ connector added for room ID management and song history tracking.',
			icon: Star
		},
		{
			version: '1.0.21',
			date: '2025-12-21',
			type: 'improvement',
			title: 'JSON Import Fix',
			description:
				'Fixed JSON import for training mode. Training data now stored on website to prevent localStorage loss. Provider import and AMQ Official Export flow for song lists.',
			icon: Star
		},
		{
			version: '1.0.19',
			date: '2025-12-21',
			type: 'improvement',
			title: 'Legacy Profile Detection',
			description:
				'Fixed legacy profiles not being detected when user had not created any quizzes. Training tab now works correctly for users with existing localStorage data but no quiz history.',
			icon: Star
		},
		{
			version: '1.0.0',
			date: '2025-11-03',
			type: 'major',
			title: 'Initial Release',
			description:
				'First public release of AMQ PLUS. Advanced lobby settings editor for Anime Music Quiz with quiz creation, song list management, training mode with FSRS spaced repetition, live node for multiplayer song selection, AMQ connector.',
			icon: Star
		},
		// Pre-1.0 development (from git history)
		{
			version: '0.9.0',
			date: '2025-12-12',
			type: 'feature',
			title: 'Prevent Same Song Spam & Vintage',
			description:
				'Prevent Same Song Spam feature. Vintage configuration support. Enhanced quiz metadata handling. AMQ+ connector room ID management and song history tracking.',
			icon: Star
		},
		{
			version: '0.8.0',
			date: '2025-12-01',
			type: 'feature',
			title: 'Multi-Source & Training Scheduling',
			description:
				'Multi-source Source Selector support. Connector save quiz error handling, localStorage import fix. AMQ+ Training Scheduling & Session History changes. Song list sharing. Deprecated annSongId in favor of ann_song_id in database.',
			icon: Star
		},
		{
			version: '0.7.0',
			date: '2025-11-15',
			type: 'feature',
			title: 'Training Mode',
			description:
				'Training mode with FSRS spaced repetition. Connector updates for training. Play count script collects lobby size. Training mode stats and session history.',
			icon: Star
		},
		{
			version: '0.6.0',
			date: '2025-11-08',
			type: 'feature',
			title: 'Live Node & Dubs Filter',
			description:
				'Filter for dubs and rebroadcasts. Players can add/remove lists from host live node config via command. Guess time in quiz metadata and /amqplus info. Manual input in connector alongside sync.',
			icon: Star
		},
		{
			version: '0.5.0',
			date: '2025-11-05',
			type: 'feature',
			title: 'Song Source & Cache',
			description:
				'Cache fixes, song source chat message. Fixed random songs selection with live node. Songlist refactor. Batch and live node modes for picking songs from people (mutual, etc.).',
			icon: Star
		},
		{
			version: '0.4.0',
			date: '2025-10-31',
			type: 'feature',
			title: 'Dashboard & Quiz Stats',
			description:
				'Dashboard overhaul. Likes, views, live node enhancements. Quiz stats fixes. List percentages and duplicate song handling. AMQ connector integration.',
			icon: Star
		},
		{
			version: '0.3.0',
			date: '2025-10-26',
			type: 'feature',
			title: 'Server Song Picking & Bucket Shuffle',
			description:
				'Final server song picking. Bucket shuffle algorithm. Advanced ranges and vintage fixes. Smarter filters. Quizzes tab and export. Multiple data providers and sample ranges.',
			icon: Star
		},
		{
			version: '0.2.0',
			date: '2025-10-15',
			type: 'feature',
			title: 'Quizzes & Sample Editor',
			description:
				'Quizzes tab and export. New source nodes. List node. Sample editor. List cache. Song list with AnisongDB integration. Documentation and JSDoc.',
			icon: Star
		},
		{
			version: '0.1.0',
			date: '2025-09-17',
			type: 'feature',
			title: 'Core Editor & Filter Nodes',
			description:
				'Genre tags and filters. Settings and core nodes. List node foundation. Read-only mode and disabled buttons. Random execution % and default settings. Export default settings.',
			icon: Star
		},
		{
			version: '0.0.1',
			date: '2025-07-08',
			type: 'major',
			title: 'Project Inception',
			description:
				'First commit. Default settings applied. Foundation for custom nodes and lobby configuration editor.',
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
		// Format as ISO 8601 (YYYY-MM-DD)
		return new Date(dateString).toISOString().split('T')[0];
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

<div class="min-h-screen bg-linear-to-br from-rose-50 to-pink-50 py-12">
	<div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-12 text-center">
			<h1 class="mb-4 text-4xl font-bold text-gray-900 sm:text-5xl">
				<span class="bg-linear-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
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
