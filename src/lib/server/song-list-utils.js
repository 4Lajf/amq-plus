/**
 * Song list utility functions for validation and access control.
 * 
 * @module lib/server/song-list-utils
 */

import { createSupabaseAdmin } from './supabase-admin.js';

/**
 * Validates if a user has permission to access a song list.
 * Used at quiz creation/update time to ensure users can only reference
 * song lists they have access to.
 * 
 * @param {string} listId - The song list ID to validate
 * @param {string} quizCreatorUserId - The user ID of the quiz creator
 * @param {boolean} isAdminUser - Whether the user is an admin
 * @returns {Promise<{authorized: boolean, listName: string, reason: string}>}
 */
export async function validateSongListAccess(listId, quizCreatorUserId, isAdminUser) {
  const supabaseAdmin = createSupabaseAdmin();

  try {
    // Fetch the song list
    const { data: list, error: dbError } = await supabaseAdmin
      .from('song_lists')
      .select('id, name, is_public, user_id')
      .eq('id', listId)
      .single();

    if (dbError || !list) {
      return {
        authorized: false,
        listName: 'Unknown',
        reason: `Song list with ID "${listId}" not found`
      };
    }

    // Admin users can access any list
    if (isAdminUser) {
      return {
        authorized: true,
        listName: list.name,
        reason: 'Admin access'
      };
    }

    // Public lists are accessible to everyone
    if (list.is_public) {
      return {
        authorized: true,
        listName: list.name,
        reason: 'Public list'
      };
    }

    // Private lists are only accessible to their owner
    if (list.user_id === quizCreatorUserId) {
      return {
        authorized: true,
        listName: list.name,
        reason: 'Owner access'
      };
    }

    // Access denied
    return {
      authorized: false,
      listName: list.name,
      reason: `Private list owned by another user`
    };
  } catch (error) {
    console.error('[validateSongListAccess] Error:', error);
    return {
      authorized: false,
      listName: 'Unknown',
      reason: `Error validating access: ${error.message}`
    };
  }
}

/**
 * Extracts all song list IDs referenced in a quiz configuration.
 * Looks for nodes with mode 'saved-lists' and extracts their selectedListId.
 * 
 * @param {Object} configurationData - The quiz configuration data
 * @param {Array} configurationData.nodes - Array of node objects
 * @returns {string[]} Array of unique song list IDs
 */
export function extractSongListIds(configurationData) {
  if (!configurationData || !Array.isArray(configurationData.nodes)) {
    return [];
  }

  const listIds = [];

  for (const node of configurationData.nodes) {
    // Check if this is a song list node
    if (node.data && node.data.currentValue) {
      const value = node.data.currentValue;

      // Check for saved-lists mode
      if (value.mode === 'saved-lists' && value.selectedListId) {
        listIds.push(value.selectedListId);
      }
    }
  }

  // Return unique IDs
  return [...new Set(listIds)];
}

