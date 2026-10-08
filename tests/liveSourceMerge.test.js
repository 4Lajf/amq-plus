import { describe, it, expect } from 'vitest';
import { isLiveSource, mergeLiveNodeData } from '../src/lib/server/utils/liveSourceMerge.js';
import { BATCH_USER_LIST_DEFAULT_SETTINGS } from '../src/lib/utils/defaultNodeSettings.js';

/**
 * The shape the current editor saves for a live source: a batch-user-list in
 * mode 'live', still carrying the default placeholder entry because live mode
 * hides the manual username fields.
 */
function liveSourceAsSaved() {
  return {
    ...structuredClone(BATCH_USER_LIST_DEFAULT_SETTINGS),
    sourceType: 'batch-user-list',
    mode: 'live'
  };
}

const lobbyRoster = {
  useEntirePool: true,
  minSharedUsers: 2,
  userEntries: [
    { id: 'p1', platform: 'anilist', username: 'Cherryish', selectedLists: { completed: true } },
    { id: 'p2', platform: 'mal', username: 'zCrimlet', selectedLists: { completed: true } }
  ]
};

describe('isLiveSource', () => {
  it('recognises the shape the editor saves today', () => {
    expect(isLiveSource(liveSourceAsSaved())).toBe(true);
  });

  it('still recognises the legacy standalone live-node type', () => {
    expect(isLiveSource({ sourceType: 'live-node' })).toBe(true);
  });

  it('does not treat a manual batch source as live', () => {
    expect(isLiveSource({ sourceType: 'batch-user-list', mode: 'manual' })).toBe(false);
  });

  it('does not treat an ordinary song list as live', () => {
    expect(isLiveSource({ sourceType: 'song-list', mode: 'user-lists' })).toBe(false);
    expect(isLiveSource(null)).toBe(false);
  });
});

describe('mergeLiveNodeData', () => {
  it('replaces the placeholder entry with the lobby roster', () => {
    // Regression: the merge used to match sourceType 'live-node' only, which the
    // editor stopped emitting. Every live quiz then generated against the saved
    // placeholder - a single blank username - instead of the lobby.
    const routes = [{ sources: [liveSourceAsSaved()] }];

    const { merged } = mergeLiveNodeData(routes, lobbyRoster);

    expect(merged).toBe(1);
    const src = routes[0].sources[0];
    expect(src.userEntries).toHaveLength(2);
    expect(src.userEntries.map((e) => e.username)).toEqual(['Cherryish', 'zCrimlet']);
    expect(src.useEntirePool).toBe(true);
    expect(src.minSharedUsers).toBe(2);
  });

  it('does not leave a blank placeholder username behind', () => {
    const routes = [{ sources: [liveSourceAsSaved()] }];
    expect(routes[0].sources[0].userEntries.some((e) => !e.username)).toBe(true);

    mergeLiveNodeData(routes, lobbyRoster);

    expect(routes[0].sources[0].userEntries.every((e) => e.username)).toBe(true);
  });

  it('merges legacy live-node sources the same way', () => {
    const routes = [{ sources: [{ sourceType: 'live-node', userEntries: [] }] }];

    expect(mergeLiveNodeData(routes, lobbyRoster).merged).toBe(1);
    expect(routes[0].sources[0].userEntries).toHaveLength(2);
  });

  it('leaves manual batch sources untouched', () => {
    const manual = {
      sourceType: 'batch-user-list',
      mode: 'manual',
      userEntries: [{ id: 'u1', platform: 'anilist', username: '3shine' }]
    };
    const routes = [{ sources: [manual] }];

    const { merged } = mergeLiveNodeData(routes, lobbyRoster);

    expect(merged).toBe(0);
    expect(manual.userEntries.map((e) => e.username)).toEqual(['3shine']);
  });

  it('merges every live source across all routes', () => {
    const routes = [
      { sources: [liveSourceAsSaved(), { sourceType: 'song-list', mode: 'masterlist' }] },
      { sources: [liveSourceAsSaved()] }
    ];

    expect(mergeLiveNodeData(routes, lobbyRoster).merged).toBe(2);
  });

  it('reports live sources without mutating when no roster is sent', () => {
    const routes = [{ sources: [liveSourceAsSaved()] }];

    const { merged, liveSources } = mergeLiveNodeData(routes, null);

    expect(merged).toBe(0);
    expect(liveSources).toBe(1);
    expect(routes[0].sources[0].userEntries).toHaveLength(1);
  });

  it('tolerates routes without sources', () => {
    expect(() => mergeLiveNodeData([{}, { sources: null }], lobbyRoster)).not.toThrow();
    expect(() => mergeLiveNodeData(null, lobbyRoster)).not.toThrow();
  });
});
