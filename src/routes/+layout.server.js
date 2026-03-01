/**
 * @typedef {Object} LoadParams
 * @property {Object} locals - SvelteKit locals object
 * @property {Function} locals.safeGetSession - Function to safely get session
 * @property {import('@sveltejs/kit').Cookies} cookies - SvelteKit cookies object
 */

/**
 * @typedef {Object} CookieEntry
 * @property {string} name - Cookie name
 * @property {string} value - Cookie value
 * @property {Object} [options] - Cookie options
 */

/**
 * Layout server load function for managing user sessions
 * Provides session and cookies data to all pages
 * 
 * @param {LoadParams} params - SvelteKit load parameters
 * @returns {Promise<{session: import('@supabase/supabase-js').Session|null, cookies: CookieEntry[]}>}
 */
export const load = async ({ locals: { safeGetSession }, cookies }) => {
	const { session } = await safeGetSession();

	return {
		session,
		cookies: cookies.getAll()
	};
};
