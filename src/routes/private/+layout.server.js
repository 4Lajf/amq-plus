// @ts-nocheck
/**
 * This file is necessary to ensure protection of all routes in the `private`
 * directory. It makes the routes in this directory _dynamic_ routes, which
 * send a server request, and thus trigger `hooks.server.js`.
 */

/**
 * Layout server load function for private routes
 * @param {Object} params
 * @param {Object} params.locals - SvelteKit locals object with user session
 * @returns {Promise<{user: Object|null}>}
 */
export const load = async ({ locals: { session, user } }) => {
	return {
		session,
		user
	};
};
