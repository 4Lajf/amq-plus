import { createClient } from '@supabase/supabase-js';
// @ts-ignore
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
// @ts-ignore
import { SUPABASE_SECRET_KEY } from '$env/static/private';

/**
 * Creates a Supabase admin client with privileged access using the service role key.
 * This client should ONLY be used on the server-side in API endpoints.
 * It bypasses Row Level Security (RLS) and has full database access.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase admin client
 */
export function createSupabaseAdmin() {
	if (!SUPABASE_SECRET_KEY) {
		throw new Error('SUPABASE_SECRET_KEY is not defined in environment variables');
	}

	return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}
