import { describe, it, expect } from 'vitest';
import { songCategoriesFilter } from '../src/lib/filters/definitions/songCategories.js';

describe('Song Categories - Resolve Simple Mode', () => {
  it('resolves viewMode simple as basic enabled matrix', () => {
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
    expect(resolved.enabled.openings).toEqual({
      standard: false,
      instrumental: false,
      chanting: true,
      character: false
    });
    expect(resolved.enabled.endings).toEqual({
      standard: false,
      instrumental: false,
      chanting: true,
      character: false
    });
    expect(resolved.enabled.inserts).toEqual({
      standard: false,
      instrumental: false,
      chanting: true,
      character: false
    });
  });
});
