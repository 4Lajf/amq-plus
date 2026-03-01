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
			title: 'Flexible Node System',
			description:
				'Combine multiple node types to build complex configurations. Add filters, routers, modifiers, and more with full control over execution flow.',
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
			title: 'Custom Playlist Creation',
			description:
				'Create custom playlists from your favorite songs. Build personalized quiz pools tailored to your musical preferences and anime interests.',
			icon: '📚',
			badge: 'Smart',
			color: 'bg-amq-success/10 text-amq-success border-amq-success/20'
		},
		{
			title: 'Configuration Simulation',
			description:
				'Preview exactly how your quiz settings will resolve before exporting. See the final calculated configuration with all values resolved.',
			icon: '👁️',
			badge: 'Preview',
			color: 'bg-amq-warning/10 text-amq-warning border-amq-warning/20'
		},
		{
			title: 'AMQ Quiz Import',
			description:
				'Import your existing quizzes from AMQ and enhance them with advanced features. Build on community templates and customize them to your preferences.',
			icon: '📤',
			badge: 'Social',
			color: 'bg-amq-neutral/10 text-amq-neutral border-amq-neutral/20'
		}
	];
</script>

<section class="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
	<div class="relative z-10 mb-16 text-center">
		<h2 class="xs:text-4xl mb-6 text-3xl font-bold text-gray-800 sm:text-4xl">
			Powerful Features for <span class="amq-gradient-text">AMQ enjoyers</span>
		</h2>
		<p class="mx-auto max-w-4xl text-lg leading-relaxed text-gray-600 sm:text-xl">
			Take your Anime Music Quiz experience to the next level with advanced customization tools
		</p>
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
						class="group-hover:text-amq-primary text-xl text-gray-800 transition-colors duration-300 sm:text-2xl"
					>
						{feature.title}
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
