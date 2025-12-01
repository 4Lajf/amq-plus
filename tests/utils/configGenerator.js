/**
 * Configuration generator for test cases
 */

/**
 * Create a base configuration
 * @param {number} numberOfSongs - Number of songs to generate
 * @returns {Object} Base configuration
 */
export function createBaseConfig(numberOfSongs = 20) {
  return {
    timestamp: new Date().toISOString(),
    seed: `test-${Date.now()}`,
    router: null,
    basicSettings: {
      guessTime: 20,
      extraGuessTime: 0,
      samplePoint: {
        kind: 'range',
        min: 0,
        max: 100
      },
      playbackSpeed: 1
    },
    numberOfSongs: numberOfSongs,
    filters: [],
    songLists: [
      {
        nodeId: 'song-list-1',
        nodeType: 'song-list',
        mode: 'masterlist',
        useEntirePool: false
      }
    ]
  };
}

/**
 * Add songs-and-types filter
 * @param {Object} config - Configuration to modify
 * @param {Object} options - Filter options
 * @returns {Object} Modified configuration
 */
export function addSongsAndTypesFilter(config, options = {}) {
  const {
    mode = 'percentage',
    openings = 50,
    endings = 30,
    inserts = 20,
    useRanges = false
  } = options;

  const filter = {
    definitionId: 'songs-and-types',
    instanceId: 'songs-types-test',
    settings: {
      mode,
      total: config.numberOfSongs,
      types: {
        openings,
        endings,
        inserts
      }
    }
  };

  if (useRanges) {
    filter.settings.typesRanges = {
      openings: {
        min: Math.max(0, openings - 10),
        max: Math.min(100, openings + 10)
      },
      endings: {
        min: Math.max(0, endings - 10),
        max: Math.min(100, endings + 10)
      },
      inserts: {
        min: Math.max(0, inserts - 10),
        max: Math.min(100, inserts + 10)
      }
    };
  }

  config.filters.push(filter);
  return config;
}

/**
 * Add vintage filter
 * @param {Object} config - Configuration to modify
 * @param {Array} ranges - Array of vintage ranges
 * @returns {Object} Modified configuration
 */
export function addVintageFilter(config, ranges = []) {
  const filter = {
    definitionId: 'vintage',
    instanceId: 'vintage-test',
    settings: {
      mode: 'advanced',
      total: config.numberOfSongs,
      ranges: ranges
    }
  };

  config.filters.push(filter);
  return config;
}

/**
 * Add song difficulty filter
 * @param {Object} config - Configuration to modify
 * @param {Object} options - Filter options
 * @returns {Object} Modified configuration
 */
export function addDifficultyFilter(config, options = {}) {
  const {
    viewMode = 'basic',
    easy = 30,
    medium = 40,
    hard = 30,
    ranges = []
  } = options;

  const filter = {
    definitionId: 'song-difficulty',
    instanceId: 'difficulty-test',
    settings: {
      mode: 'advanced',
      viewMode,
      total: config.numberOfSongs
    }
  };

  if (viewMode === 'basic') {
    filter.settings.difficulties = { easy, medium, hard };
  } else {
    filter.settings.ranges = ranges;
  }

  config.filters.push(filter);
  return config;
}

/**
 * Add player score filter
 * @param {Object} config - Configuration to modify
 * @param {Object} options - Filter options
 * @returns {Object} Modified configuration
 */
export function addPlayerScoreFilter(config, options = {}) {
  const {
    min = 1,
    max = 10,
    disabled = [],
    counts = null,
    percentages = null
  } = options;

  const filter = {
    definitionId: 'player-score',
    instanceId: 'player-score-test',
    settings: {
      mode: 'range',
      min,
      max,
      disabled
    }
  };

  if (counts) {
    filter.settings.counts = counts;
  }

  if (percentages) {
    filter.settings.percentages = percentages;
  }

  config.filters.push(filter);
  return config;
}

/**
 * Add anime score filter
 * @param {Object} config - Configuration to modify
 * @param {Object} options - Filter options
 * @returns {Object} Modified configuration
 */
