<script>
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import RangeSlider from 'svelte-range-slider-pips';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import {
		GENRES_DEFAULT_SETTINGS,
		TAGS_DEFAULT_SETTINGS
	} from '$lib/components/amqplus/editor/utils/defaultNodeSettings.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { initializeGenresTagsMode } from '$lib/components/amqplus/editor/utils/modeInitializationUtils.js';
	import { quickFixGenresTags } from '$lib/components/amqplus/editor/utils/quickFixUtils.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		getTotalSongs = () => 20,
		readOnly = false,
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

	// Valid lists provided by user request
	const GENRES = [
		'Action',
		'Adventure',
		'Comedy',
		'Drama',
		'Ecchi',
		'Fantasy',
		'Horror',
		'Mahou Shoujo',
		'Mecha',
		'Music',
		'Mystery',
		'Psychological',
		'Romance',
		'Sci-Fi',
		'Slice of Life',
		'Sports',
		'Supernatural',
		'Thriller'
	];

	const TAGS = [
		'4-koma',
		'Achromatic',
		'Achronological Order',
		'Acrobatics',
		'Acting',
		'Adoption',
		'Advertisement',
		'Afterlife',
		'Age Gap',
		'Age Regression',
		'Agender',
		'Agriculture',
		'Airsoft',
		'Alchemy',
		'Aliens',
		'Alternate Universe',
		'American Football',
		'Amnesia',
		'Anachronism',
		'Ancient China',
		'Angels',
		'Animals',
		'Anthology',
		'Anthropomorphism',
		'Anti-Hero',
		'Archery',
		'Aromantic',
		'Arranged Marriage',
		'Artificial Intelligence',
		'Asexual',
		'Assassins',
		'Astronomy',
		'Athletics',
		'Augmented Reality',
		'Autobiographical',
		'Aviation',
		'Badminton',
		'Ballet',
		'Band',
		'Bar',
		'Baseball',
		'Basketball',
		'Battle Royale',
		'Biographical',
		'Bisexual',
		'Blackmail',
		'Board Game',
		'Boarding School',
		'Body Horror',
		'Body Image',
		'Body Swapping',
		'Bowling',
		'Boxing',
		"Boys' Love",
		'Bullying',
		'Butler',
		'Calligraphy',
		'Camping',
		'Cannibalism',
		'Card Battle',
		'Cars',
		'Centaur',
		'CGI',
		'Cheerleading',
		'Chibi',
		'Chimera',
		'Chuunibyou',
		'Circus',
		'Class Struggle',
		'Classic Literature',
		'Classical Music',
		'Clone',
		'Coastal',
		'Cohabitation',
		'College',
		'Coming of Age',
		'Conspiracy',
		'Cosmic Horror',
		'Cosplay',
		'Cowboys',
		'Creature Taming',
		'Crime',
		'Criminal Organization',
		'Crossdressing',
		'Crossover',
		'Cult',
		'Cultivation',
		'Curses',
		'Cute Boys Doing Cute Things',
		'Cute Girls Doing Cute Things',
		'Cyberpunk',
		'Cyborg',
		'Cycling',
		'Dancing',
		'Death Game',
		'Delinquents',
		'Demons',
		'Denpa',
		'Desert',
		'Detective',
		'Dinosaurs',
		'Disability',
		'Dissociative Identities',
		'Dragons',
		'Drawing',
		'Drugs',
		'Dullahan',
		'Dungeon',
		'Dystopian',
		'E-Sports',
		'Eco-Horror',
		'Economics',
		'Educational',
		'Elderly Protagonist',
		'Elf',
		'Ensemble Cast',
		'Environmental',
		'Episodic',
		'Ero Guro',
		'Espionage',
		'Estranged Family',
		'Exorcism',
		'Fairy',
		'Fairy Tale',
		'Fake Relationship',
		'Family Life',
		'Fashion',
		'Female Harem',
		'Female Protagonist',
		'Femboy',
		'Fencing',
		'Filmmaking',
		'Firefighters',
		'Fishing',
		'Fitness',
		'Flash',
		'Food',
		'Football',
		'Foreign',
		'Found Family',
		'Fugitive',
		'Full CGI',
		'Full Color',
		'Gambling',
		'Gangs',
		'Gender Bending',
		'Ghost',
		'Go',
		'Goblin',
		'Gods',
		'Golf',
		'Gore',
		'Guns',
		'Gyaru',
		'Handball',
		'Henshin',
		'Heterosexual',
		'Hikikomori',
		'Hip-hop Music',
		'Historical',
		'Homeless',
		'Horticulture',
		'Ice Skating',
		'Idol',
		'Indigenous Cultures',
		'Inn',
		'Isekai',
		'Iyashikei',
		'Jazz Music',
		'Josei',
		'Judo',
		'Kabuki',
		'Kaiju',
		'Karuta',
		'Kemonomimi',
		'Kids',
		'Kingdom Management',
		'Konbini',
		'Kuudere',
		'Lacrosse',
		'Language Barrier',
		'LGBTQ+ Themes',
		'Long Strip',
		'Lost Civilization',
		'Love Triangle',
		'Mafia',
		'Magic',
		'Mahjong',
		'Maids',
		'Makeup',
		'Male Harem',
		'Male Protagonist',
		'Manzai',
		'Marriage',
		'Martial Arts',
		'Matchmaking',
		'Matriarchy',
		'Medicine',
		'Medieval',
		'Memory Manipulation',
		'Mermaid',
		'Meta',
		'Metal Music',
		'Military',
		'Mixed Gender Harem',
		'Mixed Media',
		'Modeling',
		'Monster Boy',
		'Monster Girl',
		'Mopeds',
		'Motorcycles',
		'Mountaineering',
		'Musical Theater',
		'Mythology',
		'Natural Disaster',
		'Necromancy',
		'Nekomimi',
		'Ninja',
		'No Dialogue',
		'Noir',
		'Non-fiction',
		'Nudity',
		'Nun',
		'Office',
		'Office Lady',
		'Oiran',
		'Ojou-sama',
		'Orphan',
		'Otaku Culture',
		'Outdoor Activities',
		'Pandemic',
		'Parenthood',
		'Parkour',
		'Parody',
		'Philosophy',
		'Photography',
		'Pirates',
		'Poker',
		'Police',
		'Politics',
		'Polyamorous',
		'Post-Apocalyptic',
		'POV',
		'Pregnancy',
		'Primarily Adult Cast',
		'Primarily Animal Cast',
		'Primarily Child Cast',
		'Primarily Female Cast',
		'Primarily Male Cast',
		'Primarily Teen Cast',
		'Prison',
		'Proxy Battle',
		'Psychosexual',
		'Puppetry',
		'Rakugo',
		'Real Robot',
		'Rehabilitation',
		'Reincarnation',
		'Religion',
		'Rescue',
		'Restaurant',
		'Revenge',
		'Robots',
		'Rock Music',
		'Rotoscoping',
		'Royal Affairs',
		'Rugby',
		'Rural',
		'Samurai',
		'Satire',
		'School',
		'School Club',
		'Scuba Diving',
		'Seinen',
		'Shapeshifting',
		'Ships',
		'Shogi',
		'Shoujo',
		'Shounen',
		'Shrine Maiden',
		'Skateboarding',
		'Skeleton',
		'Slapstick',
		'Slavery',
		'Snowscape',
		'Software Development',
		'Space',
		'Space Opera',
		'Spearplay',
		'Steampunk',
		'Stop Motion',
		'Succubus',
		'Suicide',
		'Sumo',
		'Super Power',
		'Super Robot',
		'Superhero',
		'Surfing',
		'Surreal Comedy',
		'Survival',
		'Swimming',
		'Swordplay',
		'Table Tennis',
		'Tanks',
		'Tanned Skin',
		'Teacher',
		"Teens' Love",
		'Tennis',
		'Terrorism',
		'Time Loop',
		'Time Manipulation',
		'Time Skip',
		'Tokusatsu',
		'Tomboy',
		'Torture',
		'Tragedy',
		'Trains',
		'Transgender',
		'Travel',
		'Triads',
		'Tsundere',
		'Twins',
		'Unrequited Love',
		'Urban',
		'Urban Fantasy',
		'Vampire',
		'Vertical Video',
		'Veterinarian',
		'Video Games',
		'Vikings',
		'Villainess',
		'Virtual World',
		'Vocal Synth',
		'Volleyball',
		'VTuber',
		'War',
		'Werewolf',
		'Wilderness',
		'Witch',
		'Work',
		'Wrestling',
		'Writing',
		'Wuxia',
		'Yakuza',
		'Yandere',
		'Youkai',
		'Yuri',
		'Zombie'
	];

	const LIST = config?.label === 'Genres' ? GENRES : TAGS;
	const defaultSettings =
		config?.label === 'Genres' ? GENRES_DEFAULT_SETTINGS : TAGS_DEFAULT_SETTINGS;

	function ensureValue() {
		if (!editedValue || typeof editedValue !== 'object') editedValue = {};
		if (!editedValue.viewMode) editedValue.viewMode = defaultSettings.viewMode;
		if (!editedValue.mode) editedValue.mode = defaultSettings.mode;
		if (editedValue.showRates === undefined) editedValue.showRates = false; // not in defaults, keep as is
		if (!editedValue.advanced) editedValue.advanced = { ...defaultSettings.advanced };
		if (!editedValue.stateByKey) editedValue.stateByKey = {};
	}

	// Initial call for immediate initialization
	ensureValue();

	// Ensure value structure whenever editedValue changes (including on dialog reopen)
	$effect(() => {
		ensureValue();
	});

	// Handle mode switching with initialization instead of conversion
	let previousMode = editedValue.mode;
	$effect(() => {
		if (previousMode !== editedValue.mode) {
			const totalSongs = getTotalSongs();
			const totalSongsNum = typeof totalSongs === 'object' ? totalSongs.max : totalSongs;
			editedValue = initializeGenresTagsMode(editedValue, editedValue.mode, totalSongsNum);
			previousMode = editedValue.mode;
		}
	});

	// When Show Rates is enabled, set excluded items to 0
	$effect(() => {
		if (editedValue.showRates) {
			const stateByKey = editedValue.stateByKey || {};
			for (const [key, state] of Object.entries(stateByKey)) {
				if (state === 'exclude') {
					if (!editedValue.advanced[key]) editedValue.advanced[key] = {};
					if (editedValue.mode === 'percentage') {
						editedValue.advanced[key].percentageValue = 0;
					} else {
						editedValue.advanced[key].countValue = 0;
					}
				}
			}
		}
	});

	const stateCycle = ['include', 'exclude', 'optional'];
	const stateIcon = { include: '+', exclude: '−', optional: '~' };
	const stateColor = {
		include: 'bg-green-100 text-green-700',
		exclude: 'bg-red-100 text-red-700',
		optional: 'bg-amber-100 text-amber-700'
	};

	function cycleState(key) {
		const current = editedValue.stateByKey[key] || 'optional';
		const idx = stateCycle.indexOf(current);
		const next = stateCycle[(idx + 1) % stateCycle.length];
		editedValue.stateByKey[key] = next;

		// When switching to exclude and Show Rates is active, set value to 0
		if (next === 'exclude' && editedValue.showRates) {
			if (!editedValue.advanced[key]) editedValue.advanced[key] = {};
			if (editedValue.mode === 'percentage') {
				editedValue.advanced[key].percentageValue = 0;
			} else {
				editedValue.advanced[key].countValue = 0;
			}
		}
	}

	// Search functionality
	let searchQuery = $state('');
	let searchDropdownOpen = $state(false);
	let filteredItems = $derived(
		LIST.filter((item) => !searchQuery || item.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	function addItem(item) {
		editedValue.stateByKey[item] = 'optional';
		searchQuery = '';
		searchDropdownOpen = false;
	}

	function clickOutside(node) {
		function handleClick(event) {
			if (!node.contains(event.target)) {
				searchDropdownOpen = false;
			}
		}
		document.addEventListener('click', handleClick);
		return {
			destroy() {
				document.removeEventListener('click', handleClick);
			}
		};
	}
	function removeItem(key) {
		delete editedValue.stateByKey[key];
	}

	// Validation logic
	function validateValue() {
		if (!editedValue) return; // Don't validate if editedValue is not initialized
		const errors = [];

		// Basic overlap validation using stateByKey
		const stateByKey = editedValue.stateByKey || {};
		const included = new Set();
		const excluded = new Set();
		const optional = new Set();

		for (const [key, state] of Object.entries(stateByKey)) {
			if (state === 'include') included.add(key);
			else if (state === 'exclude') excluded.add(key);
			else if (state === 'optional') optional.add(key);
		}

		for (const g of included) {
			if (excluded.has(g)) {
				errors.push(`"${g}" is both included and excluded`);
			}
		}
		for (const g of optional) {
			if (excluded.has(g)) {
				errors.push(`"${g}" is optional and excluded; excluded will take precedence`);
			}
		}

		// Show Rates validation - when user has enabled "Show Rates"
		if (editedValue.showRates) {
			const mode = editedValue.mode || 'count';
			const entries = editedValue.advanced || {};
			const keys = Object.keys(entries);
			let total = 0;

			for (const k of keys) {
				const e = entries[k];
				if (!e) continue;
				// For genres/tags, if enabled is explicitly false, skip; otherwise include
				if (e.enabled === false) continue;

				const val = Number(
					mode === 'percentage'
						? (e.percentageValue ?? e.value ?? 0)
						: (e.countValue ?? e.value ?? 0)
				);
				if (!Number.isFinite(val) || val < 0) {
					errors.push(
						`"${k}" must be a non-negative ${mode === 'percentage' ? 'percentage' : 'count'}`
					);
					continue;
				}
				total += val;
			}

			const nodeType = config?.label === 'Genres' ? 'genres' : 'tags';
			if (mode === 'percentage') {
				if (total > 100.01) {
					errors.push(`Percentages exceed 100%`);
					errors.push(
						`Sum of enabled ${nodeType} percentages is ${total.toFixed(1)}%. Must not exceed 100%.`
					);
				}
			} else {
				// count mode
				const totalSongs =
					typeof getTotalSongs() === 'object'
						? (getTotalSongs().max ?? getTotalSongs().value ?? 20)
						: getTotalSongs() || 20;
				if (total > totalSongs) {
					errors.push(`Counts exceed total songs`);
					errors.push(
						`Sum of enabled ${nodeType} counts is ${total}. Must not exceed ${totalSongs}.`
					);
				}
			}
		}

		isValid = errors.length === 0;
		validationMessage = errors.join('; ');
	}

	// Watch for changes and validate - run validation immediately when component loads
	$effect(() => {
		// Always validate when editedValue exists, even on initial load
		validateValue();
	});
</script>

{#if editedValue && editedValue.stateByKey !== undefined}
	<div class="space-y-6">
		<!-- Validation Error Display -->
		{#if !isValid && validationMessage}
			<div class="rounded-lg border border-red-200 bg-red-50 p-3">
				<div class="flex items-start gap-3">
					<div class="mt-0.5 flex-shrink-0">
						<svg class="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
								clip-rule="evenodd"
							></path>
						</svg>
					</div>
					<div class="flex-1">
						<h4 class="mb-1 text-sm font-medium text-red-900">Configuration Error</h4>
						<div class="text-sm text-red-800">
							{#each validationMessage.split('; ') as error}
								<div class="mb-1 rounded bg-red-100 p-2 text-xs">
									<strong>⚠️</strong>
									{error}
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- View Toggle -->
		<div class="flex items-center justify-end gap-3">
			<Label class="flex items-center gap-2 text-sm">
				<Checkbox bind:checked={editedValue.showRates} class="" />
				Show Rates
			</Label>
			<div class="inline-flex overflow-hidden rounded border">
				<Button
					variant="ghost"
					size="sm"
					class="px-3 py-1 text-sm {editedValue.mode === 'percentage'
						? 'bg-blue-100 text-blue-700'
						: ''}"
					disabled={readOnly || editedValue.percentageModeLocked}
					onclick={() => (editedValue.mode = 'percentage')}>%</Button
				>
				<Button
					variant="ghost"
					size="sm"
					class="px-3 py-1 text-sm {editedValue.mode === 'count'
						? 'bg-blue-100 text-blue-700'
						: ''}"
					disabled={readOnly ||
						typeof getTotalSongs() === 'object' ||
						editedValue.percentageModeLocked}
					onclick={() => (editedValue.mode = 'count')}>Count</Button
				>
			</div>
			{#if editedValue.percentageModeLocked}
				<Popover.Root>
					<Popover.Trigger class="">
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="cursor-help text-xs font-medium text-orange-600 hover:text-orange-700"
								title="Why is this locked?"
							>
								(Locked)
							</button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content class="w-auto p-0" align="start" portalProps={{}}>
						<div
							class="rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-800"
						>
							Percentage mode is locked because you have multiple<br />
							"Number of Songs" nodes or random range enabled;<br />
							remove extra nodes or disable random range to unlock.
						</div>
					</Popover.Content>
				</Popover.Root>
			{/if}
		</div>

		<!-- Search box -->
		<div class="relative" use:clickOutside>
			<Input
				type="text"
				class="w-full"
				placeholder="Search and add {config.label.toLowerCase()}..."
				bind:value={searchQuery}
				onfocus={() => (searchDropdownOpen = true)}
				oninput={() => (searchDropdownOpen = true)}
			/>
			{#if searchDropdownOpen && filteredItems.length > 0}
				<div
					class="absolute top-full z-10 mt-1 max-h-60 w-full overflow-auto rounded border bg-white shadow-lg"
				>
					{#each filteredItems as item}
						{#if !editedValue?.stateByKey?.[item]}
							<Button
								variant="ghost"
								class="w-full justify-start px-3 py-2 text-left"
								disabled={false}
								onclick={() => addItem(item)}
							>
								{item}
							</Button>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<!-- Compact single list with tri-state badge -->
		<div class="h-[45vh] overflow-auto rounded border p-2 text-sm">
			{#each Object.keys(editedValue?.stateByKey || {}).sort() as item}
				<div class="flex items-center justify-between gap-2 py-1">
					<span class="truncate">{item}</span>
					<div class="flex items-center gap-1">
						{#if editedValue.showRates && editedValue.stateByKey[item] !== 'exclude'}
							<input
								type="number"
								class="h-6 w-16 rounded border px-2 text-center"
								min="0"
								max={editedValue.mode === 'percentage' ? 100 : undefined}
								value={editedValue.mode === 'percentage'
									? (editedValue.advanced[item]?.percentageValue ?? 0)
									: (editedValue.advanced[item]?.countValue ?? 0)}
								disabled={readOnly}
								oninput={(e) => {
									if (!editedValue.advanced[item]) editedValue.advanced[item] = {};
									const v = Math.max(
										0,
										Math.min(
											editedValue.mode === 'percentage' ? 100 : Infinity,
											parseInt(e.currentTarget.value) || 0
										)
									);
									if (editedValue.mode === 'percentage')
										editedValue.advanced[item].percentageValue = v;
									else editedValue.advanced[item].countValue = v;
								}}
							/>
							<span class="text-gray-600">{editedValue.mode === 'percentage' ? '%' : ''}</span>
						{:else if editedValue.showRates && editedValue.stateByKey[item] === 'exclude'}
							<!-- Show 0 for excluded items when Show Rates is active -->
							<span class="flex h-6 w-16 items-center justify-center text-sm text-gray-500">0</span>
							<span class="text-gray-600">{editedValue.mode === 'percentage' ? '%' : ''}</span>
						{/if}
						<Button
							variant="outline"
							size="sm"
							class="px-2.5 py-1 text-xs font-semibold {stateColor[
								editedValue?.stateByKey?.[item] || 'optional'
							]}"
							disabled={readOnly}
							onclick={() => cycleState(item)}
							>{stateIcon[editedValue?.stateByKey?.[item] || 'optional']}</Button
						>
						<Button
							variant="ghost"
							size="icon"
							class="text-lg text-red-500 hover:text-red-700"
							disabled={readOnly}
							onclick={() => removeItem(item)}
						>
							&times;
						</Button>
					</div>
				</div>
			{/each}
			{#if Object.keys(editedValue?.stateByKey || {}).length === 0}
				<div class="py-4 text-center text-gray-500">
					No items added yet. Use the search box above to add {config.label.toLowerCase()}.
				</div>
			{/if}
		</div>
		{#if editedValue.showRates}
			<div class="mt-2 flex flex-col gap-1">
				<div class="text-right text-[11px] text-gray-500">
					Totals must equal {editedValue.mode === 'percentage'
						? '100%'
						: typeof getTotalSongs() === 'object'
							? getTotalSongs().max
							: getTotalSongs()}.
				</div>
				<div class="text-right text-[11px] text-orange-600">
					⚠ Overlapping {config.label.toLowerCase()} may reduce final song count
				</div>
			</div>
		{/if}
	</div>
{/if}
