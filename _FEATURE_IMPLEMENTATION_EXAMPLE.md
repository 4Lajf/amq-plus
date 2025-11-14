# Adding a New Filter to AMQ Plus

Complete example: "Song Length" filter that filters songs by duration.

## Files to Create/Edit

1. **Filter definition** - Core logic (validate, display, resolve)
2. **UI component** - Configuration interface
3. **Register form** - Connect UI to system
4. **Register filter** - Import to load definition
5. **Server-side** - Actual song filtering

---

## Complete Example: Song Length Filter

**Important Notes:**
- The `validateRange` helper function returns a `ValidationResult` object, not a boolean. Use `result.merge()` to combine validation results.
- UI components must follow the standard pattern with proper props (`editedValue`, `isValid`, `validationMessage`, etc.) and include validation/error display.
- Basket mode (count/percentage) is advanced and requires additional UI to configure multiple ranges. The example shows the server-side structure, but implementing basket mode UI is beyond this basic example.

### 1. Client-Side Filter Definition

**File:** `src/lib/components/amqplus/editor/utils/filters/definitions/songLength.js`

**Why:** This is the brain of your filter. It defines how to validate settings, display a summary, and resolve values for simulation/export.

```javascript
import { FilterRegistry } from '../FilterRegistry.js';
import { NODE_CATEGORIES } from '../../nodeDefinitions.js';
import { ValidationResult } from '../../validation/validationFramework.js';
import { validateRange } from '../../validation/commonValidators.js';

// Default values when user creates a new filter node
const DEFAULT_SETTINGS = {
    minLength: 30,
    maxLength: 150,
    mode: 'range'
};

// Validation: Check if user's configuration is valid
// Called whenever user edits the filter settings
function validateSongLength(value, context) {
    const v = value || {};
    const result = new ValidationResult();
    const min = Number(v.minLength ?? 0);
    const max = Number(v.maxLength ?? 300);
    
    // Use helper to check min ≤ max and within bounds
    // Note: validateRange returns a ValidationResult, not a boolean
    const rangeResult = validateRange(min, max, { minBound: 0, maxBound: 300, fieldName: 'Song length' });
    if (!rangeResult.isValid) {
        result.merge(rangeResult);
    }
    return result;
}

// Display: Short summary shown on the filter node in the editor
// Keep it under ~50 characters
function displaySongLength(value, context) {
    const v = value || {};
    return `${v.minLength ?? 0}-${v.maxLength ?? 300}s`;
}

// Resolve: Convert ranges to static values for simulation/export
// This is called when user exports configuration or runs simulation
function resolveSongLength(node, context, rng) {
    const value = node.data.currentValue;
    return {
        mode: value.mode || 'range',
        minLength: Number(value.minLength ?? 0),
        maxLength: Number(value.maxLength ?? 300)
    };
}

// Register the filter with the system
// This makes it available everywhere (validation, display, simulation)
FilterRegistry.register('song-length', {
    id: 'song-length',                          // Unique ID (must match server-side)
    metadata: {
        title: 'Song Length',                   // Display name in UI
        icon: '⏱️',                             // Emoji shown in palette
        color: '#14b8a6',                       // Node color (hex)
        description: 'Filter songs by duration in seconds',
        category: 'content',                    // Category grouping
        type: NODE_CATEGORIES.FILTER
    },
    defaultSettings: DEFAULT_SETTINGS,
    formType: 'complex-song-length',            // Links to UI component
    validate: validateSongLength,
    display: displaySongLength,
    resolve: resolveSongLength
});
```

### 2. Register Filter Import

**File:** `src/lib/components/amqplus/editor/utils/filters/index.js`

**Why:** Importing your filter definition triggers its registration. Without this import, the filter won't load.

```javascript
import './definitions/songLength.js';  // Add this line
```

### 3. UI Component

**File:** `src/lib/components/amqplus/dialog/complex/SongLength.svelte`

**Why:** This is the configuration form users see when they click on the filter node. It provides inputs to edit the filter settings.

**Note:** The component must follow the standard pattern with proper props, validation, and error display to match the existing codebase.

```svelte
<script>
    import { Label } from '$lib/components/ui/label';
    import { Input } from '$lib/components/ui/input';

    let {
        editedValue = $bindable(),
        config,
        getNodeColor = () => '#6366f1',
        readOnly = false,
        getTotalSongs = () => 20,
        isValid = $bindable(true),
        validationMessage = $bindable('')
    } = $props();

    // Initialize value with defaults if empty
    if (!editedValue) {
        editedValue = { minLength: 30, maxLength: 150, mode: 'range' };
    }
    if (editedValue.minLength === undefined) editedValue.minLength = 30;
    if (editedValue.maxLength === undefined) editedValue.maxLength = 150;
    if (!editedValue.mode) editedValue.mode = 'range';

    // Validation logic
    function validateValue() {
        if (!editedValue) return;
        const errors = [];

        const min = Number(editedValue.minLength ?? 0);
        const max = Number(editedValue.maxLength ?? 300);
        if (
            !Number.isFinite(min) ||
            !Number.isFinite(max) ||
            min < 0 ||
            max > 300 ||
            min > max
        ) {
            errors.push('Song length must be between 0-300s with min ≤ max');
        }

        isValid = errors.length === 0;
        validationMessage = errors.join('; ');
    }

    // Watch for changes and validate
    $effect(() => {
        validateValue();
    });
</script>

<div class="space-y-4">
    <!-- Validation Error Display -->
    {#if !isValid && validationMessage}
        <div class="rounded-lg border border-red-200 bg-red-50 p-3">
            <div class="flex items-start gap-3">
                <div class="mt-0.5 shrink-0">
                    <svg class="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clip-rule="evenodd"
                        ></path>
                    </svg>
                </div>
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
            <Input type="number" bind:value={editedValue.minLength} min={0} max={300} disabled={readOnly} />
        </div>
        <div>
            <Label>Max Length (seconds)</Label>
            <Input type="number" bind:value={editedValue.maxLength} min={0} max={300} disabled={readOnly} />
        </div>
    </div>
</div>
```

