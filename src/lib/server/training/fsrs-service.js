/**
 * FSRS Service - Manages spaced repetition scheduling using ts-fsrs
 * 
 * FSRS (Free Spaced Repetition Scheduler) is a modern algorithm that optimizes
 * review intervals based on memory retention patterns.
 */

import { fsrs, generatorParameters, Rating, State, createEmptyCard } from 'ts-fsrs';

/**
 * FSRS Rating scale:
 * 1 - Again: Complete failure, reset the card
 * 2 - Hard: Difficult to recall, shorter interval
 * 3 - Good: Recalled with effort, standard interval
 * 4 - Easy: Recalled easily, longer interval
 */
export { Rating };

/**
 * FSRS Card states:
 * 0 - New: Never studied
 * 1 - Learning: Currently being learned
 * 2 - Review: In review phase
 * 3 - Relearning: Failed and being relearned
 */
export { State };

export class TrainingScheduler {
  constructor(params = {}) {
    // Initialize FSRS with custom parameters
    // enable_fuzz adds randomness to intervals to avoid review clustering
    const fsrsParams = generatorParameters({
      enable_fuzz: true,
      ...params
    });

    this.scheduler = fsrs(fsrsParams);
  }

  /**
   * Create a new FSRS card for a song
   * @param {string} songKey - Unique song identifier
   * @returns {Object} New FSRS card state
   */
  createNewCard(songKey) {
    const card = createEmptyCard();
    return {
      songKey,
      ...card,
      due: new Date() // Due immediately for first review
    };
  }

  /**
   * Schedule next review based on user's rating
   * @param {Object} card - Current FSRS card state
   * @param {number} rating - User rating (1-4)
   * @param {Date} now - Current time (defaults to now)
   * @returns {Object} Updated FSRS card state
   */
  scheduleNext(card, rating, now = new Date()) {
    // Convert our card format to ts-fsrs Card format
    // Use createEmptyCard as base to ensure all required properties are present
    const baseCard = createEmptyCard();
    const fsrsCard = {
      ...baseCard,
      due: new Date(card.due),
      stability: card.stability ?? baseCard.stability,
      difficulty: card.difficulty ?? baseCard.difficulty,
      elapsed_days: card.elapsed_days ?? 0,
      scheduled_days: card.scheduled_days ?? 0,
      reps: card.reps ?? 0,
      lapses: card.lapses ?? 0,
      state: card.state ?? baseCard.state,
      last_review: card.last_review ? new Date(card.last_review) : undefined
    };

    // Get scheduling info for all possible ratings
    const schedulingInfo = this.scheduler.repeat(fsrsCard, now);

    // Get the card for the selected rating
    const selectedRating = schedulingInfo[rating];

    return {
      ...selectedRating.card,
      due: selectedRating.card.due.toISOString(),
      last_review: now.toISOString()
    };
  }

  /**
   * Get songs that are due for review
   * @param {Array} progressRecords - Array of training_progress records
   * @param {number} limit - Maximum number of songs to return
   * @returns {Array} Songs due for review, sorted by urgency
   */
  getDueSongs(progressRecords, limit = 20) {
    const now = new Date();

    console.log('[TRAINING SELECTION] Finding due songs...');
    console.log('[TRAINING SELECTION]   Total progress records:', progressRecords.length);

    // Filter songs that are due and sort by due date (most overdue first)
    const dueSongs = progressRecords
      .filter(record => {
        const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : new Date(0);
        return dueDate <= now;
      })
      .sort((a, b) => {
        const dateA = new Date(a.fsrs_state?.due || 0);
        const dateB = new Date(b.fsrs_state?.due || 0);
        return dateA.getTime() - dateB.getTime(); // Earlier due date = higher priority
      });

    console.log('[TRAINING SELECTION]   Found due songs:', dueSongs.length);
    console.log('[TRAINING SELECTION]   Returning:', Math.min(dueSongs.length, limit), 'songs');

    return dueSongs.slice(0, limit);
  }

