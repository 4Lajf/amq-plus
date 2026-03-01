import { createServerClient } from '@supabase/ssr';
import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { isAdmin } from '$lib/server/auth-utils.js';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
// @ts-ignore
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';

const IMPERSONATION_COOKIE_NAME = 'amq_impersonate_user_id';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isValidUuid(value) {
	return typeof value === 'string' && UUID_REGEX.test(value);
}

const supabase = async ({ event, resolve }) => {
	/**
	 * Creates a Supabase client specific to this server request.
	 *
	 * The Supabase client gets the Auth token from the request cookies.
	 */
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			/**
			 * SvelteKit's cookies API requires `path` to be explicitly set in
			 * the cookie options. Setting `path` to `/` replicates previous/
			 * standard behavior.
			 */
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	/**
	 * Unlike `supabase.auth.getSession()`, which returns the session _without_
	 * validating the JWT, this function also calls `getUser()` to validate the
	 * JWT before returning the session.
	 */
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) {
			return { session: null, user: null };
		}

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error) {
			// JWT validation has failed
			return { session: null, user: null };
		}

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			/**
			 * Supabase libraries use the `content-range` and `x-supabase-api-version`
			 * headers, so we need to tell SvelteKit to pass it through.
			 */
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const authGuard = async ({ event, resolve }) => {
	const originalSafeGetSession = event.locals.safeGetSession;
	const { session, user } = await originalSafeGetSession();
	let effectiveSession = session;
	let effectiveUser = user;

	event.locals.realUser = user;
	event.locals.effectiveUser = user;
	event.locals.impersonation = {
		active: false,
		targetUserId: null
	};

	const impersonationTargetUserId = event.cookies.get(IMPERSONATION_COOKIE_NAME);
	const canImpersonate = !!(dev && session && user && isAdmin(user));

	if (impersonationTargetUserId && !canImpersonate) {
		event.cookies.delete(IMPERSONATION_COOKIE_NAME, { path: '/' });
	}

	if (
		canImpersonate &&
		isValidUuid(impersonationTargetUserId) &&
		impersonationTargetUserId !== user.id
	) {
		try {
			const supabaseAdmin = createSupabaseAdmin();
			const {
				data: { user: impersonatedUser },
				error
			} = await supabaseAdmin.auth.admin.getUserById(impersonationTargetUserId);

			if (!error && impersonatedUser) {
				effectiveUser = impersonatedUser;
				effectiveSession = {
					...session,
					user: impersonatedUser
				};
				event.locals.impersonation = {
					active: true,
					targetUserId: impersonationTargetUserId
				};
			} else {
				event.cookies.delete(IMPERSONATION_COOKIE_NAME, { path: '/' });
			}
		} catch (error) {
			console.error('Failed to resolve impersonation target:', error);
			event.cookies.delete(IMPERSONATION_COOKIE_NAME, { path: '/' });
		}
	} else if (
		canImpersonate &&
		impersonationTargetUserId &&
		!isValidUuid(impersonationTargetUserId)
	) {
		event.cookies.delete(IMPERSONATION_COOKIE_NAME, { path: '/' });
	}

	event.locals.safeGetSession = async () => ({
		session: effectiveSession,
		user: effectiveUser,
		realUser: user,
		effectiveUser,
		impersonation: event.locals.impersonation
	});
	event.locals.session = effectiveSession;
	event.locals.user = effectiveUser;
	event.locals.effectiveUser = effectiveUser;

	const isWriteRequest = WRITE_METHODS.has(event.request.method.toUpperCase());
	const isImpersonationControlRequest =
		event.url.pathname === '/private' && event.request.method.toUpperCase() === 'POST';

	if (event.locals.impersonation.active && isWriteRequest && !isImpersonationControlRequest) {
		return new Response(
			JSON.stringify({
				message: 'Write operations are disabled while impersonating another user'
			}),
			{
				status: 403,
				headers: {
					'content-type': 'application/json'
				}
			}
		);
	}

	// Protect routes that start with /private
	if (!event.locals.session && event.url.pathname.startsWith('/private')) {
		throw redirect(303, '/auth');
	}

	// Redirect authenticated users away from auth page
	if (event.locals.session && event.url.pathname === '/auth') {
		throw redirect(303, '/private');
	}

	return resolve(event);
};

export const handle = sequence(supabase, authGuard);
