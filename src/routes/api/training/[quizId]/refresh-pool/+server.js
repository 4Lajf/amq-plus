/**
 * POST /api/training/[quizId]/refresh-pool
 *
 * Regenerate the quiz's song pool and reconcile `training_progress.is_active`
 * against it, then say what changed.
 *
 * Until now this only happened as a side effect of starting a session, so the
 * community workaround for "my quiz changed, does training know?" was to open
 * the editor, make a meaningless edit, save, and guess. Nirom did exactly that
 * and still could not tell whether it had worked (N4). This is the same
 * reconciliation with a number on the end.
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { fetchAllPages } from '$lib/server/utils/supabasePaging.js';
import { generateQuizSongs } from '$lib/server/songFiltering.js';
import { simulateQuizFromRoutes } from '$lib/utils/simulation.js';
import { extractSongListIds } from '$lib/server/song-list-utils.js';
import { planPoolSync, applyPoolSync } from '$lib/server/training/pool-sync.js';
import { getPoolGenerationError } from '$lib/server/training/pool-generation-error.js';
import { QuizSourceError, QuizSourceLoadError } from '$lib/server/quiz-source-error.js';
import {
	buildResolvedConfigStamp,
	buildSongPoolCacheKey,
	setCachedSongPool
} from '$lib/server/training/song-pool-cache.js';

const TAG = '[REFRESH POOL]';

/**
 * @param {number} n
 * @param {string} singular
 * @returns {string}
 */
function plural(n, singular) {
	return `${n} ${singular}${n === 1 ? '' : 's'}`;
}

// @ts-ignore
export async function POST({ params, locals: { safeGetSession }, fetch: serverFetch }) {
	const { session } = await safeGetSession();
	if (!session) throw error(401, { message: 'Unauthorized' });

	const userId = session.user.id;
	const quizId = params.quizId;
	const supabaseAdmin = createSupabaseAdmin();

	const { data: quiz } = await supabaseAdmin
		.from('quiz_configurations')
		.select('id, user_id, updated_at, configuration_data')
		.eq('id', quizId)
		.single();

	if (!quiz || quiz.user_id !== userId) {
		throw error(403, { message: "You do not have permission to modify this quiz's training." });
	}

	try {
		const simulatedConfig = simulateQuizFromRoutes(quiz.configuration_data?.routes || []);
		// Same "give me everything that matches" shape session start uses; without
		// it we would reconcile against a 20-song sample and deactivate the rest.
		simulatedConfig.numberOfSongs = 10000;
		simulatedConfig.trainingMode = true;
		if (simulatedConfig.songSelection) {
			const watched = simulatedConfig.songSelection.watched || 0;
			const random = simulatedConfig.songSelection.random || 0;
			const total = watched + random;
			if (total > 0) {
				simulatedConfig.songSelection.watched = Math.round(10000 * (watched / total));
				simulatedConfig.songSelection.random = Math.round(10000 * (random / total));
			}
		}

		// Deliberately not reading the cache: "refresh" that could return a
		// cached pool is the no-op-edit-and-save problem again. We do write the
		// result back, so the next Start Training is still fast.
		console.log(`${TAG} Regenerating pool for quiz ${quizId}…`);
		const generationResult = await generateQuizSongs(simulatedConfig, serverFetch);
		const poolError = getPoolGenerationError(generationResult.metadata);
		if (poolError) return json({ success: false, message: poolError.message }, { status: poolError.status });
		const poolSongs = generationResult.songs || [];

		if (poolSongs.length === 0) {
			return json({
				success: false,
				poolSize: 0,
				activated: 0,
				deactivated: 0,
				message:
					'This quiz currently matches no songs. Nothing was changed — check the filters before training again.'
			});
		}

		const sourceListIds = extractSongListIds(quiz.configuration_data);
		let sourceLists = [];
		if (sourceListIds.length > 0) {
			const { data: lists } = await supabaseAdmin
				.from('song_lists')
				.select('id, updated_at, songs_list_link')
				.in('id', sourceListIds);
			sourceLists = lists || [];
		}
		const poolCacheKey = buildSongPoolCacheKey(quiz.id, quiz.updated_at, sourceLists, {
			trainingMode: true,
			resolvedConfig: buildResolvedConfigStamp(simulatedConfig)
		});
		setCachedSongPool(poolCacheKey, poolSongs);

		const { data: progressRecords, error: fetchError } = await fetchAllPages(() =>
			supabaseAdmin
				.from('training_progress')
				.select('*')
				.eq('user_id', userId)
				.eq('quiz_id', quiz.id)
				.order('id', { ascending: true })
		);

		if (fetchError) {
			console.error(`${TAG} Error fetching progress:`, fetchError);
			throw error(500, { message: 'Failed to fetch training progress' });
		}

		const now = new Date();
		const plan = planPoolSync(progressRecords || [], poolSongs, now);
		const { activated, deactivated } = await applyPoolSync(supabaseAdmin, plan, now, TAG);

		const parts = [];
		if (activated > 0) parts.push(`${plural(activated, 'song')} came back into rotation`);
		if (deactivated > 0) parts.push(`${plural(deactivated, 'song')} left the pool`);

		const message =
			parts.length === 0
				? `Pool refreshed: ${plural(poolSongs.length, 'song')}. Nothing changed — your training was already up to date.`
				: `Pool refreshed: ${plural(poolSongs.length, 'song')}. ${parts.join(', ')}.`;

		console.log(
			`${TAG} Done: pool=${poolSongs.length} activated=${activated} deactivated=${deactivated}`
		);

		return json({
			success: true,
			poolSize: poolSongs.length,
			activated,
			deactivated,
			trackedCount: progressRecords?.length || 0,
			message
		});
	} catch (err) {
		console.error(`${TAG} Error:`, err);
		if (err instanceof QuizSourceLoadError || err instanceof QuizSourceError) {
			return json({ success: false, message: `Nothing was changed. ${err.message}` },
				{ status: err instanceof QuizSourceLoadError ? err.status : 422 });
		}
		if (err.status) throw err;
		throw error(500, { message: 'Failed to refresh the song pool' });
	}
}
