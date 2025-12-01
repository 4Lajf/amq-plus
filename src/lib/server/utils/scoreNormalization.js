/**
 * Score normalization utilities for song filtering
 * Handles conversion of player scores and anime scores to standardized formats
 * 
 * @module lib/server/utils/scoreNormalization
 */

/**
 * Normalize player score (0-10 scale)
 * Converts 0 to 1, then rounds to nearest integer
 * @param {number} score - Player score (0-10)
 * @returns {number} Normalized score (1-10)
 */
export function normalizePlayerScore(score) {
  if (score === null || score === undefined) {
    return null;
  }
  if (score === 0) {
    return 1;
  }
  return Math.round(score);
}

/**
 * Normalize anime score (0-100 scale to 1-10 scale)
 * Divides by 10, converts 0 to 1, then rounds to nearest integer
 * @param {number} averageScore - Anime average score (0-100)
 * @returns {number} Normalized score (1-10), or null if undefined/null
 */
export function normalizeAnimeScore(averageScore) {
  if (averageScore === null || averageScore === undefined) {
    return null;
  }
  let score = averageScore / 10;
  if (score === 0) {
    score = 1;
  } else {
    score = Math.round(score);
  }
  return score;
}

