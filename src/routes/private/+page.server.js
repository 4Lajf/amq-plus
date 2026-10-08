import { dev } from '$app/environment';
import { error, fail } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { isAdmin } from '$lib/server/auth-utils.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';

const IMPERSONATION_COOKIE_NAME = 'amq_impersonate_user_id';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
	return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Load user dashboard data including quiz statistics
 */
// @ts-ignore
export const load = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();
	const realUser = locals.realUser ?? user;
	const impersonation = locals.impersonation ?? { active: false, targetUserId: null };

	if (!session || !user) {
		throw error(401, { message: 'You must be logged in to access the dashboard' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Fetch user's quizzes
		const { data: quizzes, error: quizzesError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('id, name')
			.eq('user_id', user.id);

		if (quizzesError) {
			console.error('Error fetching user quizzes:', quizzesError);
			// Don't throw, just return empty stats
		}

		const quizIds = (quizzes || []).map((q) => q.id);
		let totalPlays = 0;
		let totalLikes = 0;
		let dueTraining = null;

		// Fetch stats for user's quizzes
		if (quizIds.length > 0) {
			const { data: stats, error: statsError } = await supabaseAdmin
				.from('quiz_stats')
				.select('likes, plays')
				.in('quiz_id', quizIds);

			if (!statsError && stats) {
				totalPlays = stats.reduce((sum, stat) => sum + (stat.plays || 0), 0);
				totalLikes = stats.reduce((sum, stat) => sum + (stat.likes || 0), 0);
			}
		}

		const [{ count: songListCount }, progressResult] = await Promise.all([
			supabaseAdmin
				.from('song_lists')
				.select('id', { count: 'exact', head: true })
				.eq('user_id', user.id),
			fetchAllPages(() =>
				supabaseAdmin
					.from('training_progress')
					.select('quiz_id, fsrs_state, suspended_at, is_active')
					.eq('user_id', user.id)
					.order('id', { ascending: true })
			)
		]);

		if (!progressResult.error) {
			const dueCounts = new Map();
			const now = Date.now();
			for (const row of progressResult.data || []) {
				if (row.suspended_at || row.is_active === false) continue;
				const due = row.fsrs_state?.due ? new Date(row.fsrs_state.due).getTime() : null;
				if (due !== null && due <= now) {
					dueCounts.set(row.quiz_id, (dueCounts.get(row.quiz_id) || 0) + 1);
				}
			}
			const [quizId, count] = [...dueCounts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
			if (quizId) {
				const ownedQuiz = (quizzes || []).find((quiz) => quiz.id === quizId);
				let quizName = ownedQuiz?.name;
				if (!quizName) {
					const { data: sharedQuiz } = await supabaseAdmin
						.from('quiz_configurations')
						.select('name')
						.eq('id', quizId)
						.maybeSingle();
					quizName = sharedQuiz?.name;
				}
				dueTraining = { quizId, quizName: quizName || 'Training quiz', count };
			}
		}

		return {
			user,
			realUser,
			impersonation,
			isAdminUser: dev && isAdmin(realUser),
			stats: {
				quizCount: quizIds.length,
				songListCount: songListCount || 0,
				totalPlays,
				totalLikes
			},
			dueTraining
		};
	} catch (err) {
		console.error('Error loading dashboard data:', err);
		// Return default stats on error
		return {
			user,
			realUser,
			impersonation,
			isAdminUser: dev && isAdmin(realUser),
			stats: {
				quizCount: 0,
				songListCount: 0,
				totalPlays: 0,
				totalLikes: 0
			},
			dueTraining: null
		};
	}
};

/**
 * Server actions for admin impersonation controls.
 * @type {import('@sveltejs/kit').Actions}
 */
export const actions = {
	// @ts-ignore
	startImpersonation: async ({ request, locals, cookies }) => {
		const { session } = await locals.safeGetSession();
		const realUser = locals.realUser;

		if (!dev || !session || !realUser || !isAdmin(realUser)) {
			throw error(403, { message: 'Only admin can impersonate users' });
		}

		const formData = await request.formData();
		const targetUuid = String(formData.get('targetUuid') || '').trim();

		if (!isValidUuid(targetUuid)) {
			return fail(400, { impersonationError: 'Please provide a valid UUID to impersonate.' });
		}

		if (targetUuid === realUser.id) {
			return fail(400, { impersonationError: 'You are already logged in as this user.' });
		}

		try {
			const supabaseAdmin = createSupabaseAdmin();
			const {
				data: { user: targetUser },
				error: lookupError
			} = await supabaseAdmin.auth.admin.getUserById(targetUuid);

			if (lookupError || !targetUser) {
				return fail(404, { impersonationError: 'No user found for this UUID.' });
			}

			cookies.set(IMPERSONATION_COOKIE_NAME, targetUuid, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: !dev,
				maxAge: 60 * 60 * 12
			});

			return {
				impersonationMessage: `Impersonation enabled for ${targetUuid}. View-only mode is active.`
			};
		} catch (actionError) {
			console.error('Failed to start impersonation:', actionError);
			return fail(500, { impersonationError: 'Failed to start impersonation.' });
		}
	},

	// @ts-ignore
	stopImpersonation: async ({ locals, cookies }) => {
		const { session } = await locals.safeGetSession();
		const realUser = locals.realUser;

		if (!dev || !session || !realUser || !isAdmin(realUser)) {
			throw error(403, { message: 'Only admin can stop impersonation mode' });
		}

		cookies.delete(IMPERSONATION_COOKIE_NAME, { path: '/' });
		return { impersonationMessage: 'Impersonation disabled. You are back on your admin account.' };
	}
};
