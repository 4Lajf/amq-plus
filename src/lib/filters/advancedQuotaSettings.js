/** Convert the editor's enabled quota controls to the generator's count/range map. */
export function resolveAdvancedQuotaSettings(entries, mode) {
	const prefix = mode === 'percentage' ? 'percentage' : 'count';
	return Object.fromEntries(
		Object.entries(entries || {})
			.filter(([, value]) => value.enabled)
			.map(([key, value]) => [
				key,
				value.random
					? { min: value[`${prefix}Min`] ?? 0, max: value[`${prefix}Max`] ?? 0 }
					: (value[`${prefix}Value`] ?? 0)
			])
	);
}
