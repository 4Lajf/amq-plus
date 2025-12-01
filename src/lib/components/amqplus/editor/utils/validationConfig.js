export const VALIDATION_BOUNDS = {
	// Player settings
	players: {
		min: 1,
		max: 100
	},
	teamSize: {
		min: 1,
		max: 8
	},

	// Time settings (seconds)
	guessTime: {
		min: 1,
		max: 60
	},
	extraGuessTime: {
		min: 0,
		max: 15
	},

	// Audio settings
	samplePoint: {
		min: 0,
		max: 100
	},
	playbackSpeed: {
		options: [1, 1.5, 2, 4]
	},

	// Score settings
	playerScore: {
		min: 1,
		max: 10
	},
	animeScore: {
		min: 2,
		max: 10
	},

	// Percentage bounds (0-100%)
	percentage: {
		min: 0,
		max: 100
	},

	// Execution chance
	executionChance: {
		min: 0,
		max: 100
	},

	// Song counts and ranges
	songCount: {
		min: 1,
		max: 200
	},

	// Selection modifier
	selectionModifier: {
		min: 1,
		max: 999
	},

	// Song difficulty settings
	songDifficulty: {
		percentage: {
			min: 0,
			max: 100
		},
		count: {
			min: 0,
			max: 200
		},
		randomRange: {
			percentageMin: 0,
			percentageMax: 100,
			countMin: 0,
			countMax: 200
		},
		difficultyRange: {
			min: 0,
			max: 100
		}
	},

	// Common validation tolerances
	tolerance: {
		percentage: 0.01,
		count: 0
	},

	// Common validation totals
	totals: {
		percentage: 100
	}
};

export const VALID_OPTIONS = {
	scoring: ['count', 'hint', 'speed'],
	answering: ['typing', 'mix', 'multiple-choice'],
	mode: ['percentage', 'count'],
	viewMode: ['basic', 'advanced', 'simple'],
	animeTypes: ['tv', 'movie', 'ova', 'ona', 'special'],
	songCategories: ['standard', 'instrumental', 'chanting', 'character'],
	songTypes: ['openings', 'endings', 'inserts']
};

export function isValidRange(min, max, bounds) {
	return (
		Number.isFinite(min) &&
		Number.isFinite(max) &&
		min >= bounds.min &&
		max <= bounds.max &&
		min <= max
	);
}

export function isValidValue(value, bounds) {
	return Number.isFinite(value) && value >= bounds.min && value <= bounds.max;
}

export function clampValue(value, bounds, defaultValue = null) {
	const numValue = Number(value);
	const clamped = Math.max(bounds.min, Math.min(bounds.max, numValue));
	return isNaN(numValue) && defaultValue !== null ? defaultValue : clamped;
}

export function clampRange(range, bounds) {
	const min = clampValue(range.min, bounds);
	const max = clampValue(range.max, bounds);
	return {
		min: min,
		max: Math.max(min, max) // Ensure max >= min
	};
}

export const ERROR_MESSAGES = {
	outOfRange: (field, min, max) => `${field} must be between ${min} and ${max}`,
	invalidRange: (field, min, max) => `${field} range must be within ${min}-${max} and min ≤ max`,
};



