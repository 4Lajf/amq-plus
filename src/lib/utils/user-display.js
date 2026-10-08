/**
 * Returns the best username-like label available for a Supabase auth user.
 * Prefers explicit username fields before falling back to broader profile names.
 *
 * @param {import('@supabase/supabase-js').User | null | undefined} user
 * @param {string} [fallback='User']
 * @returns {string}
 */
export function getUserDisplayName(user, fallback = 'User') {
	const metadata = user?.user_metadata ?? {};
	const customClaims = metadata.custom_claims ?? {};
	const candidates = [
		metadata.preferred_username,
		metadata.username,
		metadata.user_name,
		customClaims.preferred_username,
		customClaims.username,
		customClaims.global_name,
		metadata.full_name,
		metadata.name,
		user?.email ? user.email.split('@')[0] : null,
		fallback
	];

	return candidates.find((value) => typeof value === 'string' && value.trim()) || fallback;
}
