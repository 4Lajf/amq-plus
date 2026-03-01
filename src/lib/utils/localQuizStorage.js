/**
 * Local Storage utility for managing quizzes in the browser
 * @module lib/utils/localQuizStorage
 */

const STORAGE_KEY = 'amq_plus_local_quizzes';
const STORAGE_VERSION = 1;

/** @typedef {import('../../types/types.js').QuizConfigurationData} QuizConfigurationData */
/** @typedef {import('../../types/types.js').LocalQuiz} LocalQuiz */
/** @typedef {import('../../types/types.js').CreateLocalQuizData} CreateLocalQuizData */
/** @typedef {import('../../types/types.js').DatabaseQuizData} DatabaseQuizData */
/** @typedef {import('../../types/types.js').LocalQuizUpdates} LocalQuizUpdates */

/**
 * Get all local quizzes from storage
 * @returns {LocalQuiz[]}
 */
export function getAllLocalQuizzes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const data = JSON.parse(stored);

    // Validate version
    if (data.version !== STORAGE_VERSION) {
      console.warn('Local storage version mismatch, clearing old data');
      clearAllLocalQuizzes();
      return [];
    }

    return data.quizzes || [];
  } catch (error) {
    console.error('Error reading local quizzes:', error);
    return [];
  }
}

/**
 * Save all quizzes to storage
 * @param {LocalQuiz[]} quizzes - Array of quizzes to save
 */
