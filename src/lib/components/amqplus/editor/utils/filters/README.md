# Filter System Architecture

This directory contains the new registry-based filter system for AMQ Plus. The architecture dramatically simplifies filter management by centralizing logic and eliminating code duplication.

## 📁 Directory Structure

```
filters/
├── README.md                          # This file
├── FilterRegistry.js                  # Central registry for all filters
├── FilterBase.js                      # Base utilities & helper functions
├── index.js                          # Auto-registers all filters
└── definitions/                       # Individual filter definitions
    ├── songDifficulty.js
    ├── playerScore.js
    ├── animeScore.js
    ├── songsAndTypes.js
    ├── vintage.js
    ├── animeType.js
    ├── songCategories.js
    ├── genres.js
    └── tags.js
```

## 🏗️ Core Concepts

### FilterRegistry

The `FilterRegistry` is a singleton that stores all filter metadata and functions:

- `register(id, definition)` - Register a new filter
- `get(id)` - Get a filter definition
- `getAll()` - Get all filters
- `getAllByCategory(category)` - Get filters by category
- `validate(id, value, context)` - Run validation
- `getDisplayString(id, value, context)` - Get display string
- `extract(id, value, context)` - Extract settings for export
- `resolve(id, node, context, rng)` - Resolve to static values

### Filter Definition Structure

Each filter is a self-contained module with this structure:

```javascript
export const myFilter = {
	id: 'my-filter',                    // Unique identifier
	metadata: {
		title: 'My Filter',             // Display name
		icon: '🎯',                     // Emoji icon
		color: '#3b82f6',               // Hex color
		description: 'Description',     // Help text
		category: 'content',            // Grouping category
		type: NODE_CATEGORIES.FILTER    // Node type
	},
	defaultSettings: { ... },           // Default configuration
	formType: 'complex-my-filter',      // Dialog component type
	validate: (value, context) => { ... },   // Validation function
	display: (value, context) => { ... },    // Display string function
	extract: (value, context) => { ... },    // Export extraction
	resolve: (node, context, rng) => { ... } // Resolution to static values
};

FilterRegistry.register(myFilter.id, myFilter);
```
