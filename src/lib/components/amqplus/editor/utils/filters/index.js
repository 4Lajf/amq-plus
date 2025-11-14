/**
 * Filters Index
 * Imports and registers all filter definitions
 * Import this file to ensure all filters are available in the registry
 * 
 * @module filters/index
 */

// Import all filter definitions (they auto-register on import)
import './definitions/songDifficulty.js';
import './definitions/playerScore.js';
import './definitions/animeScore.js';
import './definitions/songsAndTypes.js';
import './definitions/vintage.js';
import './definitions/animeType.js';
import './definitions/songCategories.js';
import './definitions/genres.js';
import './definitions/tags.js';

// Export the registry for convenience
export { FilterRegistry } from './FilterRegistry.js';

// Export filter utilities for external use
export * from './FilterBase.js';

// Initialize registry in nodeDefinitions and simulationUtils to avoid circular dependencies
import { FilterRegistry } from './FilterRegistry.js';
import { setFilterRegistry } from '../nodeDefinitions.js';
import { setFilterRegistryForSimulation } from '../simulationUtils.js';
setFilterRegistry(FilterRegistry);
setFilterRegistryForSimulation(FilterRegistry);

