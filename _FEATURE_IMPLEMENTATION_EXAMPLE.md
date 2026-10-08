# Adding a New Filter to AMQ Plus

Walkthrough for a fictional **Song Length** filter (duration in seconds). For a real, simpler range filter already in the tree, copy `anime-title-length` or `franchise-size`.

## Architecture

The quiz editor (`editor2`) stores quizzes as **routes**. Each route has basic settings, sources, and an ordered list of **filters**.

There are two registries:

| Registry | Location | Role |
|----------|----------|------|
| Client `FilterRegistry` | `src/lib/filters/FilterRegistry.js` | Editor + simulation: validate, display summary, resolve settings |
| Server `FILTER_REGISTRY` | `src/lib/server/songFiltering.js` | Real filtering: `applyGlobalFilter` (and optional `buildBaskets`) |

`Editor2.svelte` imports `$lib/filters/index.js`, which loads every definition so each one auto-registers. The palette and filter lines read from `FilterRegistry` only — they do **not** use `settingsConfig.js` / `NodeEditDialog.svelte` (legacy).

## Checklist (six touch points)

1. Defaults — `src/lib/utils/defaultNodeSettings.js`
2. Client definition — `src/lib/filters/definitions/<name>.js` (calls `FilterRegistry.register`)
3. Import — `src/lib/filters/index.js`
4. UI — `src/lib/components/amqplus/dialog/complex/<Name>.svelte`
5. Wire UI — branch in `ComplexFormFields.svelte` (`config.type` === definition `formType`)
6. Server — entry on `FILTER_REGISTRY` in `songFiltering.js` (key === definition `id`)

---

## Example: Song Length

### 1. Default settings

**File:** `src/lib/utils/defaultNodeSettings.js`

```javascript
/** @type {Object} */
export const SONG_LENGTH_DEFAULT_SETTINGS = {
	minLength: 30,
	maxLength: 150
};

// Inside DEFAULT_NODE_SETTINGS:
export const DEFAULT_NODE_SETTINGS = {
	// ...existing entries...
	'song-length': SONG_LENGTH_DEFAULT_SETTINGS
};
```

### 2. Client definition

**File:** `src/lib/filters/definitions/songLength.js`

`ValidationResult.isValid` is a **method** — call `rangeResult.isValid()`, do not read it as a property.

```javascript
import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '$lib/utils/nodeCategories.js';
import { ValidationResult } from '$lib/utils/validationFramework.js';
import { validateRange } from '$lib/utils/commonValidators.js';
import { SONG_LENGTH_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';

function validateSongLength(value) {
	const result = new ValidationResult();
	const v = value || {};
	const min = Number(v.minLength ?? 0);
	const max = Number(v.maxLength ?? 300);

	const rangeResult = validateRange(min, max, {
		minBound: 0,
		maxBound: 300,
		fieldName: 'Song length'
	});
	if (!rangeResult.isValid()) {
		result.merge(rangeResult);
	}
	return result;
}

function displaySongLength(value) {
	const v = value || {};
	return `${v.minLength ?? 0}–${v.maxLength ?? 300}s`;
}

function resolveSongLength(node) {
	const value = node.data.currentValue || {};
	return {
		minLength: Number(value.minLength ?? 0),
		maxLength: Number(value.maxLength ?? 300)
	};
}

export const songLengthFilter = {
	id: 'song-length',
	metadata: {
		title: 'Song Length',
		icon: '⏱️',
		color: '#14b8a6',
		description: 'Filter songs by duration in seconds',
		category: 'content',
		type: NODE_CATEGORIES.FILTER
	},
	defaultSettings: SONG_LENGTH_DEFAULT_SETTINGS,
	formType: 'complex-song-length',
	validate: validateSongLength,
	display: displaySongLength,
	resolve: resolveSongLength
};

FilterRegistry.register(songLengthFilter.id, songLengthFilter);
```

`editor2State.createFilterEntry` clones `defaultSettings` when the user adds the filter from the palette. `FilterLine` builds `{ type: meta.formType }` and passes it to `ComplexFormFields`.

### 3. Register the import

**File:** `src/lib/filters/index.js`

```javascript
import './definitions/songLength.js';
```

### 4. UI (Svelte 5)

**File:** `src/lib/components/amqplus/dialog/complex/SongLength.svelte`

Match the editor chrome used by existing forms (`AnimeTitleLength.svelte`, `FranchiseSize.svelte`): `$props()` / `$bindable()` / `$effect()`, `df-input`, `ed-*` tokens.

