/** Assign persistent source identities before editing positional legacy routes. */
export function normalizeSourceIdentities(route, createId) {
	const sources = Array.isArray(route.sources) ? route.sources : [route.source].filter(Boolean);
	for (const source of sources) source.id ||= createId('source');
	const resolve = (target) => {
		if (!target || sources.some((source) => source.id === target)) return target;
		const match = /^source-(?:main-)?(\d+)$/.exec(target);
		const index = target === 'source-main' ? 0 : match ? Number(match[1]) : null;
		if (index === null) return target;
		return sources[index]?.id || `missing-${target}`;
	};
	for (const filter of route.filters || []) {
		const selector = filter.sourceSelector;
		if (!selector) continue;
		if (selector.targetSourceId) selector.targetSourceId = resolve(selector.targetSourceId);
		if (Array.isArray(selector.targetSourceIds)) {
			selector.targetSourceIds = selector.targetSourceIds.map(resolve);
		}
	}
	return route;
}
