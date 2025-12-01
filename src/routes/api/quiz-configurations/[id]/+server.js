/**
 * Quiz Configuration by ID API endpoint.
 * Handles individual quiz configuration operations (delete, update settings).
 *
 * @module api/quiz-configurations/[id]
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';
import { isAdmin, checkAdminOrOwner } from '$lib/server/auth-utils.js';

/**
 * DELETE /api/quiz-configurations/[id]
 * Deletes a specific quiz configuration.
 * Requires authentication - only the owner can delete their quiz.
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.id - Quiz configuration ID
 * @param {Object} params.locals - SvelteKit locals object
 * @returns {Promise<Response>} Success response
 */
export async function DELETE({ params, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'You must be logged in to delete quizzes' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Check if user is admin first
		const userIsAdmin = isAdmin(user);

		// If not admin, check ownership
		if (!userIsAdmin) {
			const { data: quizData } = await supabaseAdmin
				.from('quiz_configurations')
				.select('user_id')
				.eq('id', params.id)
				.single();

			if (!quizData) {
				return error(404, { message: 'Quiz not found' });
			}

			if (quizData.user_id !== user.id) {
				return error(403, { message: 'You do not have permission to delete this quiz' });
			}
		}

		// Admin users can delete any quiz, regular users only their own (already verified above)
		const { error: dbError } = await supabaseAdmin
			.from('quiz_configurations')
			.delete()
			.eq('id', params.id);

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting quiz configuration:', err);
		// If it's already an HttpError, throw it
		if (err.status && err.body) {
			throw err;
		}
		return error(500, { message: 'Failed to delete quiz configuration' });
	}
}

/**
 * PATCH /api/quiz-configurations/[id]
 * Updates quiz configuration settings (name, description, visibility).
 * Does not update the configuration_data itself.
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.id - Quiz configuration ID
 * @param {Request} params.request - Incoming request
 * @param {Object} params.locals - SvelteKit locals object
 * @returns {Promise<Response>} Updated quiz configuration
 */
export async function PATCH({ params, request, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'Unauthorized' });
	}

	try {
		const body = await request.json();
		const { name, description, is_public, allow_remixing } = body;

		// Validate at least one field is provided
		if (name === undefined && description === undefined && is_public === undefined && allow_remixing === undefined) {
			return error(400, { message: 'No fields to update' });
		}

		const supabaseAdmin = createSupabaseAdmin();

		// Build update object dynamically
		const updateData = {};
		if (name !== undefined) updateData.name = name;
		if (description !== undefined) updateData.description = description;
		if (is_public !== undefined) {
			updateData.is_public = is_public;
			// Clear share_token when quiz becomes public
			if (is_public === true) {
				updateData.share_token = null;
			}
		}
		if (allow_remixing !== undefined) updateData.allow_remixing = allow_remixing;
		updateData.updated_at = new Date().toISOString();

		// Admin users can update any quiz, regular users only their own
		let updateQuery = supabaseAdmin
			.from('quiz_configurations')
			.update(updateData)
			.eq('id', params.id);

		// Check permissions first
		const { data: quizData } = await supabaseAdmin
			.from('quiz_configurations')
			.select('user_id')
			.eq('id', params.id)
			.single();

		if (quizData && !checkAdminOrOwner(user, quizData.user_id)) {
			return error(403, { message: 'You do not have permission to update this quiz' });
		}

		const { data, error: dbError } = await updateQuery
			.select()
			.single();

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({ data, success: true });
	} catch (err) {
		console.error('Error updating quiz configuration:', err);
		// If it's already an HttpError, throw it
		if (err.status && err.body) {
			throw err;
		}
		return error(500, { message: 'Failed to update quiz configuration' });
	}
}

/**
 * POST /api/quiz-configurations/[id]/clone
 * Clones an existing quiz configuration into a new quiz for the authenticated user.
 * The cloned quiz will have a new name (original name + " (Copy)") and will be private.
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.id - Quiz configuration ID to clone from
 * @param {Request} params.request - Incoming request
 * @param {Object} params.locals - SvelteKit locals object
 * @returns {Promise<Response>} Cloned quiz configuration data
 */
export async function POST({ params, request, locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session || !user) {
		return error(401, { message: 'You must be logged in to clone quizzes' });
	}

	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Fetch the original quiz configuration
		const { data: originalQuiz, error: fetchError } = await supabaseAdmin
			.from('quiz_configurations')
			.select('name, description, is_public, allow_remixing, configuration_data, creator_username')
			.eq('id', params.id)
			.single();

		if (fetchError) {
			console.error('Database error:', fetchError);
			return error(404, { message: 'Quiz configuration not found' });
		}

		// Check if the user has permission to clone this quiz
		// Must be public with allow_remixing enabled, or owner
		if (!originalQuiz.is_public) {
			// For private quizzes, only the owner can clone
			const { data: ownerCheck, error: ownerCheckError } = await supabaseAdmin
				.from('quiz_configurations')
				.select('user_id')
				.eq('id', params.id)
				.single();

			if (ownerCheckError || ownerCheck.user_id !== user.id) {
				return error(403, { message: 'You do not have permission to clone this quiz' });
			}
		} else if (!originalQuiz.allow_remixing) {
			// For public quizzes, allow_remixing must be enabled to clone
			return error(403, { message: 'This quiz does not allow remixing' });
		}

		// Create the cloned quiz
		const clonedName = `${originalQuiz.name} (Copy)`;
		const { data: clonedQuiz, error: createError } = await supabaseAdmin
			.from('quiz_configurations')
			.insert({
				user_id: user.id,
				name: clonedName,
				description: originalQuiz.description,
				is_public: false, // Cloned quizzes are always private
				configuration_data: originalQuiz.configuration_data,
				creator_username:
					user.user_metadata?.username || originalQuiz.creator_username || 'Unknown',
				created_at: new Date().toISOString()
			})
			.select()
			.single();

		if (createError) {
			console.error('Database error:', createError);
			return error(500, { message: createError.message });
		}

		return json({ data: clonedQuiz, success: true });
	} catch (err) {
		console.error('Error cloning quiz configuration:', err);
		// If it's already an HttpError, throw it
		if (err.status && err.body) {
			throw err;
		}
		return error(500, { message: 'Failed to clone quiz configuration' });
	}
}
