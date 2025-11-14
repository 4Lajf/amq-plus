import { randomBytes } from 'crypto';

/**
 * Generate a shorter token for share links
 * Creates a secure, URL-safe token using cryptographically secure random bytes
 * 
 * @returns {string} Short base64url token (27 characters)
 */
export function generateShareToken() {
  return randomBytes(16).toString('base64url');
}
