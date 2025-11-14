import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';

/**
 * Load function - redirects to Discord OAuth automatically
 * @type {import('@sveltejs/kit').Load}
 */
// @ts-ignore
export async function load({ locals: { supabase } }) {
	const redirectTo = dev
		? 'http://localhost:5173/auth/callback'
		: 'https://amqplus.moe/auth/callback';

	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: 'discord',
		options: {
			redirectTo
		}
	});

	if (error) {
		console.error('Discord OAuth error:', error);
		throw redirect(303, '/auth/error');
	}

	if (data.url) {
		throw redirect(303, data.url);
	}
}

/**
 * Server actions for authentication
 * @type {import('@sveltejs/kit').Actions}
 */
export const actions = {
	/**
	 * Discord OAuth sign-in action
	 * @param {Object} params - Action parameters
	 * @param {Object} params.locals - SvelteKit locals object
	 * @param {Object} params.locals.supabase - Supabase client
	 */
	// @ts-ignore
	discord: async ({ locals: { supabase } }) => {
		const redirectTo = dev
			? 'http://localhost:5173/auth/callback'
			: 'https://amqplus.moe/auth/callback';

		const { data, error } = await supabase.auth.signInWithOAuth({
			provider: 'discord',
			options: {
				redirectTo
			}
		});

		if (error) {
			console.error('Discord OAuth error:', error);
			throw redirect(303, '/auth/error');
		}

		if (data.url) {
			throw redirect(303, data.url);
		}
	},

	/**
	 * Sign out action
	 * @param {Object} params - Action parameters
	 * @param {Object} params.locals - SvelteKit locals object
	 * @param {Object} params.locals.supabase - Supabase client
	 */
	// @ts-ignore
	signout: async ({ locals: { supabase } }) => {
		const { error } = await supabase.auth.signOut();
		if (error) {
			console.error('Sign out error:', error);
		}
		throw redirect(303, '/');
	}
	// @ts-ignore
};