function saveAllLocalQuizzes(quizzes) {
  try {
    const data = {
      version: STORAGE_VERSION,
      quizzes: quizzes
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving local quizzes:', error);
    throw new Error('Failed to save quiz to local storage');
  }
}

/**
 * Create a new local quiz
 * @param {CreateLocalQuizData} quizData
 * @returns {LocalQuiz}
 */
export function createLocalQuiz(quizData) {
  const { name, description, configuration_data, creator_username } = quizData;

  const now = Date.now();
  const id = `local_${now}_${Math.random().toString(36).substr(2, 9)}`;

  const quiz = {
    id,
    name: name.trim(),
    description: description?.trim() || null,
    configuration_data,
    creator_username: creator_username || 'Guest',
    share_token: generateLocalToken(),
    play_token: generateLocalToken(),
    created_at: now,
    updated_at: now
  };

  const quizzes = getAllLocalQuizzes();
  quizzes.push(quiz);
  saveAllLocalQuizzes(quizzes);

  return quiz;
}

/**
 * Update an existing local quiz
 * @param {string} id
 * @param {LocalQuizUpdates} updates
 * @returns {LocalQuiz|null}
 */
export function updateLocalQuiz(id, updates) {
  const quizzes = getAllLocalQuizzes();
  const index = quizzes.findIndex(q => q.id === id);

  if (index === -1) return null;

  const updatedQuiz = {
    ...quizzes[index],
    ...updates,
    updated_at: Date.now()
  };

  quizzes[index] = updatedQuiz;
  saveAllLocalQuizzes(quizzes);

  return updatedQuiz;
}

/**
 * Delete a local quiz
 * @param {string} id - Quiz ID
 * @returns {boolean} True if deleted, false if not found
 */
export function deleteLocalQuiz(id) {
  const quizzes = getAllLocalQuizzes();
  const filtered = quizzes.filter(q => q.id !== id);

  if (filtered.length === quizzes.length) return false;

  saveAllLocalQuizzes(filtered);
  return true;
}

/**
 * Get a local quiz by ID
 * @param {string} id - Quiz ID
 * @returns {LocalQuiz|null} Quiz or null if not found
 */
export function getLocalQuiz(id) {
  const quizzes = getAllLocalQuizzes();
  return quizzes.find(q => q.id === id) || null;
}

/**
 * Get a local quiz by share token
 * @param {string} token - Share token
 * @returns {LocalQuiz|null} Quiz or null if not found
 */
export function getLocalQuizByShareToken(token) {
  const quizzes = getAllLocalQuizzes();
  return quizzes.find(q => q.share_token === token) || null;
}

/**
 * Get a local quiz by play token
 * @param {string} token - Play token
 * @returns {LocalQuiz|null} Quiz or null if not found
 */
export function getLocalQuizByPlayToken(token) {
  const quizzes = getAllLocalQuizzes();
  return quizzes.find(q => q.play_token === token) || null;
}

/**
 * Clear all local quizzes
 */
export function clearAllLocalQuizzes() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Generate a local token
 * @returns {string} Random token
 */
function generateLocalToken() {
  return Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
}

/**
 * Get storage stats
 * @returns {Object} Storage statistics
 */
export function getLocalQuizStats() {
  const quizzes = getAllLocalQuizzes();
  const totalSize = JSON.stringify(getAllLocalQuizzes()).length;

  return {
    count: quizzes.length,
    totalSize: totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
  };
}

/**
 * Store or update a database-linked quiz in localStorage
 * @param {DatabaseQuizData & {is_temporary?: boolean, is_public?: boolean}} quizData
 * @returns {LocalQuiz}
 */
export function storeDatabaseQuiz(quizData) {
  const {
    id: database_id,
    name,
    description,
    configuration_data,
    creator_username,
    share_token,
    play_token,
    is_temporary = false,
    is_public = false
  } = quizData;

  const quizzes = getAllLocalQuizzes();

  // Check if this quiz already exists in localStorage (by database_id)
  const existingIndex = quizzes.findIndex(q => q.database_id === database_id);

  const localQuiz = {
    id: `db_${database_id}`,
    name: name.trim(),
    description: description?.trim() || null,
    configuration_data,
    creator_username: creator_username || 'Guest',
    share_token,
    play_token,
    created_at: Date.now(),
    updated_at: Date.now(),
    database_id,
    is_temporary,
    is_public
  };

  if (existingIndex !== -1) {
    // Update existing quiz
    localQuiz.created_at = quizzes[existingIndex].created_at;
    quizzes[existingIndex] = localQuiz;
  } else {
    // Add new quiz
    quizzes.push(localQuiz);
  }

  saveAllLocalQuizzes(quizzes);
  return localQuiz;
}

/**
 * Get a local quiz by database ID
 * @param {string} databaseId - Database quiz ID
 * @returns {LocalQuiz|null} Quiz or null if not found
 */
export function getLocalQuizByDatabaseId(databaseId) {
  const quizzes = getAllLocalQuizzes();
  return quizzes.find(q => q.database_id === databaseId) || null;
}

/**
 * Get all quizzes linked to the database
 * @returns {LocalQuiz[]} Array of database-linked quizzes
 */
export function getDatabaseLinkedQuizzes() {
  const quizzes = getAllLocalQuizzes();
  return quizzes.filter(q => q.database_id);
}

/**
 * Update share_token for a quiz
 * @param {string} databaseId - Database quiz ID
 * @param {string} newShareToken - New share token
 * @returns {boolean} True if updated, false if quiz not found
 */
export function updateLocalQuizShareToken(databaseId, newShareToken) {
  const quizzes = getAllLocalQuizzes();
  const quiz = quizzes.find(q => q.database_id === databaseId);

  if (!quiz) {
    return false;
  }

  quiz.share_token = newShareToken;
  quiz.updated_at = Date.now();

  saveAllLocalQuizzes(quizzes);
  return true;
}

/**
 * Update play_token for a quiz
 * @param {string} databaseId - Database quiz ID
 * @param {string} newPlayToken - New play token
 * @returns {boolean} True if updated, false if quiz not found
 */
export function updateLocalQuizPlayToken(databaseId, newPlayToken) {
  const quizzes = getAllLocalQuizzes();
  const quiz = quizzes.find(q => q.database_id === databaseId);

  if (!quiz) {
    return false;
  }

  quiz.play_token = newPlayToken;
  quiz.updated_at = Date.now();

  saveAllLocalQuizzes(quizzes);
  return true;
}

/**
 * Remove a database-linked quiz from localStorage
 * @param {string} databaseId - Database quiz ID
 * @returns {boolean} True if removed, false if not found
 */
export function removeDatabaseQuiz(databaseId) {
  const quizzes = getAllLocalQuizzes();
  const filtered = quizzes.filter(q => q.database_id !== databaseId);

  if (filtered.length === quizzes.length) return false;

  saveAllLocalQuizzes(filtered);
  return true;
}