  /**
   * Get songs that haven't been practiced yet
   * @param {Array} progressRecords - Array of training_progress records
   * @param {Array} allQuizSongs - All songs in the quiz
   * @param {number} limit - Maximum number of new songs
   * @returns {Array} New songs to introduce
   */
  getNewSongs(progressRecords, allQuizSongs, limit = 10) {
    console.log('[TRAINING SELECTION] Finding new songs...');
    console.log('[TRAINING SELECTION]   Total quiz songs:', allQuizSongs.length);
    console.log('[TRAINING SELECTION]   Practiced songs:', progressRecords.length);

    // Create set of practiced song keys for fast lookup
    const practicedKeys = new Set(progressRecords.map(r => r.song_key));

    // Find songs not yet practiced
    const newSongs = allQuizSongs
      .filter(song => {
        const songKey = `${song.songArtist}_${song.songName}`;
        return !practicedKeys.has(songKey);
      })
      .slice(0, limit);

    console.log('[TRAINING SELECTION]   Found new songs:', allQuizSongs.length - practicedKeys.size);
    console.log('[TRAINING SELECTION]   Returning:', newSongs.length, 'songs');

    return newSongs;
  }

  /**
   * Get songs that need revision the most (not currently due, but should be reviewed)
   * Sorted by FSRS metrics: lowest stability first, then highest difficulty
   * @param {Array} progressRecords - Array of training_progress records
   * @param {number} limit - Maximum number of songs to return
   * @returns {Array} Songs needing revision, sorted by urgency
   */
  getSongsNeedingRevision(progressRecords, limit = 20) {
    const now = new Date();

    console.log('[TRAINING SELECTION] Finding songs needing revision...');

    // Get songs that are NOT due but have been practiced
    // Sort by urgency: lowest stability first (needs more practice), then highest difficulty
    const revisionSongs = progressRecords
      .filter(record => {
        const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
        // Not due yet (future due date)
        return dueDate && dueDate > now;
      })
      .sort((a, b) => {
        const stabilityA = a.fsrs_state?.stability ?? 999;
        const stabilityB = b.fsrs_state?.stability ?? 999;
        const difficultyA = a.fsrs_state?.difficulty ?? 0;
        const difficultyB = b.fsrs_state?.difficulty ?? 0;

        // First priority: lowest stability (needs more reinforcement)
        if (Math.abs(stabilityA - stabilityB) > 0.1) {
          return stabilityA - stabilityB;
        }

        // Second priority: highest difficulty (harder to remember)
        return difficultyB - difficultyA;
      });

    console.log('[TRAINING SELECTION]   Found revision candidates:', revisionSongs.length);
    console.log('[TRAINING SELECTION]   Returning:', Math.min(revisionSongs.length, limit), 'songs');

    return revisionSongs.slice(0, limit);
  }

