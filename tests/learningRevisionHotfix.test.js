import { describe, it, expect, vi, afterEach } from 'vitest';
import { TrainingScheduler, State } from '../src/lib/server/training/fsrs-service.js';
const song = id => ({ annSongId: id, songArtist: `Artist${id}`, songName: `Song${id}` });
const row = (id, state, extra = {}) => ({ song_ann_id: id, is_active: true,
  fsrs_state: { state, due: '2026-09-07T00:00:00Z', stability: 2, difficulty: 5, reps: 1 }, ...extra });
afterEach(() => vi.useRealTimers());
describe('1.4.2 explicit revision hotfix', () => {
  it.each([{ revisionSongPercentage: 100 }, { revisionCount: 26, dueCount: 0, newCount: 0 }])('explicitly practices 26 learning songs again (%j)', settings => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-06T20:40:00Z'));
    const records = Array.from({ length: 26 }, (_, i) => row(i + 1, State.Learning));
    const { playlist } = new TrainingScheduler().computeSessionPlaylist(records, records.map(r => song(r.song_ann_id)), 26, {
      mode: 'manual', dueSongPercentage: 0, newSongPercentage: 0, ...settings,
      excludePlayedSongAnnIds: records.map(r => r.song_ann_id) });
    expect(playlist).toHaveLength(26);
    expect(playlist.every(s => s.selection_reason === 'revision')).toBe(true);
    expect(new Set(playlist.map(s => s.annSongId)).size).toBe(26);
  });
  it.each(['auto', 'manual'])('still excludes today’s songs from %s filler', mode => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-06T20:40:00Z'));
    const records = [row(1, State.Learning), row(2, State.Relearning), row(3, State.Review)];
    const { playlist } = new TrainingScheduler().computeSessionPlaylist(records, records.map(r => song(r.song_ann_id)), 3, {
      mode, dueSongPercentage: 100, newSongPercentage: 0, revisionSongPercentage: 0,
      excludePlayedSongAnnIds: [1, 2, 3] });
    expect(playlist).toHaveLength(0);
  });
  it('preserves due/stability ordering rather than forcing learning-stage priority', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-06T20:40:00Z'));
    const records = [row(1, State.Review), row(2, State.Learning), row(3, State.Relearning),
      row(4, State.Relearning, { suspended_at: '2026-09-06T00:00:00Z' }),
      row(5, State.Learning, { is_active: false })];
    records[0].fsrs_state.stability = 0.1;
    records[1].fsrs_state.stability = 1;
    expect(new TrainingScheduler().getSongsNeedingRevision(records).map(r => r.song_ann_id)).toEqual([1, 2, 3]);
    const { playlist } = new TrainingScheduler().computeSessionPlaylist(records, records.map(r => song(r.song_ann_id)), 2, {
      mode: 'manual', dueCount: 0, newCount: 0, revisionCount: 2,
      excludePlayedSongAnnIds: [1, 2, 3, 4, 5] });
    expect(playlist.map(s => s.annSongId).sort()).toEqual([1, 2]);
  });
  it('does not treat ignored percentages as an explicit target in count mode', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-06T20:40:00Z'));
    const { playlist } = new TrainingScheduler().computeSessionPlaylist([row(1, State.Learning)], [song(1)], 1, {
      mode: 'manual', dueCount: 1, revisionSongPercentage: 100, excludePlayedSongAnnIds: [1]
    });
    expect(playlist).toHaveLength(0);
  });
});
