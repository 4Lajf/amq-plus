// @ts-nocheck
import { redirect } from '@sveltejs/kit';

/**
 * GET handler for OAuth callback
 * Handles the Discord OAuth callback and exchanges the code for a session
 * @param {Object} event - SvelteKit request event
 * @param {URL} event.url - Request URL with search parameters
 * @param {Object} event.locals - SvelteKit locals with Supabase client
 * @returns {Response} Redirect response
 */
export const GET = async (event) => {
	const {
		url,
		locals: { supabase }
	} = event;

	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') ?? '/';

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			throw redirect(303, `/${next.slice(1)}`);
		}
	}

	// return the user to an error page with instructions
	throw redirect(303, '/auth/error');
};
