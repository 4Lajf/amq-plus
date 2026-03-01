<script>
	import {
		GENRES_DEFAULT_SETTINGS,
		TAGS_DEFAULT_SETTINGS
	} from '$lib/utils/defaultNodeSettings.js';
	import { initializeGenresTagsMode } from '$lib/utils/modeInitializationUtils.js';
	import { quickFixGenresTags } from '$lib/utils/quickFixUtils.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#6366f1',
		getTotalSongs = () => 20,
		readOnly = false,
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

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
		if (editedValue.showRates === undefined)
			editedValue.showRates = editedValue.viewMode === 'advanced';
		if (!editedValue.advanced) editedValue.advanced = { ...defaultSettings.advanced };
		if (!Array.isArray(editedValue.included)) editedValue.included = [...defaultSettings.included];
		if (!Array.isArray(editedValue.excluded)) editedValue.excluded = [...defaultSettings.excluded];
		if (!Array.isArray(editedValue.optional)) editedValue.optional = [...defaultSettings.optional];
		if (!editedValue.stateByKey) editedValue.stateByKey = {};
	}

	let initialSyncComplete = $state(false);
	ensureValue();

	$effect(() => {
		ensureValue();
	});

	function arraysEqual(a, b) {
		if (a === b) return true;
		if (!Array.isArray(a) || !Array.isArray(b)) return false;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	function syncStateFromLists() {
		const stateByKey = editedValue.stateByKey || {};
		const hasEntries = Object.keys(stateByKey).length > 0;
		const included = Array.isArray(editedValue.included) ? editedValue.included : [];
		const excluded = Array.isArray(editedValue.excluded) ? editedValue.excluded : [];
		const optional = Array.isArray(editedValue.optional) ? editedValue.optional : [];

		if (
			hasEntries ||
			(!included.length && !excluded.length && !optional.length) ||
			initialSyncComplete ||
			(!hasEntries && (included.length > 0 || excluded.length > 0 || optional.length > 0))
		)
			return;

		const seeded = {};
		for (const key of optional) seeded[key] = 'optional';
		for (const key of included) seeded[key] = 'include';
		for (const key of excluded) seeded[key] = 'exclude';
		editedValue.stateByKey = seeded;
		initialSyncComplete = true;
	}

	function syncListsFromState() {
		const stateByKey = editedValue.stateByKey || {};
		const included = [],
			excluded = [],
			optional = [];
		for (const [key, state] of Object.entries(stateByKey)) {
			if (state === 'include') included.push(key);
			else if (state === 'exclude') excluded.push(key);
			else optional.push(key);
		}
		if (!arraysEqual(editedValue.included, included)) editedValue.included = included;
		if (!arraysEqual(editedValue.excluded, excluded)) editedValue.excluded = excluded;
		if (!arraysEqual(editedValue.optional, optional)) editedValue.optional = optional;
	}

	$effect(() => {
		if (!editedValue) return;
		const desiredViewMode = editedValue.showRates ? 'advanced' : 'basic';
		if (editedValue.viewMode !== desiredViewMode) editedValue.viewMode = desiredViewMode;
	});

	$effect(() => {
		if (!editedValue) return;
		const _ = [editedValue.included, editedValue.excluded, editedValue.optional];
		syncStateFromLists();
	});

	$effect(() => {
		if (!editedValue) return;
		const _ = editedValue.stateByKey;
		syncListsFromState();
	});

	let previousMode = editedValue.mode;
	$effect(() => {
		if (previousMode !== editedValue.mode) {
			const totalSongs = getTotalSongs();
			const totalSongsNum = typeof totalSongs === 'object' ? totalSongs.max : totalSongs;
			editedValue = initializeGenresTagsMode(editedValue, editedValue.mode, totalSongsNum);
			previousMode = editedValue.mode;
		}
	});

	$effect(() => {
		if (editedValue.showRates) {
			const stateByKey = editedValue.stateByKey || {};
			const updatedAdvanced = { ...editedValue.advanced };
			let hasChanges = false;
			for (const [key, state] of Object.entries(stateByKey)) {
				if (state === 'exclude') {
					const currentItem = updatedAdvanced[key] || {};
					if (editedValue.mode === 'percentage')
						updatedAdvanced[key] = { ...currentItem, percentageValue: 0 };
					else updatedAdvanced[key] = { ...currentItem, countValue: 0 };
					hasChanges = true;
				}
			}
			if (hasChanges) editedValue.advanced = updatedAdvanced;
		}
	});

	const stateCycle = ['include', 'exclude', 'optional'];
	const stateIcon = { include: '+', exclude: '−', optional: '~' };
	const stateColors = {
		include: { bg: '#3fb95018', border: '#3fb95044', text: '#3fb950' },
		exclude: { bg: '#f8514918', border: '#f8514944', text: '#f85149' },
		optional: { bg: '#f59e0b18', border: '#f59e0b44', text: '#f59e0b' }
	};

	function cycleState(key) {
		const current = editedValue.stateByKey[key] || 'optional';
		const idx = stateCycle.indexOf(current);
		const next = stateCycle[(idx + 1) % stateCycle.length];
		editedValue.stateByKey = { ...editedValue.stateByKey, [key]: next };
		if (next === 'exclude' && editedValue.showRates) {
			const currentItem = editedValue.advanced[key] || {};
			if (editedValue.mode === 'percentage')
				editedValue.advanced = {
					...editedValue.advanced,
					[key]: { ...currentItem, percentageValue: 0 }
				};
			else
				editedValue.advanced = {
					...editedValue.advanced,
					[key]: { ...currentItem, countValue: 0 }
				};
		}
	}

	let searchQuery = $state('');
	let searchDropdownOpen = $state(false);
	let filteredItems = $derived(
		LIST.filter((item) => !searchQuery || item.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	function addItem(item) {
		editedValue.stateByKey = { ...editedValue.stateByKey, [item]: 'optional' };
		searchQuery = '';
		searchDropdownOpen = false;
	}

	function clickOutside(node) {
		function handleClick(event) {
			if (!node.contains(event.target)) searchDropdownOpen = false;
		}
		document.addEventListener('click', handleClick);
		return {
			destroy() {
				document.removeEventListener('click', handleClick);
			}
		};
	}

	function removeItem(key) {
		const { [key]: _, ...rest } = editedValue.stateByKey;
		editedValue.stateByKey = rest;
	}

	function validateValue() {
		if (!editedValue) return;
		const errors = [];
		const stateByKey = editedValue.stateByKey || {};
		const included = new Set(),
			excluded = new Set(),
			optional = new Set();

		for (const [key, state] of Object.entries(stateByKey)) {
			if (state === 'include') included.add(key);
			else if (state === 'exclude') excluded.add(key);
			else optional.add(key);
		}

		for (const g of included) {
			if (excluded.has(g)) errors.push(`"${g}" is both included and excluded`);
		}
		for (const g of optional) {
			if (excluded.has(g)) errors.push(`"${g}" is optional and excluded`);
		}

		if (editedValue.showRates) {
			const mode = editedValue.mode || 'count';
			const entries = editedValue.advanced || {};
			let total = 0;
			for (const k of Object.keys(entries)) {
				const e = entries[k];
				if (!e || e.enabled === false) continue;
				const val = Number(
					mode === 'percentage'
						? (e.percentageValue ?? e.value ?? 0)
						: (e.countValue ?? e.value ?? 0)
				);
				if (!Number.isFinite(val) || val < 0) {
					errors.push(`"${k}" must be non-negative`);
					continue;
				}
				total += val;
			}
			if (mode === 'percentage' && total > 100.01)
				errors.push(`Percentages total ${total.toFixed(1)}%, exceeds 100%`);
			else if (mode === 'count') {
				const totalSongs =
					typeof getTotalSongs() === 'object' ? (getTotalSongs().max ?? 20) : getTotalSongs() || 20;
				if (total > totalSongs) errors.push(`Counts total ${total}, exceeds ${totalSongs} songs`);
			}
		}

		isValid = errors.length === 0;
		validationMessage = errors.join('; ');
	}

	$effect(() => {
		validateValue();
	});

	const sortedItems = $derived(Object.keys(editedValue?.stateByKey || {}).sort());
</script>

{#if editedValue && editedValue.stateByKey !== undefined}
	<div class="flex flex-col gap-3" style="--accent: {getNodeColor()}">
		{#if !isValid && validationMessage}
			<div
				class="text-ed-red flex items-center gap-2 rounded border border-[#f8514933] bg-[#f8514910] px-3 py-2 text-xs"
			>
				<span>⚠</span>
				<span>{validationMessage}</span>
			</div>
		{/if}

		<!-- Toolbar: Show Rates toggle + Mode pills -->
		<div
			class="border-ed-border bg-ed-canvas-default flex items-center justify-between rounded-md border px-3 py-2"
		>
			<label class="flex cursor-pointer items-center gap-1.5">
				<input
					type="checkbox"
					class="df-checkbox"
					bind:checked={editedValue.showRates}
					disabled={readOnly}
				/>
				<span class="font-dm text-ed-fg-subtle text-[11px]">Show Rates</span>
			</label>
			{#if editedValue.showRates}
				<div class="flex items-center gap-2">
					<div class="df-pill-group">
						<button
							class:active={editedValue.mode === 'percentage'}
							disabled={readOnly || editedValue.percentageModeLocked}
							onclick={() => (editedValue.mode = 'percentage')}>%</button
						>
						<button
							class:active={editedValue.mode === 'count'}
							disabled={readOnly ||
								typeof getTotalSongs() === 'object' ||
								editedValue.percentageModeLocked}
							onclick={() => (editedValue.mode = 'count')}>Count</button
						>
					</div>
					{#if editedValue.percentageModeLocked}
						<span class="font-dm text-[10px] text-[#f59e0b]">locked</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Search -->
		<div class="relative" use:clickOutside>
			<input
				type="text"
				class="df-input h-8 w-full text-left"
				style="font-family: 'DM Sans', system-ui, sans-serif; font-size: 12px"
				placeholder="Search {config.label.toLowerCase()}..."
				bind:value={searchQuery}
				onfocus={() => (searchDropdownOpen = true)}
				oninput={() => (searchDropdownOpen = true)}
			/>
			{#if searchDropdownOpen && filteredItems.length > 0}
				<div
					class="border-ed-border-muted bg-ed-canvas-inset absolute top-full z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border shadow-xl"
				>
					{#each filteredItems as item}
						{#if !editedValue?.stateByKey?.[item]}
							<button
								class="font-dm text-ed-fg hover:bg-ed-border flex w-full items-center px-3 py-1.5 text-left text-[12px] transition-colors"
								onclick={() => addItem(item)}>{item}</button
							>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<!-- Items list -->
		<div
			class="border-ed-border-muted bg-ed-canvas-default max-h-[40vh] overflow-auto rounded-md border"
			style="scrollbar-width: thin; scrollbar-color: #30363d #161b22"
		>
			{#if sortedItems.length === 0}
				<div class="font-dm text-ed-fg-subtle flex items-center justify-center py-6 text-xs">
					No items added. Search above to add {config.label.toLowerCase()}.
				</div>
			{:else}
				{#each sortedItems as item}
					{@const itemState = editedValue.stateByKey[item] || 'optional'}
					{@const colors = stateColors[itemState]}
					<div
						class="border-ed-border flex items-center gap-2 border-b px-3 py-1.5 last:border-b-0"
					>
						<span class="font-dm text-ed-fg flex-1 truncate text-[12px]">{item}</span>

						{#if editedValue.showRates && itemState !== 'exclude'}
							<input
								type="number"
								class="df-input h-5 w-14"
								min="0"
								max={editedValue.mode === 'percentage' ? 100 : undefined}
								value={editedValue.mode === 'percentage'
									? (editedValue.advanced[item]?.percentageValue ?? 0)
									: (editedValue.advanced[item]?.countValue ?? 0)}
								disabled={readOnly}
								oninput={(e) => {
									const v = Math.max(
										0,
										Math.min(
											editedValue.mode === 'percentage' ? 100 : Infinity,
											parseInt(e.currentTarget.value) || 0
										)
									);
									const currentItem = editedValue.advanced[item] || {};
									if (editedValue.mode === 'percentage')
										editedValue.advanced = {
											...editedValue.advanced,
											[item]: { ...currentItem, percentageValue: v }
										};
									else
										editedValue.advanced = {
											...editedValue.advanced,
											[item]: { ...currentItem, countValue: v }
										};
								}}
							/>
							<span class="text-ed-fg-subtle font-jb text-[9px]"
								>{editedValue.mode === 'percentage' ? '%' : ''}</span
							>
						{:else if editedValue.showRates && itemState === 'exclude'}
							<span
								class="text-ed-fg-subtle font-jb flex h-5 w-14 items-center justify-center text-[10px]"
								>0</span
							>
							<span class="text-ed-fg-subtle font-jb text-[9px]"
								>{editedValue.mode === 'percentage' ? '%' : ''}</span
							>
						{/if}

						<button
							class="font-jb flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold transition-colors"
							style="background: {colors.bg}; border: 1px solid {colors.border}; color: {colors.text}"
							disabled={readOnly}
							onclick={() => cycleState(item)}
							title="{itemState} (click to cycle)">{stateIcon[itemState]}</button
						>

						<button
							class="text-ed-red flex h-5 w-5 items-center justify-center rounded bg-[#f8514910] transition-colors hover:bg-[#f8514925]"
							disabled={readOnly}
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								removeItem(item);
							}}
							title="Remove item"
						>
							<svg
								width="11"
								height="11"
								viewBox="0 0 16 16"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path d="M6 2h4a1 1 0 0 1 1 1v1H5V3a1 1 0 0 1 1-1Z" fill="currentColor" />
								<path
									fill-rule="evenodd"
									clip-rule="evenodd"
									d="M2 5h12v1H3.5l.9 8.1A1 1 0 0 0 5.4 15h5.2a1 1 0 0 0 .995-.9L12.5 6H14V5H2Zm3.09 1 .82 7.4h4.18l.82-7.4H5.09Z"
									fill="currentColor"
								/>
							</svg>
						</button>
					</div>
				{/each}
			{/if}
		</div>

		{#if editedValue.showRates}
			<div class="text-ed-fg-subtle flex items-center justify-between text-[10px]">
				<span
					>Max: {editedValue.mode === 'percentage'
						? '100%'
						: typeof getTotalSongs() === 'object'
							? getTotalSongs().max
							: getTotalSongs()}</span
				>
				<span class="text-[#f59e0b]"
					>Overlapping {config.label.toLowerCase()} may reduce final count</span
				>
			</div>
		{/if}
	</div>
{/if}
