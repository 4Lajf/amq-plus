import { describe, it, expect } from 'vitest';
import { buildQuizCommand } from '../src/lib/server/quiz-command-builder.js';

const songs = [{ annSongId: 1897 }, { annSongId: 25199 }];

function build(samplePoint) {
  return buildQuizCommand({
    songs,
    simulatedConfig: {
      basicSettings: {
        guessTime: { kind: 'static', value: 20 },
        extraGuessTime: { kind: 'static', value: 0 },
        samplePoint,
        playbackSpeed: 1
      }
    },
    quizName: 'AMQ+ Test',
    quizDescription: 'test'
  });
}

/**
 * Contract test for the payload AMQ's community quiz creator accepts.
 * AMQ has changed this shape three times in a few months - if it drifts again
 * these assertions should be the thing that fails, not the Discord bug thread.
 */
describe('buildQuizCommand - AMQ payload contract', () => {
  it('fits long titles into AMQ’s 30-character name field without splitting emoji', () => {
    for (const name of ['AMQ+ [TEST] disposable pool cache', 'AMQ+ ' + 'a'.repeat(24) + '🎵 song']) {
      const { data } = buildQuizCommand({ songs, simulatedConfig: { basicSettings: {} }, quizName: name, quizDescription: 'test' });
      expect(data.quizSave.name.length).toBeLessThanOrEqual(30);
      expect(data.quizSave.name).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(name.startsWith(data.quizSave.name)).toBe(true);
    }
    expect(build({ kind: 'static', value: 20 }).data.quizSave.name).toBe('AMQ+ Test');
  });

  it('emits connectUp, locked, and ruleBlockRandomOrder', () => {
    const { data } = build({ kind: 'range', min: 0, max: 100 });

    expect(data.quizSave.ruleBlockRandomOrder).toBe(true);
    for (const block of data.quizSave.ruleBlocks[0].blocks) {
      expect(block.connectUp).toBe(false);
      expect(block.locked).toBe(false);
    }
  });

  it('leaves response-only schema version and matchSongCount for AMQ to stamp', () => {
    const { data } = build({ kind: 'range', min: 0, max: 100 });
    const ruleBlock = data.quizSave.ruleBlocks[0];

    expect(data.quizSave).not.toHaveProperty('version');
    expect(ruleBlock).not.toHaveProperty('matchSongCount');
    expect(ruleBlock.songCount).toBe(songs.length);
  });

  it('stamps a range sample point on every block as [start, end]', () => {
    const { data } = build({ kind: 'range', min: 7, max: 40 });
    const ruleBlock = data.quizSave.ruleBlocks[0];

    expect(ruleBlock.blocks).toEqual([
      { connectUp: false, locked: false, samplePoint: { samplePoint: [7, 40] }, annSongId: 1897 },
      { connectUp: false, locked: false, samplePoint: { samplePoint: [7, 40] }, annSongId: 25199 }
    ]);
    expect(ruleBlock.samplePoint.samplePoint).toEqual([7, 40]);
  });

  it('encodes a fixed sample point as a bare number, not [n, n]', () => {
    const { data } = build({ kind: 'static', value: 12 });

    for (const block of data.quizSave.ruleBlocks[0].blocks) {
      expect(block.samplePoint.samplePoint).toBe(12);
    }
  });

  it('accepts the raw stored setting shape as well as the display shape', () => {
    const { data } = build({
      type: 'complex',
      label: 'Sample Point',
      value: { useRange: true, staticValue: 20, start: 0, end: 100 }
    });

    expect(data.quizSave.ruleBlocks[0].blocks[0].samplePoint.samplePoint).toEqual([0, 100]);
  });

  it('treats useRange: false in the raw shape as a fixed point', () => {
    const { data } = build({
      type: 'complex',
      label: 'Sample Point',
      value: { useRange: false, staticValue: 35, start: 0, end: 100 }
    });

    expect(data.quizSave.ruleBlocks[0].blocks[0].samplePoint.samplePoint).toBe(35);
  });
});
