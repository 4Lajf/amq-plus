/**
 * Basket factory utilities for creating standardized basket objects
 * 
 * @module lib/server/utils/basketFactory
 */

/**
 * Create a basket object with standardized structure
 * @param {string} id - Unique basket identifier
 * @param {number} min - Minimum song count for this basket
 * @param {number} max - Maximum song count for this basket
 * @param {Function} matcher - Function that returns true if a song matches this basket
 * @returns {Object} Basket object with id, type, min, max, current, and matcher
 */
export function createBasket(id, min, max, matcher) {
  return {
    id,
    type: 'range',
    min,
    max,
    current: 0,
    matcher
  };
}

/**
 * Get basket type from basket ID
 * @param {string} basketId - Basket ID string
 * @returns {string} Basket type ('songType', 'difficulty', 'animeType', 'vintage', 'category', 'playerScore', 'animeScore', 'genre', 'tag', 'songList', 'other')
 */
export function getBasketType(basketId) {
  if (basketId.startsWith('songType-')) return 'songType';
  if (basketId.startsWith('difficulty-')) return 'difficulty';
  if (basketId.startsWith('animeType-')) return 'animeType';
  if (basketId.startsWith('vintage-')) return 'vintage';
  if (basketId.startsWith('category-')) return 'category';
  if (basketId.startsWith('playerScore-')) return 'playerScore';
  if (basketId.startsWith('animeScore-')) return 'animeScore';
  if (basketId.startsWith('genre-')) return 'genre';
  if (basketId.startsWith('tag-')) return 'tag';
  if (basketId.startsWith('songList-')) return 'songList';
  return 'other';
}

