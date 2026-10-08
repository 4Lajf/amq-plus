export const NODE_CATEGORIES = {
	ROUTER: 'router',
	BASIC_SETTINGS: 'basicSettings',
	FILTER: 'filter',
	NUMBER_OF_SONGS: 'numberOfSongs',
	SELECTION_MODIFIER: 'selectionModifier',
	SONG_LIST: 'songList',
	NEGATIVE_SONG_LIST: 'negativeSongList',
	BATCH_USER_LIST: 'batchUserList',
	LIVE_NODE: 'liveNode',
	SOURCE_SELECTOR: 'sourceSelector'
};

/**
 * An editor node definition, as produced by `FilterRegistry.toNodeDefinitions()`.
 * @typedef {Object} NodeDefinition
 * @property {string} id - Node/filter id
 * @property {string} type - One of NODE_CATEGORIES
 * @property {string} title - Display title
 * @property {any} [icon] - Icon component
 * @property {string} [color] - Accent colour
 * @property {string} [description] - Short description
 * @property {string} [formType] - Which settings form to render
 * @property {any} [defaultValue] - Default settings for a new instance
 * @property {boolean} [deletable] - Whether the node can be removed
 * @property {boolean} [unique] - Whether only one instance is allowed per route
 */
