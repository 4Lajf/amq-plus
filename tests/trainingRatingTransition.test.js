import fs from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
const source = fs.readFileSync('amqPlusConnector.user.js', 'utf8');
const code = source.slice(source.indexOf('function advanceTrainingRatingCard('), source.indexOf('function hideTrainingRatingUI('));
describe('unrated song transition', () => {
  it('clears the old card and advances its cursor without recording a rating', () => {
    const state = { ratingAnnSongId: '42', lastAnswerDetails: { success: false }, currentSession: { currentIndex: 0, playlist: [{ annSongId: 42 }, { annSongId: 43 }] } };
    const hide = vi.fn(() => { state.ratingAnnSongId = null; });
    const ctx = { trainingState: state, hideTrainingRatingUI: hide, findTrainingPlaylistIndexByAnnSongId: id => state.currentSession.playlist.findIndex(s => String(s.annSongId) === id) };
    vm.runInNewContext(code, ctx);
    ctx.advanceTrainingRatingCard();
    expect(state.currentSession.currentIndex).toBe(1);
    expect(state.lastAnswerDetails).toBeNull();
    expect(hide).toHaveBeenCalledWith(false);
    ctx.advanceTrainingRatingCard();
    expect(state.currentSession.currentIndex).toBe(1);
  });
  it('also clears the overlay outside an active session', () => {
    const hide = vi.fn();
    const ctx = { trainingState: { ratingAnnSongId: null, currentSession: null }, hideTrainingRatingUI: hide };
    vm.runInNewContext(code, ctx);
    ctx.advanceTrainingRatingCard();
    expect(hide).toHaveBeenCalledWith(false);
  });
});
