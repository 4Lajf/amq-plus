<script>
	import { browser } from '$app/environment';
	import {
		MessageSquare,
		ExternalLink,
		Users,
		Hash,
		ArrowRight,
		Heart,
		Bug,
		Lightbulb
	} from 'lucide-svelte';

	$: title = 'Feedback - AMQ PLUS';
	$: description =
		'Share your feedback, suggestions, and bug reports for AMQ PLUS. Connect with our community on Discord to help improve the tool.';
	$: imageUrl = browser ? `${window.location.origin}/api/og` : 'https://amqplus.moe/api/og';
	$: canonicalUrl = browser ? window.location.href : 'https://amqplus.moe/feedback';

	const discordUrl = 'https://discord.gg/uksmw9HAma';

	const feedbackTypes = [
		{
			icon: Bug,
			title: 'Bug Reports',
			description: "Found something that's not working as expected? Let us know!",
			color: 'text-red-600 bg-red-100'
		},
		{
			icon: Lightbulb,
			title: 'Feature Requests',
			description: "Have an idea for a new feature or improvement? We'd love to hear it!",
			color: 'text-yellow-600 bg-yellow-100'
		},
		{
			icon: Heart,
			title: 'General Feedback',
			description: 'Share your thoughts, experiences, or suggestions about AMQ PLUS.',
			color: 'text-pink-600 bg-pink-100'
		}
	];

	const steps = [
		{
			number: 1,
			title: 'Join the Discord Server',
			description: 'Click the button below to join the AnimeMusicQuiz Discord community.',
			action: 'Join Discord'
		},
		{
			number: 2,
			title: 'Navigate to #scripts-for-game',
			description: "Once you're in the server, find and click on the #scripts-for-game channel.",
			action: 'Find Channel'
		},
		{
			number: 3,
			title: 'Share Your Feedback',
			description:
				'Post your feedback, bug reports, or feature requests in the channel. Be sure to mention AMQ PLUS!',
			action: 'Post Message'
		}
	];
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
		<!-- Discord Instructions -->
		<div
			class="mb-8 overflow-hidden rounded-xl border border-gray-200/50 bg-white/80 shadow-lg backdrop-blur-sm"
		>
			<div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4">
				<div class="flex items-center space-x-3">
					<div class="rounded-lg bg-white/20 p-2">
						<Users class="h-6 w-6 text-white" />
					</div>
					<div>
						<h2 class="text-xl font-semibold text-white">Join The Discord Community</h2>
						<p class="text-indigo-100">Connect with other AMQ enjoyers to share your thoughts</p>
					</div>
				</div>
			</div>

			<div class="p-6 sm:p-8">
				<div class="space-y-8">
					{#each steps as step}
						<div class="flex items-start space-x-4">
							<div
								class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-sm font-semibold text-white"
							>
								{step.number}
							</div>
							<div class="flex-1">
								<h3 class="mb-2 font-semibold text-gray-900">{step.title}</h3>
								<p class="mb-3 text-gray-600">{step.description}</p>
								{#if step.number === 1}
									<a
										href={discordUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center space-x-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-colors duration-200 hover:bg-indigo-700"
									>
										<span>Join Discord Server</span>
										<ExternalLink size={16} />
									</a>
								{:else if step.number === 2}
									<div
										class="inline-flex items-center space-x-2 rounded-lg bg-gray-100 px-3 py-2 text-gray-700"
									>
										<Hash size={16} />
										<span class="font-mono text-sm">scripts-for-game</span>
									</div>
								{/if}
							</div>
						</div>
						{#if step.number < steps.length}
							<div class="flex justify-center">
								<ArrowRight class="h-5 w-5 text-gray-400" />
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>

		<!-- Additional Information -->
		<div
			class="rounded-xl border border-rose-200/50 bg-gradient-to-r from-rose-100 to-pink-100 p-6"
		>
			<div class="flex items-start space-x-4">
				<div class="flex-shrink-0 rounded-lg bg-rose-200 p-2">
					<MessageSquare class="h-5 w-5 text-rose-700" />
				</div>
				<div>
					<h3 class="mb-2 font-semibold text-rose-900">Tips for Effective Feedback</h3>
					<ul class="space-y-2 text-sm text-rose-800">
						<li class="flex items-start space-x-2">
							<div class="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-600"></div>
							<span>Be specific about the issue or feature you're discussing</span>
						</li>
						<li class="flex items-start space-x-2">
							<div class="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-600"></div>
							<span>Include steps to reproduce bugs when possible</span>
						</li>
						<li class="flex items-start space-x-2">
							<div class="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-600"></div>
							<span>Tag your message with "AMQ PLUS" to help us find it quickly</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</div>