  /**
   * Compute optimized training session playlist
   * Uses configurable split between due and new songs with smart fallback logic
   * 
   * @param {Array} progressRecords - Array of training_progress records
   * @param {Array} allQuizSongs - All songs in the quiz
   * @param {number} maxSessionLength - Maximum number of songs in session
   * @param {number} dueSongPercentage - Target percentage of due songs (0-100, default 70)
   * @returns {Object} Result with playlist and metadata
   */
  computeSessionPlaylist(progressRecords, allQuizSongs, maxSessionLength = 20, dueSongPercentage = 70) {
    console.log('[TRAINING SELECTION] ========================================');
    console.log('[TRAINING SELECTION] Computing playlist for session');
    console.log('[TRAINING SELECTION] Configuration:');
    console.log('[TRAINING SELECTION]   Max session length:', maxSessionLength);
    console.log('[TRAINING SELECTION]   Due song target:', dueSongPercentage + '%');
    console.log('[TRAINING SELECTION]   New song target:', (100 - dueSongPercentage) + '%');

    // Calculate target counts
    const targetDueCount = Math.floor(maxSessionLength * (dueSongPercentage / 100));
    const targetNewCount = maxSessionLength - targetDueCount;

    console.log('[TRAINING SELECTION] Target: ', targetDueCount, 'due,', targetNewCount, 'new');
    console.log('[TRAINING SELECTION] ----------------------------------------');

    // Step 1: Get available songs in each category
    console.log('[TRAINING SELECTION] Available pool:');
    const availableDueSongs = this.getDueSongs(progressRecords, 9999); // Get all due songs
    const availableNewSongs = this.getNewSongs(progressRecords, allQuizSongs, 9999); // Get all new songs
    const availableRevisionSongs = this.getSongsNeedingRevision(progressRecords, 9999); // Get all revision candidates

    console.log('[TRAINING SELECTION]   Total available: due =', availableDueSongs.length,
      ', new =', availableNewSongs.length, ', revision candidates =', availableRevisionSongs.length);
    console.log('[TRAINING SELECTION] ----------------------------------------');

    // Step 2: Select songs with fallback logic
    let selectedDue = [];
    let selectedNew = [];
    let selectedRevision = [];
    let warnings = [];

    // Try to get target number of due songs
    if (availableDueSongs.length >= targetDueCount) {
      selectedDue = availableDueSongs.slice(0, targetDueCount);
      console.log('[TRAINING SELECTION] ✓ Got', targetDueCount, 'due songs as requested');
    } else {
      selectedDue = availableDueSongs;
      console.log('[TRAINING SELECTION] ⚠ Only', availableDueSongs.length, 'due songs available (target:', targetDueCount + ')');
      warnings.push(`Only ${availableDueSongs.length} due songs available (target: ${targetDueCount})`);
    }

    // Calculate remaining slots
    const remainingSlots = maxSessionLength - selectedDue.length;
    console.log('[TRAINING SELECTION] Remaining slots after due songs:', remainingSlots);

    // Try to get new songs for remaining slots
    if (availableNewSongs.length >= remainingSlots) {
      selectedNew = availableNewSongs.slice(0, remainingSlots);
      console.log('[TRAINING SELECTION] ✓ Got', remainingSlots, 'new songs to fill remaining slots');
    } else {
      selectedNew = availableNewSongs;
      console.log('[TRAINING SELECTION] ⚠ Only', availableNewSongs.length, 'new songs available (needed:', remainingSlots + ')');
      warnings.push(`Only ${availableNewSongs.length} new songs available (needed: ${remainingSlots})`);

      // Still have slots? Try to fill with revision songs
      const stillRemaining = remainingSlots - selectedNew.length;
      if (stillRemaining > 0) {
        console.log('[TRAINING SELECTION] Still', stillRemaining, 'slots remaining, filling with revision songs...');
        selectedRevision = availableRevisionSongs.slice(0, stillRemaining);
        console.log('[TRAINING SELECTION] Added', selectedRevision.length, 'revision songs');

        if (selectedRevision.length < stillRemaining) {
          warnings.push(`Could only find ${selectedDue.length + selectedNew.length + selectedRevision.length} total songs (requested: ${maxSessionLength})`);
        }
      }
    }

    console.log('[TRAINING SELECTION] ----------------------------------------');
    console.log('[TRAINING SELECTION] Selection summary:');
    console.log('[TRAINING SELECTION]   Due songs:', selectedDue.length);
    console.log('[TRAINING SELECTION]   New songs:', selectedNew.length);
    console.log('[TRAINING SELECTION]   Revision songs:', selectedRevision.length);
    console.log('[TRAINING SELECTION]   Total:', selectedDue.length + selectedNew.length + selectedRevision.length);

    // Step 3: Build playlist with detailed song information
    console.log('[TRAINING SELECTION] ----------------------------------------');
    if (selectedDue.length > 0) {
      console.log('[TRAINING SELECTION] Selected Due Songs (' + selectedDue.length + '):');
      selectedDue.forEach((record, idx) => {
        const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
        const daysOverdue = dueDate ? Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 'unknown';
        const stability = record.fsrs_state?.stability?.toFixed(1) ?? 'N/A';
        const difficulty = record.fsrs_state?.difficulty?.toFixed(1) ?? 'N/A';
        const reps = record.fsrs_state?.reps ?? 0;
        const state = this.getStateName(record.fsrs_state?.state);

        console.log(`[TRAINING SELECTION]   ${idx + 1}. ${record.song_key} | ` +
          `overdue: ${daysOverdue} days | stability: ${stability} | difficulty: ${difficulty} | ` +
          `reps: ${reps} | state: ${state}`);
      });
    }

    if (selectedNew.length > 0) {
      console.log('[TRAINING SELECTION] Selected New Songs (' + selectedNew.length + '):');
      selectedNew.forEach((song, idx) => {
        const songKey = `${song.songArtist}_${song.songName}`;
        const anime = song.animeENName || song.animeRomajiName || song.animeEnglishName || 'Unknown';
        const songType = song.songType || 'Unknown';
        console.log(`[TRAINING SELECTION]   ${idx + 1}. ${songKey} | never practiced | ` +
          `anime: ${anime} | type: ${songType}`);
      });
    }

    if (selectedRevision.length > 0) {
      console.log('[TRAINING SELECTION] Selected Revision Songs (' + selectedRevision.length + '):');
      selectedRevision.forEach((record, idx) => {
        const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
        const daysUntilDue = dueDate ? Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 'unknown';
        const stability = record.fsrs_state?.stability?.toFixed(1) ?? 'N/A';
        const difficulty = record.fsrs_state?.difficulty?.toFixed(1) ?? 'N/A';
        const reps = record.fsrs_state?.reps ?? 0;

        console.log(`[TRAINING SELECTION]   ${idx + 1}. ${record.song_key} | ` +
          `due in: ${daysUntilDue} days | stability: ${stability} | difficulty: ${difficulty} | ` +
          `reps: ${reps} | EARLY REVISION`);
      });
    }

    // Combine into playlist, filtering out songs not found in quiz
    const dueSongsWithData = selectedDue
      .map(record => {
        const songData = this.findSongInQuiz(allQuizSongs, record.song_key, record.song_ann_id);
        if (!songData) {
          console.warn(`[TRAINING SELECTION] ⚠ Due song not found in quiz: ${record.song_key} (annId: ${record.song_ann_id})`);
          return null;
        }
        return {
          ...songData,
          song_key: record.song_key,
          progress: record,
          is_new: false,
          selection_reason: 'due'
        };
      })
      .filter(item => item !== null);

    const newSongsWithData = selectedNew.map(song => ({
      ...song,
      song_key: `${song.songArtist}_${song.songName}`,
      progress: null,
      is_new: true,
      selection_reason: 'new'
    }));

    const revisionSongsWithData = selectedRevision
      .map(record => {
        const songData = this.findSongInQuiz(allQuizSongs, record.song_key, record.song_ann_id);
        if (!songData) {
          console.warn(`[TRAINING SELECTION] ⚠ Revision song not found in quiz: ${record.song_key} (annId: ${record.song_ann_id})`);
          return null;
        }
        return {
          ...songData,
          song_key: record.song_key,
          progress: record,
          is_new: false,
          selection_reason: 'revision'
        };
      })
      .filter(item => item !== null);

    const playlist = [
      ...dueSongsWithData,
      ...newSongsWithData,
      ...revisionSongsWithData
    ];

    // Warn if songs were skipped and log details
    const skippedDueSongs = selectedDue.filter(record => {
      const found = this.findSongInQuiz(allQuizSongs, record.song_key, record.song_ann_id);
      return !found;
    });
    const skippedRevisionSongs = selectedRevision.filter(record => {
      const found = this.findSongInQuiz(allQuizSongs, record.song_key, record.song_ann_id);
      return !found;
    });
    const skippedCount = skippedDueSongs.length + skippedRevisionSongs.length;

    if (skippedCount > 0) {
      console.warn(`[TRAINING SELECTION] ⚠ Skipped ${skippedCount} songs that were not found in quiz`);
      console.warn(`[TRAINING SELECTION] ⚠ Skipped Due Songs (${skippedDueSongs.length}):`);
      skippedDueSongs.forEach((record, idx) => {
        console.warn(`[TRAINING SELECTION]   ${idx + 1}. song_key: "${record.song_key}"`);
        console.warn(`[TRAINING SELECTION]      quiz_id: ${record.quiz_id}`);
        console.warn(`[TRAINING SELECTION]      song_ann_id: ${record.song_ann_id}`);
        console.warn(`[TRAINING SELECTION]      fsrs_state:`, JSON.stringify(record.fsrs_state, null, 2));
        console.warn(`[TRAINING SELECTION]      full record:`, JSON.stringify(record, null, 2));
      });

      if (skippedRevisionSongs.length > 0) {
        console.warn(`[TRAINING SELECTION] ⚠ Skipped Revision Songs (${skippedRevisionSongs.length}):`);
        skippedRevisionSongs.forEach((record, idx) => {
          console.warn(`[TRAINING SELECTION]   ${idx + 1}. song_key: "${record.song_key}"`);
          console.warn(`[TRAINING SELECTION]      quiz_id: ${record.quiz_id}`);
          console.warn(`[TRAINING SELECTION]      song_ann_id: ${record.song_ann_id}`);
          console.warn(`[TRAINING SELECTION]      fsrs_state:`, JSON.stringify(record.fsrs_state, null, 2));
          console.warn(`[TRAINING SELECTION]      full record:`, JSON.stringify(record, null, 2));
        });
      }

      console.warn(`[TRAINING SELECTION] ⚠ Total songs in quiz pool: ${allQuizSongs.length}`);
      console.warn(`[TRAINING SELECTION] ⚠ Sample quiz song keys (first 5):`);
      allQuizSongs.slice(0, 5).forEach((song, idx) => {
        const key = `${song.songArtist}_${song.songName}`;
        console.warn(`[TRAINING SELECTION]      ${idx + 1}. "${key}" (annSongId: ${song.annSongId})`);
      });

      warnings.push(`${skippedCount} previously practiced songs are no longer in this quiz`);
    }

    // Shuffle to mix song types
    const shuffled = this.shuffleArray(playlist);

    // Calculate actual percentages using filtered counts
    const actualDuePercentage = playlist.length > 0
      ? Math.round((dueSongsWithData.length / playlist.length) * 100)
      : 0;
    const actualNewPercentage = playlist.length > 0
      ? Math.round((newSongsWithData.length / playlist.length) * 100)
      : 0;
    const actualRevisionPercentage = playlist.length > 0
      ? Math.round((revisionSongsWithData.length / playlist.length) * 100)
      : 0;

    console.log('[TRAINING SELECTION] ----------------------------------------');
    console.log('[TRAINING SELECTION] Final composition:');
    console.log('[TRAINING SELECTION]   ', dueSongsWithData.length, `due (${actualDuePercentage}%),`,
      newSongsWithData.length, `new (${actualNewPercentage}%),`,
      revisionSongsWithData.length, `revision (${actualRevisionPercentage}%)`);
    console.log('[TRAINING SELECTION] ========================================');

    return {
      playlist: shuffled,
      metadata: {
        requested: {
          total: maxSessionLength,
          dueCount: targetDueCount,
          newCount: targetNewCount,
          duePercentage: dueSongPercentage,
          newPercentage: 100 - dueSongPercentage
        },
        actual: {
          total: playlist.length,
          dueCount: dueSongsWithData.length,
          newCount: newSongsWithData.length,
          revisionCount: revisionSongsWithData.length,
          duePercentage: actualDuePercentage,
          newPercentage: actualNewPercentage,
          revisionPercentage: actualRevisionPercentage
        },
        available: {
          dueCount: availableDueSongs.length,
          newCount: availableNewSongs.length,
          revisionCount: availableRevisionSongs.length,
          totalPoolSize: allQuizSongs.length
        },
        warnings: warnings
      }
    };
  }