export function addAnimeScoreFilter(config, options = {}) {
  const {
    min = 2,
    max = 10,
    disabled = [],
    counts = null
  } = options;

  const filter = {
    definitionId: 'anime-score',
    instanceId: 'anime-score-test',
    settings: {
      mode: 'range',
      min,
      max,
      disabled
    }
  };

  if (counts) {
    filter.settings.counts = counts;
  }

  config.filters.push(filter);
  return config;
}

/**
 * Add anime type filter
 * @param {Object} config - Configuration to modify
 * @param {Object} options - Filter options
 * @returns {Object} Modified configuration
 */
export function addAnimeTypeFilter(config, options = {}) {
  const {
    mode = 'basic',
    enabled = ['tv', 'movie', 'ova'],
    types = null,
    typesRanges = null
  } = options;

  const filter = {
    definitionId: 'anime-type',
    instanceId: 'anime-type-test',
    settings: {
      mode
    }
  };

  if (mode === 'basic') {
    filter.settings.enabled = enabled;
  } else {
    filter.settings.total = config.numberOfSongs;
    filter.settings.types = types || { tv: 60, movie: 30, ova: 10 };
    if (typesRanges) {
      filter.settings.typesRanges = typesRanges;
    }
  }

  config.filters.push(filter);
  return config;
}

/**
 * Add song categories filter
 * @param {Object} config - Configuration to modify
 * @param {Object} options - Filter options
 * @returns {Object} Modified configuration
 */
export function addSongCategoriesFilter(config, options = {}) {
  const {
    mode = 'basic',
    enabled = null,
    categories = null,
    categoriesRanges = null
  } = options;

  const filter = {
    definitionId: 'song-categories',
    instanceId: 'song-categories-test',
    settings: {
      mode
    }
  };

  if (mode === 'basic') {
    filter.settings.enabled = enabled || {
      openings: { standard: true, chanting: true, character: true },
      endings: { standard: true, chanting: true, character: true },
      inserts: { standard: true, chanting: true, character: true }
    };
  } else {
    filter.settings.total = config.numberOfSongs;
    filter.settings.categories = categories || {
      openings: { standard: 5, chanting: 3, character: 2 },
      endings: { standard: 3, chanting: 2, character: 2 },
      inserts: { standard: 2, chanting: 1, character: 1 }
    };
    if (categoriesRanges) {
      filter.settings.categoriesRanges = categoriesRanges;
    }
  }

  config.filters.push(filter);
  return config;
}

/**
 * Add genres filter
 * @param {Object} config - Configuration to modify
 * @param {Object} options - Filter options
 * @returns {Object} Modified configuration
 */
export function addGenresFilter(config, options = {}) {
  const {
    mode = 'basic',
    included = [],
    excluded = [],
    optional = [],
    items = null,
    showRates = false
  } = options;

  const filter = {
    definitionId: 'genres',
    instanceId: 'genres-test',
    settings: {
      mode,
      included,
      excluded,
      optional,
      showRates
    }
  };

  if (items) {
    filter.settings.items = items;
  }

  config.filters.push(filter);
  return config;
}

/**
 * Add tags filter
 * @param {Object} config - Configuration to modify
 * @param {Object} options - Filter options
 * @returns {Object} Modified configuration
 */
export function addTagsFilter(config, options = {}) {
  const {
    mode = 'basic',
    included = [],
    excluded = [],
    optional = [],
    items = null,
    showRates = false
  } = options;

  const filter = {
    definitionId: 'tags',
    instanceId: 'tags-test',
    settings: {
      mode,
      included,
      excluded,
      optional,
      showRates
    }
  };

  if (items) {
    filter.settings.items = items;
  }

  config.filters.push(filter);
  return config;
}

/**
 * Set song list to user list
 * @param {Object} config - Configuration to modify
 * @param {Object} options - User list options
 * @returns {Object} Modified configuration
 */
export function setUserList(config, options = {}) {
  const {
    platform = 'anilist',
    username = '4Lajf',
    selectedLists = { completed: true }
  } = options;

  config.songLists = [
    {
      nodeId: 'song-list-1',
      nodeType: 'song-list',
      mode: 'user-lists',
      useEntirePool: false,
      userListImport: {
        platform,
        username,
        selectedLists
      }
    }
  ];

  return config;
}

