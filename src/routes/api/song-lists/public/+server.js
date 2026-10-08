/**
 * Public Song Lists API endpoint
 * Fetches public song lists with search and filtering capabilities
 * No authentication required
 *
 * @module api/song-lists/public
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * GET /api/song-lists/public
 * Fetches public song lists with optional search/filter parameters
 *
 * Query parameters:
 * - search: Search across name, description, and creator
 * - name: Filter by name
 * - description: Filter by description
 * - creator: Filter by creator username
 * - dateFrom: Filter by creation date from (ISO date)
 * - dateTo: Filter by creation date to (ISO date)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10)
 *
 * @param {Object} params - Request parameters
 * @param {URL} params.url - Request URL with query parameters
 * @returns {Promise<Response>} JSON response with public lists and pagination
 */
export async function GET({ url }) {
	const supabaseAdmin = createSupabaseAdmin();

	// Parse query parameters
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const search = url.searchParams.get('search') || '';
	const name = url.searchParams.get('name') || '';
	const description = url.searchParams.get('description') || '';
	const creator = url.searchParams.get('creator') || '';
	const dateFrom = url.searchParams.get('dateFrom') || '';
	const dateTo = url.searchParams.get('dateTo') || '';

	const offset = (page - 1) * limit;

	try {
		// Build query using public_song_lists view
		let query = supabaseAdmin
			.from('public_song_lists')
			.select('id, name, description, created_at, creator_id, creator_username, song_count', {
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
			const dateToEnd = new Date(dateTo);
			dateToEnd.setDate(dateToEnd.getDate() + 1);
			query = query.lt('created_at', dateToEnd.toISOString());
		}

		// Apply sorting and pagination
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
				total: count || 0,
				totalPages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (err) {
		console.error('Error fetching public lists:', err);
		return error(500, { message: 'Failed to fetch public lists' });
	}
}
