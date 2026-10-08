/**
 * User list expansion utilities
 * Handles expansion of batch user list nodes and live nodes into individual sources
 * 
 * @module lib/server/utils/userListExpansion
 */

/**
 * Expand a user list node (batch-user-list or live-node) into individual user entries
 * @param {Object} settings - Node settings
 * @param {string} nodeType - Node type ('batch-user-list' or 'live-node')
 * @param {string} listInfoPrefix - Prefix for list info string ('Batch User List' or 'Live Node')
 * @returns {Array<{settings: Object, percentage: number|null, listInfo: string}>} Array of expanded entries
 */
export function expandUserListNode(settings, nodeType, listInfoPrefix) {
  const expanded = [];
  const hasNodeLevelPercentage = settings.songPercentage !== null && settings.songPercentage !== undefined;
  const hasPerUserPercentages = settings.userEntries.some(entry => entry.songPercentage !== null && entry.songPercentage !== undefined);

  if (hasNodeLevelPercentage && hasPerUserPercentages) {
    // Both node-level and per-user percentages: expand each user with combined percentage
    // After simulation, all percentages are plain numbers
    const nodeLevelPercentage = Number(settings.songPercentage);

    for (let i = 0; i < settings.userEntries.length; i++) {
      const userEntry = settings.userEntries[i];
      
      // Always include user for overlap calculation, even if percentage is 0
      const userPercentage = userEntry.songPercentage ? Number(userEntry.songPercentage) : 0;

      // Calculate combined percentage (multiply node-level by per-user)
      const combinedPercentage = (nodeLevelPercentage / 100) * (userPercentage / 100) * 100;

      expanded.push({
        settings: {
          nodeId: `${settings.nodeId}-user-${i}`,
          nodeType: nodeType,
          mode: 'user-lists',
          useEntirePool: settings.useEntirePool || false,
          userListImport: {
            platform: userEntry.platform || 'anilist',
            username: userEntry.username || '',
            selectedLists: userEntry.selectedLists || {
              completed: true,
              watching: true,
              planning: false,
              on_hold: false,
              dropped: false
            }
          }
        },
        percentage: combinedPercentage,
        listInfo: `${listInfoPrefix} - ${userEntry.username || (nodeType === 'live-node' ? `Player ${i + 1}` : `User ${i + 1}`)}`
      });
    }
  } else if (hasNodeLevelPercentage) {
    // Only node-level percentage: treat entire batch node as single source
    // The node-level percentage applies to the entire batch, not individual users
    console.log(`[EXPANSION] ${listInfoPrefix} - Node-level percentage only - treating entire node as single source with ${settings.songPercentage}%`);

    // Expand all users but use the same nodeId (not user-specific) so they're grouped together
    // All songs from these users will be tagged with the batch node ID
    // The percentage will be applied at the batch level in songsBySource
    for (let i = 0; i < settings.userEntries.length; i++) {
      const userEntry = settings.userEntries[i];
      expanded.push({
        settings: {
          nodeId: settings.nodeId, // Use original nodeId, not user-specific
          nodeType: nodeType,
          mode: 'user-lists',
          useEntirePool: settings.useEntirePool || false,
          userListImport: {
            platform: userEntry.platform || 'anilist',
            username: userEntry.username || '',
            selectedLists: userEntry.selectedLists || {
              completed: true,
              watching: true,
              planning: false,
              on_hold: false,
              dropped: false
            }
          }
        },
        percentage: null, // No per-user percentage - will be set at batch level in songsBySource
        listInfo: `${listInfoPrefix} - ${userEntry.username || (nodeType === 'live-node' ? `Player ${i + 1}` : `User ${i + 1}`)}`
      });
    }
  } else if (hasPerUserPercentages) {
    // Only per-user percentages: expand each user entry into a separate source
    // After simulation, all percentages are plain numbers
    // Include ALL users for overlap calculation, even those with 0%
    for (let i = 0; i < settings.userEntries.length; i++) {
      const userEntry = settings.userEntries[i];
      
      // Always include user for overlap calculation, even if percentage is 0
      const userPercentage = userEntry.songPercentage ? Number(userEntry.songPercentage) : 0;

      expanded.push({
        settings: {
          nodeId: `${settings.nodeId}-user-${i}`,
          nodeType: nodeType,
          mode: 'user-lists',
          useEntirePool: settings.useEntirePool || false,
          userListImport: {
            platform: userEntry.platform || 'anilist',
            username: userEntry.username || '',
            selectedLists: userEntry.selectedLists || {
              completed: true,
              watching: true,
              planning: false,
              on_hold: false,
              dropped: false
            }
          }
        },
        percentage: userPercentage, // Plain number after simulation (can be 0)
        listInfo: `${listInfoPrefix} - ${userEntry.username || (nodeType === 'live-node' ? `Player ${i + 1}` : `User ${i + 1}`)}`
      });
    }
  } else {
    // No percentages: expand without percentage constraints
    // Use null for all cases, which means no percentage constraint (0-100% range)
    // This allows songs from any user to be selected freely based on other filters
    const defaultPercentage = null;

    if (nodeType === 'batch-user-list') {
      if (settings.userEntries.length === 1) {
        console.log(`[EXPANSION] No percentages set - single user gets 100% allocation`);
      } else {
        console.log(`[EXPANSION] No percentages set - using default random distribution (0-100% for each user)`);
      }
    }

    for (let i = 0; i < settings.userEntries.length; i++) {
      const userEntry = settings.userEntries[i];
      expanded.push({
        settings: {
          nodeId: `${settings.nodeId}-user-${i}`,
          nodeType: nodeType,
          mode: 'user-lists',
          useEntirePool: settings.useEntirePool || false,
          userListImport: {
            platform: userEntry.platform || 'anilist',
            username: userEntry.username || '',
            selectedLists: userEntry.selectedLists || {
              completed: true,
              watching: true,
              planning: false,
              on_hold: false,
              dropped: false
            }
          }
        },
        percentage: defaultPercentage,
        listInfo: `${listInfoPrefix} - ${userEntry.username || (nodeType === 'live-node' ? `Player ${i + 1}` : `User ${i + 1}`)}`
      });
    }
  }

  return expanded;
}

