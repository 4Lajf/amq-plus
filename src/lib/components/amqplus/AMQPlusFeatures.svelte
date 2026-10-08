<script>
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';

	const features = [
		{
			title: 'Spaced Repetition Training',
			description:
				'Practice with spaced repetition: due reviews, daily goals, and catch-up sessions in AMQ via the AMQ+ Connector. Track progress on the Training page.',
			icon: '🧠',
			badge: 'Learn',
			color: 'bg-amq-accent/10 text-amq-accent border-amq-accent/20',
			href: '/training'
		},
		{
			title: 'Flexible Quiz Builder',
			description:
				'Build one simple route or combine filters, weighted routes, and modifiers for more advanced quiz setups.',
			icon: '🔗',
			badge: 'Visual',
			color: 'bg-amq-accent/10 text-amq-accent border-amq-accent/20'
		},
		{
			title: 'Advanced Content Filters',
			description:
				'Filter songs by type, genre, tags, vintage era, difficulty score, player score, anime score, and more for precise control over your quiz pool.',
			icon: '🎵',
			badge: 'Powerful',
			color: 'bg-amq-primary/10 text-amq-primary border-amq-primary/20'
		},
		{
			title: 'Probabilistic Routing',
			description:
				'Create multiple quiz configurations and route between them using weighted probabilities. Run different setups with controlled randomness.',
			icon: '🎲',
			badge: 'Advanced',
			color: 'bg-amq-secondary/10 text-amq-secondary border-amq-secondary/20'
		},
		{
			title: 'Song List Builder',
			description:
				'Create, import, and share reusable song lists, then use them as focused sources for your quizzes.',
			icon: '📚',
			badge: 'Smart',
			color: 'bg-amq-success/10 text-amq-success border-amq-success/20'
		},
		{
			title: 'Generate Before You Play',
			description:
				'Generate the song set after saving so you can catch an overly narrow filter before taking the quiz into AMQ.',
			icon: '👁️',
			badge: 'Check',
			color: 'bg-amq-warning/10 text-amq-warning border-amq-warning/20'
		},
		{
			title: 'Reusable Starters and Sources',
			description:
				'Start with a playable preset, remix a public quiz, or use one quiz as a live source for another.',
			icon: '📤',
			badge: 'Reuse',
			color: 'bg-amq-neutral/10 text-amq-neutral border-amq-neutral/20'
		},
		{
			title: 'One-Click Lobby Setup',
			description:
				'The AMQ+ Connector userscript applies a saved quiz straight to your lobby, so the settings you built here are the settings you play.',
			icon: '🔌',
			badge: 'Connect',
			color: 'bg-amq-primary/10 text-amq-primary border-amq-primary/20'
		},
		{
			title: 'Live Player Lists',
			description:
				'Pull song pools from the lists of everyone in the lobby as they join and leave.',
			icon: '🎮',
			badge: 'Live',
			color: 'bg-amq-secondary/10 text-amq-secondary border-amq-secondary/20'
		}
	];
</script>

<section class="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
	<div class="relative z-10 mb-12 text-center">
		<h2 class="text-3xl leading-tight font-bold text-gray-800 sm:text-4xl">
			Built for <span class="amq-gradient-text">AMQ enjoyers</span>
		</h2>
	</div>

	<div class="relative z-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
		{#each features as feature}
			<Card
				class="border-amq-light hover:border-amq-secondary group transform rounded-xl border bg-white/95 p-6 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-2xl sm:p-4"
			>
				<CardHeader class="pb-0">
					<div class="mb-2 flex items-center justify-between">
						<div class="text-3xl">{feature.icon}</div>
					</div>
					<CardTitle
						class="group-hover:text-amq-primary text-xl leading-snug text-gray-800 transition-colors duration-300 sm:text-2xl"
					>
						{#if feature.href}
							<a href={feature.href} class="hover:underline">{feature.title}</a>
						{:else}
							{feature.title}
						{/if}
					</CardTitle>
				</CardHeader>
				<CardContent class="pt-0">
					<CardDescription class="text-base leading-relaxed text-gray-600">
						{feature.description}
					</CardDescription>
				</CardContent>
			</Card>
		{/each}
	</div>
</section>

<style>
	@import '$lib/styles/amqplus.css';
</style>
