export const BASIC_TEMPLATE_ID = '0c27d99e-2a2c-459c-9786-99502ead9c68';
export const EXECUTION_CHANCES_TEMPLATE_ID = '841e6154-5473-4981-81d2-253a256e67f6';
export const ROUTER_MODIFIERS_TEMPLATE_ID = 'e88e6b4c-df74-4223-815a-d89ce36a4867';

const SONG_COUNT = 20;

function findFilter(route, filterId) {
	return route.filters?.find((filter) => filter.filterId === filterId);
}

function setSongAllocation(route, allocation) {
	const filter = findFilter(route, 'songs-and-types');
	if (!filter?.settings?.songTypes) return;

	filter.executionChance = 100;
	filter.settings.mode = 'count';
	filter.settings.songCount = {
		...(filter.settings.songCount ?? {}),
		min: SONG_COUNT,
		max: SONG_COUNT,
		value: SONG_COUNT,
		random: false
	};

	for (const [songType, settings] of Object.entries(filter.settings.songTypes)) {
		const count = allocation[songType] ?? 0;
		const percentage = (count / SONG_COUNT) * 100;
		Object.assign(settings, {
			enabled: count > 0,
			count,
			countMin: count,
			countMax: count,
			percentage,
			percentageMin: percentage,
			percentageMax: percentage,
			random: false
		});
	}

	route.numberOfSongs = {
		...(route.numberOfSongs ?? {}),
		min: SONG_COUNT,
		max: SONG_COUNT,
		useRange: false,
		staticValue: SONG_COUNT
	};
}

function setVintage(route, fromYear, toYear) {
	const filter = findFilter(route, 'vintage');
	if (!filter) return;

	const existingRange = filter.settings?.ranges?.[0] ?? {};
	filter.executionChance = 100;
	filter.settings = {
		...(filter.settings ?? {}),
		mode: 'percentage',
		ranges: [
			{
				...existingRange,
				from: { year: fromYear, season: 'Winter' },
				to: { year: toYear, season: 'Fall' },
				count: SONG_COUNT,
				percentage: 100,
				useAdvanced: false
			}
		]
	};
}

function setGuessTime(route, seconds) {
	const value = route.basicSettings?.guessTime?.value;
	if (!value || typeof value !== 'object') return;

	value.useRange = false;
	value.staticValue = seconds;
}

function makeGenreAlternatives(route, genres, suffix) {
	const sourceFilter = findFilter(route, 'genres');
	if (!sourceFilter) return;

	const alternatives = genres.map((genre, index) => ({
		...structuredClone(sourceFilter),
		id: `${sourceFilter.id}-${suffix}-${genre.toLowerCase().replaceAll(' ', '-')}`,
		enabled: true,
		executionChance: [85, 65, 45][index] ?? 50,
		selectionModifier: { minSelection: 1, maxSelection: 1 },
		settings: {
			...structuredClone(sourceFilter.settings ?? {}),
			viewMode: 'basic',
			mode: 'percentage',
			included: [genre],
			excluded: [],
			optional: []
		}
	}));

	route.filters = route.filters.flatMap((filter) =>
		filter === sourceFilter ? alternatives : [filter]
	);
}

function cloneRoute(sourceRoute, suffix, name, percentage) {
	const route = structuredClone(sourceRoute);
	route.id = `${sourceRoute.id}-${suffix}`;
	route.name = name;
	route.enabled = true;
	route.percentage = percentage;
	route.filters = (route.filters ?? []).map((filter) => ({
		...filter,
		id: `${filter.id}-${suffix}`,
		executionChance: 100,
		selectionModifier: null
	}));
	return route;
}

function buildExecutionChancesTemplate(configuration) {
	const route = configuration.routes?.[0];
	if (!route) return configuration;

	route.name = 'Dynamic Mix';
	route.percentage = 100;
	setSongAllocation(route, { openings: 10, endings: 10, inserts: 0 });

	const chances = {
		vintage: { kind: 'range', min: 65, max: 90 },
		'song-difficulty': 80,
		'anime-type': 65,
		genres: 50,
		tags: 35
	};

	for (const filter of route.filters ?? []) {
		if (chances[filter.filterId] != null) {
			filter.executionChance = structuredClone(chances[filter.filterId]);
		}
	}

	return configuration;
}

function buildRouterModifiersTemplate(configuration) {
	const sourceRoute = configuration.routes?.[0];
	if (!sourceRoute) return configuration;

	const classicRoute = cloneRoute(sourceRoute, 'classic', 'Classic Challenge', 45);
	setSongAllocation(classicRoute, { openings: 12, endings: 8, inserts: 0 });
	setVintage(classicRoute, 1970, 2009);
	setGuessTime(classicRoute, 20);
	makeGenreAlternatives(classicRoute, ['Action', 'Drama', 'Sci-Fi'], 'classic');

	const modernRoute = cloneRoute(sourceRoute, 'modern', 'Modern Variety', 55);
	setSongAllocation(modernRoute, { openings: 8, endings: 12, inserts: 0 });
	setVintage(modernRoute, 2010, 2026);
	setGuessTime(modernRoute, 15);
	makeGenreAlternatives(modernRoute, ['Comedy', 'Romance', 'Fantasy'], 'modern');

	configuration.routes = [classicRoute, modernRoute];
	return configuration;
}

/**
 * Build three progressively more capable, immediately playable configurations
 * from the known-good basic template stored in Supabase.
 *
 * @param {Record<string, any>} configurationData
 * @param {string} templateId
 */
export function buildStarterConfiguration(configurationData, templateId) {
	const configuration = structuredClone(configurationData);

	if (templateId === EXECUTION_CHANCES_TEMPLATE_ID) {
		return buildExecutionChancesTemplate(configuration);
	}

	if (templateId === ROUTER_MODIFIERS_TEMPLATE_ID) {
		return buildRouterModifiersTemplate(configuration);
	}

	return configuration;
}
