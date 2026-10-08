import { describe, expect, it } from 'vitest';
import {
	BASIC_TEMPLATE_ID,
	EXECUTION_CHANCES_TEMPLATE_ID,
	ROUTER_MODIFIERS_TEMPLATE_ID,
	buildStarterConfiguration
} from '../src/lib/server/starter-templates.js';

function filter(id, settings = {}) {
	return {
		id: `filter-${id}`,
		filterId: id,
		enabled: true,
		executionChance: 100,
		selectionModifier: null,
		settings
	};
}

function baseConfiguration() {
	return {
		version: '2.0',
		routes: [
			{
				id: 'route-basic',
				name: 'Route 1',
				enabled: true,
				percentage: 100,
				basicSettings: {
					guessTime: { value: { useRange: false, staticValue: 20 } }
				},
				numberOfSongs: { min: 20, max: 20, useRange: false, staticValue: 20 },
				filters: [
					filter('songs-and-types', {
						mode: 'percentage',
						songCount: { value: 20 },
						songTypes: {
							openings: { enabled: true, count: 10, percentage: 50, random: false },
							endings: { enabled: true, count: 10, percentage: 50, random: false },
							inserts: { enabled: false, count: 0, percentage: 0, random: false }
						}
					}),
					filter('vintage', { mode: 'percentage', ranges: [] }),
					filter('song-difficulty'),
					filter('anime-type'),
					filter('genres', {
						viewMode: 'basic',
						mode: 'percentage',
						included: [],
						excluded: [],
						optional: []
					}),
					filter('tags')
				]
			}
		]
	};
}

function allocation(route) {
	return route.filters.find((entry) => entry.filterId === 'songs-and-types').settings.songTypes;
}

function allocationCounts(route) {
	return Object.fromEntries(
		Object.entries(allocation(route)).map(([songType, settings]) => [songType, settings.count])
	);
}

describe('homepage starter templates', () => {
	it('keeps the beginner linear flow unchanged and does not mutate its source', () => {
		const source = baseConfiguration();
		const result = buildStarterConfiguration(source, BASIC_TEMPLATE_ID);

		expect(result).toEqual(source);
		expect(result).not.toBe(source);
	});

	it('adds fixed and ranged execution chances to the intermediate flow', () => {
		const source = baseConfiguration();
		const result = buildStarterConfiguration(source, EXECUTION_CHANCES_TEMPLATE_ID);
		const route = result.routes[0];
		const chances = Object.fromEntries(
			route.filters.map((entry) => [entry.filterId, entry.executionChance])
		);

		expect(route.name).toBe('Dynamic Mix');
		expect(allocationCounts(route)).toEqual({ openings: 10, endings: 10, inserts: 0 });
		expect(route.filters.find((entry) => entry.filterId === 'songs-and-types').settings.mode).toBe(
			'count'
		);
		expect(chances.vintage).toEqual({ kind: 'range', min: 65, max: 90 });
		expect(chances['song-difficulty']).toBe(80);
		expect(chances['anime-type']).toBe(65);
		expect(chances.genres).toBe(50);
		expect(chances.tags).toBe(35);
		expect(source.routes[0].name).toBe('Route 1');
	});

	it('builds two weighted advanced routes with route-specific settings and modifiers', () => {
		const result = buildStarterConfiguration(baseConfiguration(), ROUTER_MODIFIERS_TEMPLATE_ID);
		const [classic, modern] = result.routes;

		expect(result.routes).toHaveLength(2);
		expect(result.routes.map((route) => [route.name, route.percentage])).toEqual([
			['Classic Challenge', 45],
			['Modern Variety', 55]
		]);
		expect(allocationCounts(classic)).toEqual({ openings: 12, endings: 8, inserts: 0 });
		expect(allocationCounts(modern)).toEqual({ openings: 8, endings: 12, inserts: 0 });
		expect(classic.basicSettings.guessTime.value.staticValue).toBe(20);
		expect(modern.basicSettings.guessTime.value.staticValue).toBe(15);
		expect(
			classic.filters.find((entry) => entry.filterId === 'vintage').settings.ranges[0]
		).toMatchObject({ from: { year: 1970 }, to: { year: 2009 }, percentage: 100 });
		expect(
			modern.filters.find((entry) => entry.filterId === 'vintage').settings.ranges[0]
		).toMatchObject({ from: { year: 2010 }, to: { year: 2026 }, percentage: 100 });

		for (const route of result.routes) {
			const genreAlternatives = route.filters.filter((entry) => entry.filterId === 'genres');
			expect(genreAlternatives).toHaveLength(3);
			expect(genreAlternatives.every((entry) => entry.selectionModifier?.maxSelection === 1)).toBe(
				true
			);
			expect(new Set(route.filters.map((entry) => entry.id)).size).toBe(route.filters.length);
		}
		expect(classic.id).not.toBe(modern.id);
	});
});