  /**
   * Get human-readable state name
   * @param {number} state - FSRS state number
   * @returns {string} State name
   */
  getStateName(state) {
    switch (state) {
      case State.New: return 'New';
      case State.Learning: return 'Learning';
      case State.Review: return 'Review';
      case State.Relearning: return 'Relearning';
      default: return 'Unknown';
    }
  }

  /**
   * Find a song in the quiz by song_key or annSongId
   * @param {Array} allQuizSongs - All songs in quiz
   * @param {string} songKey - Song key to find (Artist_SongName format)
   * @param {number} annSongId - Optional AMQ song ID for better matching
   * @returns {Object|null} Song object or null
   */
  findSongInQuiz(allQuizSongs, songKey, annSongId = null) {
    // Try matching by annSongId first (most reliable)
    if (annSongId) {
      const byId = allQuizSongs.find(song => song.annSongId === annSongId);
      if (byId) {
        return byId;
      }
    }

    // Fallback to matching by songKey format
    return allQuizSongs.find(song => {
      const key = `${song.songArtist}_${song.songName}`;
      return key === songKey;
    }) || null;
  }

  /**
   * Fisher-Yates shuffle algorithm
   * @param {Array} array - Array to shuffle
   * @returns {Array} Shuffled array
   */
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Update card state after an attempt
   * @param {Object} currentState - Current FSRS state
   * @param {number} rating - User rating (1-4)
   * @returns {Object} Updated FSRS state
   */
  updateCardState(currentState, rating) {
    const now = new Date();

    // If no current state, create new card
    if (!currentState || !currentState.due) {
      const newCard = this.createNewCard('');
      return this.scheduleNext(newCard, rating, now);
    }

    // Update existing card
    return this.scheduleNext(currentState, rating, now);
  }

