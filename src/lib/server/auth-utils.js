/**
 * Authentication and authorization utilities for server-side operations.
 * Provides admin role checking and permission validation.
 * 
 * @module lib/server/auth-utils
 */

/**
 * @typedef {Object} SupabaseUser
 * @property {string} id - The user's UUID
 */

/**
 * List of user IDs with admin privileges.
 * These users have full access to all resources regardless of ownership.
 * 
 * @constant {string[]}
 */
export const ADMIN_USER_IDS = [
  '25b56784-dd1a-4d95-9455-e12fc710cfdf'
];

/**
 * Check if a user has admin privileges.
 * 
 * @param {SupabaseUser|null} user - The user object from Supabase auth
 * @returns {boolean} True if the user is an admin, false otherwise
 */
export function isAdmin(user) {
  if (!user || !user.id) {
    return false;
  }
  return ADMIN_USER_IDS.includes(user.id);
}

/**
 * Check if a user is either an admin or the owner of a resource.
 * 
 * @param {SupabaseUser|null} user - The user object from Supabase auth
 * @param {string} resourceUserId - The UUID of the resource owner
 * @returns {boolean} True if the user is admin or owns the resource
 */
export function checkAdminOrOwner(user, resourceUserId) {
  if (!user || !user.id) {
    return false;
  }

  // Check if user is admin
  if (isAdmin(user)) {
    return true;
  }

  // Check if user owns the resource
  return user.id === resourceUserId;
}

