import { describe, expect, it } from 'vitest';
import { normalizeSourceIdentities } from '../src/lib/utils/editorSourceIdentity.js';

describe('editor source identity', () => {
	function fixture(targetSourceId = 'source-main-1') {
		let next = 0;
		const createId = () => `stable-${next++}`;
		const route = {
			sources: [{ mode: 'masterlist' }, { mode: 'saved-lists' }],
			filters: [{ sourceSelector: { targetSourceId } }]
		};
		return { route, createId };
	}

	it('keeps a legacy selector on its source after an earlier source is deleted', () => {
		const { route, createId } = fixture();
		normalizeSourceIdentities(route, createId);
		const selected = route.sources[1].id;
		route.sources.splice(0, 1);
		normalizeSourceIdentities(route, createId);
		expect(route.filters[0].sourceSelector.targetSourceId).toBe(selected);
		expect(route.sources[0].id).toBe(selected);
	});

	it('keeps a deleted target unresolved instead of selecting its replacement', () => {
		const { route, createId } = fixture('source-main-0');
		normalizeSourceIdentities(route, createId);
		const selected = route.sources[0].id;
		route.sources.splice(0, 1);
		normalizeSourceIdentities(route, createId);
		expect(route.filters[0].sourceSelector.targetSourceId).toBe(selected);
		expect(route.sources.some((source) => source.id === selected)).toBe(false);
	});

	it('preserves stable IDs and is unchanged by save/load normalization', () => {
		const { route, createId } = fixture('existing');
		route.sources[1].id = 'existing';
		normalizeSourceIdentities(route, createId);
		const saved = JSON.parse(JSON.stringify(route));
		expect(normalizeSourceIdentities(saved, createId)).toEqual(route);
		expect(saved.filters[0].sourceSelector.targetSourceId).toBe('existing');
	});

	it('does not revive an already missing positional selector when a source is added', () => {
		const { route, createId } = fixture('source-main-2');
		normalizeSourceIdentities(route, createId);
		route.sources.push({ mode: 'masterlist' });
		normalizeSourceIdentities(route, createId);
		expect(route.filters[0].sourceSelector.targetSourceId).toBe('missing-source-main-2');
	});
});
