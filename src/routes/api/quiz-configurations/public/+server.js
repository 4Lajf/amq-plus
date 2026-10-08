/**
 * Public Quiz Configurations API endpoint.
 * Handles fetching public quiz configurations with filtering and pagination.
 * No authentication required.
 *
 * @module api/quiz-configurations/public
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * GET /api/quiz-configurations/public
 * Fetches public quiz configurations with optional filtering and pagination.
 * No authentication required.
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 50)
 * - search: Search across name, description, and creator
 * - name: Filter by name
 * - description: Filter by description
 * - creator: Filter by creator username
 * - dateFrom: Filter by creation date (from)
 * - dateTo: Filter by creation date (to)
 *
 * @param {Object} params - SvelteKit request parameters
 * @param {URL} params.url - Request URL with query parameters
 * @returns {Promise<Response>} JSON response with quiz configurations and pagination info
 */
export async function GET({ url }) {
	try {
		const supabaseAdmin = createSupabaseAdmin();

		// Parse query parameters
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
		const search = url.searchParams.get('search') || '';
		const name = url.searchParams.get('name') || '';
		const description = url.searchParams.get('description') || '';
		const creator = url.searchParams.get('creator') || '';
		const dateFrom = url.searchParams.get('dateFrom') || '';
		const dateTo = url.searchParams.get('dateTo') || '';

		const offset = (page - 1) * limit;

		// Build query - use public_quiz_configurations view
		let query = supabaseAdmin
			.from('public_quiz_configurations')
			.select('id, name, description, created_at, updated_at, creator_username, creator_id', {
				count: 'exact'
			});

		// Apply filters
		if (search) {
			query = query.or(
				`name.ilike.%${search}%,description.ilike.%${search}%,creator_username.ilike.%${search}%`
			);
		}

		if (name) {
			query = query.ilike('name', `%${name}%`);
		}

		if (description) {
			query = query.ilike('description', `%${description}%`);
		}

		if (creator) {
			query = query.ilike('creator_username', `%${creator}%`);
		}

		if (dateFrom) {
			query = query.gte('created_at', dateFrom);
		}

		if (dateTo) {
			// Add one day to include the entire end date
			const endDate = new Date(dateTo);
			endDate.setDate(endDate.getDate() + 1);
			query = query.lt('created_at', endDate.toISOString());
		}

		// Apply pagination and ordering
		query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

		const { data, error: dbError, count } = await query;

		if (dbError) {
			console.error('Database error:', dbError);
			return error(500, { message: dbError.message });
		}

		return json({
			data: data || [],
			pagination: {
				page,
				limit,
				totalItems: count || 0,
				totalPages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (err) {
		console.error('Error fetching public quiz configurations:', err);
		return error(500, { message: 'Failed to fetch public quiz configurations' });
	}
}
