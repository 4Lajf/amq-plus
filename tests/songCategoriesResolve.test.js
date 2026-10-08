import { describe, it, expect } from 'vitest';
import { songCategoriesFilter } from '../src/lib/filters/definitions/songCategories.js';

/**
 * The "Unspecified" column (key `noCategory`) is the one asymmetry in this
 * resolver, and it is deliberate.
 *
 * B1 made songs with no `songCategory` land in that column instead of matching
 * nothing. Left at the usual "absent means enabled" default that would have
 * widened ~96% of production's Song Categories nodes - 180 of 286 simple-mode
 * nodes predate the column entirely - which is a change to pools nobody asked
 * for. So absent means OFF here: the fix makes those songs reachable without
 * making them automatic.
 */
describe('Song Categories - Resolve Simple Mode', () => {
  it('resolves viewMode simple as basic enabled matrix, Unspecified off when absent', () => {
    // A node in the older four-category schema, which is what 180 production
    // nodes look like: no `noCategory` key at all.
    const node = {
      data: {
        currentValue: {
          viewMode: 'simple',
          mode: 'count',
          openings: {
            standard: false,
            instrumental: false,
            chanting: true,
            character: false
          },
          endings: {
            standard: false,
            instrumental: false,
            chanting: true,
            character: false
          },
          inserts: {
            standard: false,
            instrumental: false,
            chanting: true,
            character: false
          }
        }
      }
    };

    const resolved = songCategoriesFilter.resolve(node, {}, () => 0.5);

    expect(resolved.mode).toBe('basic');
    for (const row of ['openings', 'endings', 'inserts']) {
      expect(resolved.enabled[row], row).toEqual({
        standard: false,
        instrumental: false,
        chanting: true,
        character: false,
        // Was `true` before the default flipped. Not a loosened assertion - the
        // decision changed, and this is the line that records it.
        noCategory: false
      });
    }
  });

  it('honours an explicit Unspecified tick', () => {
    // The other half of the rule: off by default is not the same as unavailable.
    // A user who ticks the box gets metadata-less songs, which is the entire
    // point of B1.
    const node = {
      data: {
        currentValue: {
          viewMode: 'simple',
          mode: 'count',
          openings: { standard: true, noCategory: true },
          endings: { standard: true, noCategory: false },
          inserts: { standard: true }
        }
      }
    };

    const resolved = songCategoriesFilter.resolve(node, {}, () => 0.5);

    expect(resolved.enabled.openings.noCategory, 'explicit true is honoured').toBe(true);
    expect(resolved.enabled.endings.noCategory, 'explicit false stays false').toBe(false);
    expect(resolved.enabled.inserts.noCategory, 'absent is off').toBe(false);
    // The four real categories keep the old "absent means enabled" behaviour.
    expect(resolved.enabled.inserts.chanting, 'absent category is still on').toBe(true);
  });

  it('extract agrees with resolve, so the preview cannot promise a different pool', () => {
    const value = {
      viewMode: 'simple',
      mode: 'count',
      openings: { standard: true, noCategory: true },
      endings: { standard: true },
      inserts: { standard: true }
    };

    const extracted = songCategoriesFilter.extract(value, {});
    const resolved = songCategoriesFilter.resolve({ data: { currentValue: value } }, {}, () => 0.5);

    expect(extracted.enabled.openings.noCategory).toBe(resolved.enabled.openings.noCategory);
    expect(extracted.enabled.endings.noCategory).toBe(resolved.enabled.endings.noCategory);
    expect(extracted.enabled.inserts.noCategory).toBe(resolved.enabled.inserts.noCategory);
  });
});
