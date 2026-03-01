/**
 * Global type definitions for JSDoc type checking.
 * This file provides type definitions that can be referenced in JSDoc comments.
 */

// SvelteKit specific types
declare module '$app/*' {
	const content: any;
	export default content;
}

declare module '$lib/*' {
	const content: any;
	export default content;
}

// Svelte 5 runes type definitions
declare global {
	/**
	 * Svelte 5 bindable rune - marks a prop as bindable
	 * @template T
	 * @param value - The initial value
	 * @returns The bindable value
	 */
	function $bindable<T>(value?: T): T;

	/**
	 * Svelte 5 state rune - creates reactive state
	 * @template T
	 * @param value - The initial state value
	 * @returns The reactive state
	 */
	function $state<T>(value: T): T;

	/**
	 * Svelte 5 derived rune - creates derived state
	 * @template T
	 * @param fn - The derivation function or direct value
	 * @returns The derived value
	 */
	function $derived<T>(fn: (() => T) | T): T;

	/**
	 * Svelte 5 effect rune - creates side effects
	 * @param fn - The effect function
	 */
	function $effect(fn: () => void | (() => void)): void;

	/**
	 * Svelte 5 props rune - accesses component props
	 * @returns The component props
	 */
	function $props(): any;

	/**
	 * Sample range configuration
	 * @typedef {Object} SampleRange
	 * @property {number} start - Sample start time in seconds
	 * @property {number} end - Sample end time in seconds
	 * @property {boolean} [randomStartPosition] - Whether to randomize start position
	 */
	interface SampleRange {
		start: number;
		end: number;
		randomStartPosition?: boolean;
	}

	/**
	 * Enriched song type with additional AMQ properties
	 * @typedef {Object} EnrichedSong
	 * @property {string} songName - Song title
	 * @property {string} songArtist - Artist name
	 * @property {string} [HQ] - High quality video filename
	 * @property {string} [MQ] - Medium quality video filename
	 * @property {string} [LQ] - Low quality video filename
	 * @property {string} [audio] - Audio filename
	 * @property {string} [anime] - Anime title
	 * @property {string} [type] - Song type (OP, ED, etc.)
	 * @property {number} [songLength] - Total song length in seconds
	 * @property {number} [sampleStart] - Sample start time in seconds
	 * @property {number} [sampleEnd] - Sample end time in seconds
	 * @property {number} [guessTime] - Guess time in seconds
	 * @property {number} [extraGuessTime] - Extra guess time in seconds
	 * @property {boolean} [guessTimeRandom] - Whether to randomize start position
	 * @property {boolean} [randomStartPosition] - Whether to randomize start position (legacy)
	 * @property {SampleRange[]} [sampleRanges] - Array of sample ranges
	 */
	interface EnrichedSong {
		songName: string;
		songArtist: string;
		HQ?: string;
		MQ?: string;
		LQ?: string;
		audio?: string;
		anime?: string;
		type?: string;
		songLength?: number;
		sampleStart?: number;
		sampleEnd?: number;
		guessTime?: number | { useRange: true; min: number; max: number };
		extraGuessTime?: number | { useRange: true; min: number; max: number };
		guessTimeRandom?: boolean;
		randomStartPosition?: boolean;
		sampleRanges?: SampleRange[];
	}
}

// Global utility types for JSDoc
declare global {
	/**
	 * Utility type for making all properties optional
	 * @template T
	 */
	type Partial<T> = {
		[P in keyof T]?: T[P];
	};

	/**
	 * Utility type for making all properties required
	 * @template T
	 */
	type Required<T> = {
		[P in keyof T]-?: T[P];
	};

	/**
	 * Utility type for picking specific properties
	 * @template T
	 * @template K
	 */
	type Pick<T, K extends keyof T> = {
		[P in K]: T[P];
	};

	/**
	 * Utility type for omitting specific properties
	 * @template T
	 * @template K
	 */
	type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

	/**
	 * Utility type for making specific properties optional
	 * @template T
	 * @template K
	 */
	type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

	/**
	 * Utility type for making specific properties required
	 * @template T
	 * @template K
	 */
	type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
}

export {};
