/**
 * @fileoverview Global type definitions for SvelteKit app with Supabase auth
 * This file provides JSDoc type definitions for the application
 */

/**
 * @typedef {Object} SupabaseSession
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number} expires_at
 * @property {Object} user
 */

/**
 * @typedef {Object} SupabaseUser
 * @property {string} id
 * @property {string} email
 * @property {Object} user_metadata
 */

/**
 * @typedef {Object} SupabaseClient
 * @property {Object} auth
 * @property {Function} from
 */

/**
 * @typedef {Object} AppLocals
 * @property {SupabaseClient} supabase - Supabase client instance
 * @property {Function} safeGetSession - Function to safely get session with JWT validation
 * @property {SupabaseSession|null} session - Current user session
 * @property {SupabaseUser|null} user - Current user
 */

/**
 * @typedef {Object} PageData
 * @property {SupabaseSession|null} session - Current user session
 * @property {SupabaseClient} supabase - Supabase client instance
 * @property {SupabaseUser|null} user - Current user
 */

export { };