  /**
   * Calculate mastery level based on FSRS state
   * @param {Object} fsrsState - FSRS card state
   * @returns {string} Mastery level: 'new', 'learning', 'review', 'mastered'
   */
  getMasteryLevel(fsrsState) {
    if (!fsrsState || !fsrsState.state) {
      return 'new';
    }

    // FSRS States: 0=New, 1=Learning, 2=Review, 3=Relearning
    switch (fsrsState.state) {
      case State.New:
        return 'new';
      case State.Learning:
      case State.Relearning:
        return 'learning';
      case State.Review:
        // Consider mastered if stability > 100 days and low difficulty
        if (fsrsState.stability > 100 && fsrsState.difficulty < 5) {
          return 'mastered';
        }
        return 'review';
      default:
        return 'new';
    }
  }

  /**
   * Get review forecast for upcoming days
   * @param {Array} progressRecords - Array of training_progress records
   * @param {number} days - Number of days to forecast (default 7)
   * @returns {Array} Array of {date, count} for each day
   */
  getForecast(progressRecords, days = 7) {
    const now = new Date();
    const forecast = [];

    for (let i = 0; i < days; i++) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + i);
      targetDate.setHours(23, 59, 59, 999); // End of day

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const count = progressRecords.filter(record => {
        const dueDate = record.fsrs_state?.due ? new Date(record.fsrs_state.due) : null;
        if (!dueDate) return false;

        return dueDate >= startOfDay && dueDate <= targetDate;
      }).length;

      forecast.push({
        date: targetDate.toISOString().split('T')[0],
        count
      });
    }

    return forecast;
  }
}

/**
 * Singleton instance for easy access
 */
export const trainingScheduler = new TrainingScheduler();

