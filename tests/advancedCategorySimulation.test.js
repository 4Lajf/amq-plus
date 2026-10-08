import { describe, it, expect } from 'vitest';
import { simulateQuizFromRoutes } from '../src/lib/utils/simulation.js';
import {
	ANIME_TYPE_DEFAULT_SETTINGS,
	SONG_CATEGORIES_DEFAULT_SETTINGS
} from '../src/lib/utils/defaultNodeSettings.js';
import { resolveAdvancedQuotaSettings } from '../src/lib/filters/advancedQuotaSettings.js';

describe('builder Advanced category quotas reach generation', () => {
	it('preserves percentage ranges and omits disabled quotas', () => {
		expect(
			resolveAdvancedQuotaSettings(
				{
					tv: { enabled: true, random: true, percentageMin: 10, percentageMax: 30 },
					movie: { enabled: true, random: false, percentageValue: 40 },
					ova: { enabled: false, countValue: 99 }
				},
				'percentage'
			)
		).toEqual({ tv: { min: 10, max: 30 }, movie: 40 });
	});
	it.each(['anime-type', 'song-categories'])('%s preserves the configured count', (filterId) => {
		const settings = structuredClone(
			filterId === 'anime-type' ? ANIME_TYPE_DEFAULT_SETTINGS : SONG_CATEGORIES_DEFAULT_SETTINGS
		);
		settings.viewMode = 'advanced';
		settings.mode = 'count';
		if (filterId === 'anime-type') {
			for (const [key, value] of Object.entries(settings.advanced)) {
				value.enabled = key === 'tv';
				value.countValue = 2;
				value.random = false;
			}
		} else {
			for (const [group, values] of Object.entries(settings.advanced)) {
				for (const [key, value] of Object.entries(values)) {
					value.enabled = group === 'openings' && key === 'standard';
					value.countValue = 2;
					value.random = false;
				}
			}
		}
		const config = simulateQuizFromRoutes([
			{
				id: 'route',
				enabled: true,
				percentage: 100,
				numberOfSongs: { staticValue: 20 },
				sources: [],
				basicSettings: {},
				filters: [{ id: 'filter', filterId, enabled: true, settings }]
			}
		]);
		const resolved = config.filters[0].settings;
		expect(resolved.mode).toBe('count');
		expect(resolved.total).toBe(20);
		expect(
			filterId === 'anime-type' ? resolved.types.tv : resolved.categories.openings.standard
		).toBe(2);
	});
});
