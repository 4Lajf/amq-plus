# Adding a New Filter to AMQ Plus

Complete example: "Song Length" filter that filters songs by duration.

## Architecture Overview

The quiz editor uses a **routes-based format**. Each quiz has:

- **Routes** — weighted paths, each with basic settings, sources, and an ordered list of **filters**
- **Filters** — configured inline within each route

There are **two filter registries**:

| Registry | Location | Purpose |
|----------|----------|---------|
| Client `FilterRegistry` | `src/lib/filters/FilterRegistry.js` | Validate, display, and resolve filter settings for the editor & simulation |
| Server `FILTER_REGISTRY` | `src/lib/server/songFiltering.js` | Apply actual song filtering (`applyGlobalFilter`, `buildBaskets`) |

## Files to Create/Edit

1. **Default settings** — Define the filter's default configuration values
2. **Filter definition** — Core client-side logic (validate, display, resolve)
3. **Register filter** — Import the definition so it auto-registers
4. **UI component** — Svelte 5 configuration form
5. **Register form** — Connect UI component to the dialog system
6. **Server-side** — Actual song filtering logic

---

## Complete Example: Song Length Filter

### 1. Default Settings

**File:** `src/lib/utils/defaultNodeSettings.js`

Add a named export for the default settings and register it in `DEFAULT_NODE_SETTINGS`:

```javascript
// Add near the other filter defaults (after POPULARITY_DEFAULT_SETTINGS etc.)

/** @type {Object} */
export const SONG_LENGTH_DEFAULT_SETTINGS = {
    minLength: 30,
    maxLength: 150,
    mode: 'range'
};

// Then add to the DEFAULT_NODE_SETTINGS object:
export const DEFAULT_NODE_SETTINGS = {
    // ... existing entries ...
    'song-length': SONG_LENGTH_DEFAULT_SETTINGS
};
```

### 2. Client-Side Filter Definition

**File:** `src/lib/filters/definitions/songLength.js`

This defines how to validate settings, display a summary, and resolve values for simulation. The filter auto-registers when imported.

```javascript
import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '$lib/utils/nodeCategories.js';
import { ValidationResult } from '$lib/utils/validation/validationFramework.js';
import { validateRange } from '$lib/utils/validation/commonValidators.js';
import { SONG_LENGTH_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';

function validateSongLength(value, context) {
    const v = value || {};
    const result = new ValidationResult();
    const min = Number(v.minLength ?? 0);
    const max = Number(v.maxLength ?? 300);

    // validateRange returns a ValidationResult, not a boolean
    const rangeResult = validateRange(min, max, {
        minBound: 0,
        maxBound: 300,
        fieldName: 'Song length'
    });
    if (!rangeResult.isValid) {
        result.merge(rangeResult);
    }
    return result;
}

function displaySongLength(value, context) {
    const v = value || {};
    return `${v.minLength ?? 0}–${v.maxLength ?? 300}s`;
}

function resolveSongLength(node, context, rng) {
    const value = node.data.currentValue;
    return {
        mode: value.mode || 'range',
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
    formType: 'complex-song-length',     // Must match the condition in ComplexFormFields.svelte
    validate: validateSongLength,
    display: displaySongLength,
    resolve: resolveSongLength
};

FilterRegistry.register(songLengthFilter.id, songLengthFilter);
```

### 3. Register Filter Import

**File:** `src/lib/filters/index.js`

Importing the definition triggers its `FilterRegistry.register()` call:

```javascript
// Add alongside the other imports
import './definitions/songLength.js';
```

### 4. UI Component (Svelte 5)

**File:** `src/lib/components/amqplus/dialog/complex/SongLength.svelte`

Must follow the Svelte 5 pattern with `$props()`, `$bindable()`, and `$effect()`:

```svelte
<script>
    import { Label } from '$lib/components/ui/label';
    import { Input } from '$lib/components/ui/input';
    import { SONG_LENGTH_DEFAULT_SETTINGS } from '$lib/utils/defaultNodeSettings.js';

    let {
        editedValue = $bindable(),
        config,
        getNodeColor = () => '#6366f1',
        readOnly = false,
        getTotalSongs = () => 20,
        isValid = $bindable(true),
        validationMessage = $bindable('')
    } = $props();

    if (!editedValue) editedValue = { ...SONG_LENGTH_DEFAULT_SETTINGS };
    if (editedValue.minLength === undefined) editedValue.minLength = 30;
    if (editedValue.maxLength === undefined) editedValue.maxLength = 150;
    if (!editedValue.mode) editedValue.mode = 'range';

    function validateValue() {
        if (!editedValue) return;
        const errors = [];
        const min = Number(editedValue.minLength ?? 0);
        const max = Number(editedValue.maxLength ?? 300);

        if (!Number.isFinite(min) || !Number.isFinite(max) ||
            min < 0 || max > 300 || min > max) {
            errors.push('Song length must be between 0–300s with min ≤ max');
        }

        isValid = errors.length === 0;
        validationMessage = errors.join('; ');
    }

    $effect(() => {
        validateValue();
    });
</script>

<div class="space-y-4">
    {#if !isValid && validationMessage}
        <div class="rounded-lg border border-red-200 bg-red-50 p-3">
            <div class="flex items-start gap-3">
                <div class="flex-1">
                    <h4 class="mb-1 text-sm font-medium text-red-900">Configuration Error</h4>
                    <div class="text-sm text-red-800">{validationMessage}</div>
                </div>
            </div>
        </div>
    {/if}

    <div class="grid grid-cols-2 gap-4">
        <div>
            <Label>Min Length (seconds)</Label>
            <Input type="number" bind:value={editedValue.minLength}
                   min={0} max={300} disabled={readOnly} />
        </div>
        <div>
            <Label>Max Length (seconds)</Label>
            <Input type="number" bind:value={editedValue.maxLength}
                   min={0} max={300} disabled={readOnly} />
        </div>
    </div>
</div>
```

