// Fallback function for flattenColorPalette
function flattenColorPalette(colors) {
	const result = {};

	function flatten(obj, prefix = '') {
		for (const [key, value] of Object.entries(obj)) {
			const newKey = prefix ? `${prefix}-${key}` : key;

			if (typeof value === 'string') {
				result[newKey] = value;
			} else if (typeof value === 'object' && value !== null) {
				flatten(value, newKey);
			}
		}
	}

	flatten(colors);
	return result;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [],
	theme: {
		extend: {
			colors: {
				// AMQ PLUS color scheme based on #DF6975
				amq: {
					primary: '#DF6975', // Main brand color
					secondary: '#E8899A', // Lighter variant
					accent: '#75B9DF', // Complementary blue
					light: '#F5E6E8', // Very light pink
					dark: '#B54A5A', // Darker variant
					neutral: '#8B7B7A', // Neutral brown-gray
					success: '#75DF8B', // Success green
					warning: '#DFB975' // Warning orange
				}
			},

			animation: {
				'border-beam': 'border-beam calc(var(--duration)*1s) infinite linear'
			},
			keyframes: {
				'border-beam': {
					'100%': {
						'offset-distance': '100%'
					}
				}
			}
		}
	},
	plugins: [addVariablesForColors]
};

// This plugin adds each Tailwind color as a global CSS variable, e.g. var(--gray-200).
function addVariablesForColors({ addBase, theme }) {
	let allColors = flattenColorPalette(theme('colors'));
	let newVars = Object.fromEntries(
		Object.entries(allColors).map(([key, val]) => [`--${key}`, val])
	);

	addBase({
		':root': newVars
	});
}