```svelte
<script>
	import { clamp } from '$lib/utils/mathUtils.js';
	import { SONG_LENGTH_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';

	let {
		editedValue = $bindable(),
		config,
		getNodeColor = () => '#14b8a6',
		readOnly = false,
		isValid = $bindable(true),
		validationMessage = $bindable('')
	} = $props();

	if (!editedValue) {
		editedValue = { ...SONG_LENGTH_DEFAULT_SETTINGS };
	}
	if (editedValue.minLength === undefined) editedValue.minLength = 30;
	if (editedValue.maxLength === undefined) editedValue.maxLength = 150;

	function validateValue() {
		if (!editedValue) return;
		const errors = [];
		const min = Number(editedValue.minLength ?? 0);
		const max = Number(editedValue.maxLength ?? 300);

		if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 300 || min > max) {
			errors.push('Song length must be between 0–300s with min ≤ max');
		}

		isValid = errors.length === 0;
		validationMessage = errors.join('; ');
	}

	$effect(() => {
		validateValue();
	});
</script>

<div class="flex flex-col gap-3" style="--accent: {getNodeColor()}">
	{#if !isValid && validationMessage}
		<div
			class="text-ed-red flex items-center gap-2 rounded border border-[#f8514933] bg-[#f8514910] px-3 py-2 text-xs"
		>
			<span>⚠</span>
			<span>{validationMessage}</span>
		</div>
	{/if}

	<div class="border-ed-border bg-ed-canvas-default grid grid-cols-2 gap-3 rounded-md border p-3">
		<div class="flex flex-col gap-1">
			<label for="sl-min" class="font-dm text-ed-fg-subtle text-[11px] font-medium"
				>Min (seconds)</label
			>
			<input
				id="sl-min"
				type="number"
				class="df-input h-7 w-full"
				min={0}
				max={300}
				disabled={readOnly}
				value={editedValue.minLength}
				oninput={(e) => {
					const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value);
					if (!isNaN(val)) editedValue.minLength = clamp(val, 0, 300);
				}}
			/>
		</div>
		<div class="flex flex-col gap-1">
			<label for="sl-max" class="font-dm text-ed-fg-subtle text-[11px] font-medium"
				>Max (seconds)</label
			>
			<input
				id="sl-max"
				type="number"
				class="df-input h-7 w-full"
				min={0}
				max={300}
				disabled={readOnly}
				value={editedValue.maxLength}
				oninput={(e) => {
					const val = parseInt(/** @type {HTMLInputElement} */ (e.target).value);
					if (!isNaN(val)) editedValue.maxLength = clamp(val, 0, 300);
				}}
			/>
		</div>
	</div>
</div>
```

### 5. Wire the form

**File:** `src/lib/components/amqplus/dialog/ComplexFormFields.svelte`

`config.type` must equal the definition’s `formType`:

```svelte
<script>
	import SongLength from './complex/SongLength.svelte';
</script>

{:else if config.type === 'complex-song-length'}
	<SongLength
		bind:editedValue
		{config}
		{getNodeColor}
		{readOnly}
		bind:isValid
		bind:validationMessage
	/>
```

### 6. Server filtering

**File:** `src/lib/server/songFiltering.js`

Key on `FILTER_REGISTRY` must match the client `id` (`'song-length'`). Range-only filters only need `applyGlobalFilter`. Quota / distribution filters also implement `buildBaskets` — see `song-difficulty` or `songs-and-types`.

```javascript
'song-length': {
	applyGlobalFilter: (songs, settings) => {
		const beforeCount = songs.length;
		const minLength = Number(settings.minLength ?? 0);
		const maxLength = Number(settings.maxLength ?? 300);

		const filtered = songs.filter((song) => {
			const length = song.songLength ?? 90;
			return length >= minLength && length <= maxLength;
		});

		const stats = recordFilterStat('Song Length', beforeCount, filtered.length, {
			minLength,
			maxLength
		});

		return { songs: filtered, stats };
	},

	metadata: { name: 'Song Length', category: 'content' }
},
```

---

## Data flow

```
Editor2
  ├── imports $lib/filters/index.js  →  FilterRegistry populated
  ├── FilterPalette  →  FilterRegistry.getAll()
  ├── add filter     →  createFilterEntry(id) clones defaultSettings
  ├── FilterLine     →  formType → ComplexFormFields → complex/*.svelte
  ├── Save           →  { version: '2.0', routes: [...] }
  └── Simulation     →  simulateQuizFromRoutes → FilterRegistry.resolve()
        └── Server   →  FILTER_REGISTRY[id].applyGlobalFilter / buildBaskets
```

## Patterns that matter

- **Auto-register**: definition file calls `FilterRegistry.register(id, def)` at module scope; `index.js` only needs the import.
- **`formType` link**: definition `formType` ↔ `ComplexFormFields` `config.type` branch.
- **Same `id` everywhere**: `DEFAULT_NODE_SETTINGS` key, client `id`, and `FILTER_REGISTRY` key must match.
- **Validate with `.isValid()`**: `ValidationResult` exposes a method, not a boolean field.
- **Resolve → server**: simulation builds static settings via `resolve`; the server never reads the client registry.
- **Reference implementations**: simple range → `franchise-size` / `anime-title-length`; include/exclude → `genres` / `tags`; quotas → `song-difficulty` / `songs-and-types`.