### 5. Register Form Component

**File:** `src/lib/components/amqplus/dialog/ComplexFormFields.svelte`

Add the import and a new branch in the `{#if}` chain. The `config.type` here matches `formType` from the filter definition:

```svelte
<script>
    // Add to imports
    import SongLength from './complex/SongLength.svelte';
</script>

<!-- Add to the if/else chain -->
{:else if config.type === 'complex-song-length'}
    <SongLength bind:editedValue {config} {getNodeColor} {getTotalSongs}
                {readOnly} bind:isValid bind:validationMessage />
```

### 6. Server-Side Filtering

**File:** `src/lib/server/songFiltering.js`

Add an entry to the `FILTER_REGISTRY` object. The key must match the filter `id` from step 2:

```javascript
'song-length': {
    applyGlobalFilter: (songs, settings, targetSourceId) => {
        if (settings.mode === 'range') {
            const beforeCount = songs.length;
            const filtered = songs.filter(song => {
                const length = song.songLength ?? 90;
                return length >= settings.minLength && length <= settings.maxLength;
            });

            const stats = recordFilterStat('Song Length', beforeCount, filtered.length, {
                minLength: settings.minLength,
                maxLength: settings.maxLength
            });

            return { songs: filtered, stats };
        }

        return { songs, stats: null };
    },

    // Optional: build baskets for count/percentage distribution modes
    buildBaskets: (settings, targetSourceId, context) => {
        const baskets = [];

        if (settings.mode !== 'count' && settings.mode !== 'percentage') {
            return baskets;
        }

        if (settings.ranges && settings.ranges.length > 0) {
            settings.ranges.forEach((range) => {
                const { min, max } = calculateRangeFromSettings(
                    range.valueRange || range.value,
                    settings.mode,
                    settings.total
                );

                if (max > 0) {
                    const matcher = (song) => {
                        const length = song.songLength ?? 90;
                        return length >= range.minLength && length <= range.maxLength;
                    };

                    baskets.push(createBasket(
                        `songLength-${range.minLength}-${range.maxLength}-${targetSourceId || 'all'}`,
                        min,
                        max,
                        wrapMatcherWithSourceCheck(matcher, targetSourceId)
                    ));
                }
            });
        }

        return baskets;
    },

    metadata: { name: 'Song Length', category: 'duration' }
},
```

---

## Data Flow Summary

```
Editor (routes format)
  │
  ├── FilterPalette ──→ drag or click "+" to add filter to route
  │
  ├── FilterStack ──→ ordered list of filters per route
  │     └── FilterLine ──→ expand to edit via ComplexFormFields
  │
  ├── Save ──→ { version: '2.0', routes: [...] }
  │
  └── Simulation (client) ──→ simulateQuizFromRoutes(routes, seed)
        │  Uses FilterRegistry.resolve() for each filter
        │
        └── Server ──→ songFiltering.js
              Uses FILTER_REGISTRY[id].applyGlobalFilter()
              Uses FILTER_REGISTRY[id].buildBaskets()
```

## Key Patterns

- **Auto-registration**: Filter definitions call `FilterRegistry.register()` at module level. Importing the file in `src/lib/filters/index.js` triggers registration.
- **`formType` linking**: The filter definition's `formType` (e.g. `'complex-song-length'`) must match the `config.type` condition in `ComplexFormFields.svelte`.
- **Two registries**: Client-side `FilterRegistry` handles editor concerns (validate, display, resolve). Server-side `FILTER_REGISTRY` in `songFiltering.js` handles actual song filtering.
- **Svelte 5 props**: UI components use `$props()` with `$bindable()` for `editedValue`, `isValid`, `validationMessage`. Validation runs via `$effect()`.
- **Resolve → Server**: `simulation.js` calls `FilterRegistry.resolve()` to produce static settings, which the server then feeds into `FILTER_REGISTRY[id].applyGlobalFilter()` and `.buildBaskets()`.
