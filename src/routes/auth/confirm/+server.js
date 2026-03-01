import { redirect } from '@sveltejs/kit';

/**
 * GET handler for email confirmation
 * Handles email verification for signup confirmations
 * @param {Object} event - SvelteKit request event
 * @param {URL} event.url - Request URL with search parameters
 * @param {Object} event.locals - SvelteKit locals with Supabase client
 * @returns {Promise<Response>} Redirect response
 */
export const GET = async ({ url, locals: { supabase } }) => {
	const token_hash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type');
	const next = url.searchParams.get('next') ?? '/';

	/**
	 * Clean up the redirect URL by deleting the Auth flow parameters.
	 *
	 * `next` is preserved for now, because it's needed in the error case.
	 */
	const redirectTo = new URL(url);
	redirectTo.pathname = next;
	redirectTo.searchParams.delete('token_hash');
	redirectTo.searchParams.delete('type');

	if (token_hash && type) {
		const { error } = await supabase.auth.verifyOtp({ type, token_hash });
		if (!error) {
			redirectTo.searchParams.delete('next');
			throw redirect(303, redirectTo);
		}
	}

	redirectTo.pathname = '/auth/error';
	throw redirect(303, redirectTo);
};