### 4. Register Form Component

**File:** `src/lib/components/amqplus/dialog/ComplexFormFields.svelte`

**Why:** This connects your UI component to the dialog system. The `formType` from step 1 matches the condition here.

```javascript
import SongLength from './complex/SongLength.svelte';

// Add to component mapping (find the existing if/else chain)
{:else if config.type === 'complex-song-length'}
    <SongLength bind:editedValue {config} {getNodeColor} {getTotalSongs} {readOnly} bind:isValid bind:validationMessage />
```

### 5. Server-Side Implementation

**File:** `src/lib/server/songFiltering.js`

**Why:** This is where the actual filtering happens. The server uses this to filter songs when generating a quiz.

**Note:** You should also add a typedef documentation comment for your filter settings (see existing filters for examples).

```javascript
/**
 * Song length filter settings (from 'song-length' filter)
 * Documentation only - describes settings structure for this filter type
 * @typedef {Object} SongLengthSettings
 * @property {'range'|'count'|'percentage'} mode - Filter mode
 * @property {number} minLength - Minimum song length in seconds
 * @property {number} maxLength - Maximum song length in seconds
 * @property {Array<{minLength: number, maxLength: number, value?: number, valueRange?: {min: number, max: number}}>} [ranges] - Length ranges for basket mode
 * @property {number} [total] - Total song count (for basket mode)
 */

// Register server-side filter (must match ID from client-side: 'song-length')
FILTER_REGISTRY['song-length'] = {
    // applyGlobalFilter: Called to filter out songs that don't match criteria
    // Use this for simple "include/exclude" filtering
    applyGlobalFilter: (songs, settings, targetSourceId) => {
        // For range mode: remove songs outside the length range
        if (settings.mode === 'range') {
            const beforeCount = songs.length;
            const filtered = songs.filter(song => {
                const length = song.songLength ?? 90;  // Default to 90s if missing
                return length >= settings.minLength && length <= settings.maxLength;
            });
            
            console.log(`[GLOBAL FILTERS] Song Length filter: ${filtered.length}/${beforeCount} songs (range: ${settings.minLength}-${settings.maxLength}s)`);
            
            const stats = recordFilterStat('Song Length', beforeCount, filtered.length, {
                minLength: settings.minLength,
                maxLength: settings.maxLength
            });
            
            return { songs: filtered, stats };
        }
        
        // For count/percentage mode: don't filter, use baskets instead
        return { songs, stats: null };
    },
    
    // buildBaskets: Called to create "quotas" for specific song categories
    // Use this when you want "X songs from category A, Y songs from category B"
    // Note: Basket mode requires additional UI to configure multiple ranges
    // This example shows the structure but basket mode is advanced and may need
    // more complex UI components (see AnimeType.svelte or SongDifficulty.svelte for examples)
    buildBaskets: (settings, targetSourceId, context) => {
        const baskets = [];
        
        // Only build baskets for count/percentage modes
        // In range mode, we already filtered songs in applyGlobalFilter
        if (settings.mode !== 'count' && settings.mode !== 'percentage') {
            return baskets;
        }
        
        // Example: If your filter divides songs into multiple length ranges
        // Each range gets a quota (e.g., "30% short songs, 50% medium, 20% long")
        // Note: This requires settings.ranges to be populated from the UI
        if (settings.ranges && settings.ranges.length > 0) {
            settings.ranges.forEach((range) => {
                // Convert percentage/count to actual song numbers
                const { min, max } = calculateRangeFromSettings(
                    range.valueRange || range.value, 
                    settings.mode, 
                    settings.total
                );
                
                if (max > 0) {
                    // Matcher: Does this song belong in this basket?
                    const baseMatcher = (song) => {
                        const length = song.songLength ?? 90;
                        return length >= range.minLength && length <= range.maxLength;
                    };
                    
                    // Wrap with source check if filtering a specific source
                    const matcher = targetSourceId 
                        ? (song) => {
                            const sourceId = song._basketSourceId || song._sourceId;
                            return sourceId === targetSourceId && baseMatcher(song);
                        }
                        : baseMatcher;
                    
                    // Create basket with unique ID, quota (min-max), and matcher function
                    baskets.push(createBasket(
                        `songLength-${range.minLength}-${range.maxLength}-${targetSourceId || 'all'}`,
                        min,
                        max,
                        matcher
                    ));
                }
            });
        }
        
        return baskets;
    },
    
    metadata: { name: 'Song Length', category: 'duration' }
};
```