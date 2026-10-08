/**
 * Cleanup Expired Quizzes API endpoint
 * Triggers cleanup of expired temporary quizzes
 * 
 * @module api/cleanup/expired-quizzes
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * POST /api/cleanup/expired-quizzes
 * Cleans up expired temporary quizzes
 * 
 * Can be called:
 * - Manually by admins
 * - Via pg_cron scheduled job
 * - Via external cron service (e.g., Vercel cron)
 * 
 * @returns {Promise<Response>} JSON response with cleanup statistics
 */
// @ts-ignore
export async function POST({ request }) {
  try {
    const supabaseAdmin = createSupabaseAdmin();

    // Get authorization header for security (optional - can be used for external cron)
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If CRON_SECRET is set, validate it
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[API: Cleanup] Unauthorized cleanup attempt');
      return error(401, { message: 'Unauthorized' });
    }

    console.log('[API: Cleanup] Starting expired quizzes cleanup...');

    // Delete quizzes with explicit expires_at that have passed
    const { data: expiredData, error: expiredError } = await supabaseAdmin
      .from('quiz_configurations')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null)
      .select('id');

    if (expiredError) {
      console.error('[API: Cleanup] Error deleting expired quizzes:', expiredError);
    }

    const expiredCount = expiredData?.length || 0;
    console.log(`[API: Cleanup] Deleted ${expiredCount} quizzes with explicit expiry`);

    // Delete temporary quizzes that haven't been played in 72 hours
    const cutoffDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const { data: inactiveData, error: inactiveError } = await supabaseAdmin
      .from('quiz_configurations')
      .delete()
      .eq('is_temporary', true)
      .is('expires_at', null)
      .or(`last_played_at.lt.${cutoffDate},last_played_at.is.null`)
      .lt('created_at', cutoffDate)
      .select('id');

    if (inactiveError) {
      console.error('[API: Cleanup] Error deleting inactive temporary quizzes:', inactiveError);
    }

    const inactiveCount = inactiveData?.length || 0;
    console.log(`[API: Cleanup] Deleted ${inactiveCount} inactive temporary quizzes`);

    const totalDeleted = expiredCount + inactiveCount;
    console.log(`[API: Cleanup] Cleanup complete. Total deleted: ${totalDeleted}`);

    return json({
      success: true,
      deletedCount: totalDeleted,
      expiredCount: expiredCount,
      inactiveCount: inactiveCount,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[API: Cleanup] Error during cleanup:', err);
    return error(500, { message: 'Cleanup failed' });
  }
}

/**
 * GET /api/cleanup/expired-quizzes
 * Returns statistics about quizzes pending cleanup (without deleting)
 */
export async function GET() {
  try {
    const supabaseAdmin = createSupabaseAdmin();
    const now = new Date().toISOString();
    const cutoffDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    // Count quizzes with explicit expires_at that have passed
    const { count: expiredCount, error: expiredError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('*', { count: 'exact', head: true })
      .lt('expires_at', now)
      .not('expires_at', 'is', null);

    if (expiredError) {
      console.error('[API: Cleanup] Error counting expired quizzes:', expiredError);
    }

    // Count temporary quizzes that haven't been played in 72 hours
    const { count: inactiveCount, error: inactiveError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('*', { count: 'exact', head: true })
      .eq('is_temporary', true)
      .is('expires_at', null)
      .or(`last_played_at.lt.${cutoffDate},last_played_at.is.null`)
      .lt('created_at', cutoffDate);

    if (inactiveError) {
      console.error('[API: Cleanup] Error counting inactive quizzes:', inactiveError);
    }

    // Count total temporary quizzes
    const { count: totalTempCount, error: totalError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('*', { count: 'exact', head: true })
      .eq('is_temporary', true);

    return json({
      pendingCleanup: {
        expired: expiredCount || 0,
        inactive: inactiveCount || 0,
        total: (expiredCount || 0) + (inactiveCount || 0)
      },
      totalTemporaryQuizzes: totalTempCount || 0,
      timestamp: now
    });

  } catch (err) {
    console.error('[API: Cleanup] Error getting cleanup stats:', err);
    return error(500, { message: 'Failed to get cleanup statistics' });
  }
}
