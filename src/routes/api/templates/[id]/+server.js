/**
 * Templates API endpoint for loading specific template quizzes.
 * Loads templates by ID regardless of public status for template loader functionality.
 *
 * @module api/templates/[id]
 */

import { json, error } from '@sveltejs/kit';
import { createSupabaseAdmin } from '$lib/server/supabase-admin.js';

/**
 * GET /api/templates/[id]
 * Fetches a specific template quiz by its ID.
 * This endpoint bypasses public/private restrictions for template loading.
 *
 * @param {Object} params - Request parameters
 * @param {Object} params.params - Route parameters
 * @param {string} params.params.id - Template quiz ID
 * @returns {Promise<Response>} Load response with configuration data
 */
export async function GET({ params }) {
  try {
    const supabaseAdmin = createSupabaseAdmin();

    // Template IDs that should be accessible as templates
    const allowedTemplateIds = [
      '0c27d99e-2a2c-459c-9786-99502ead9c68', // template-1
      '841e6154-5473-4981-81d2-253a256e67f6', // template-2
      'e88e6b4c-df74-4223-815a-d89ce36a4867'  // template-3
    ];

    // Check if the requested ID is in the allowed template IDs
    if (!allowedTemplateIds.includes(params.id)) {
      return error(404, { message: 'Template not found' });
    }

    // Fetch the template quiz configuration (bypassing public/private restrictions)
    const { data: quizData, error: dbError } = await supabaseAdmin
      .from('quiz_configurations')
      .select('id, user_id, name, description, is_public, configuration_data, creator_username')
      .eq('id', params.id)
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return error(404, { message: 'Template configuration not found' });
    }

    // Embedded metadata for each template
    const templateMetadata = {
      '0c27d99e-2a2c-459c-9786-99502ead9c68': {
        name: "Basic Linear Flow",
        description: "A comprehensive template showcasing all filter types in a simple linear sequence. Perfect for beginners learning the editor.\n\n• Linear flow through all major filter types\n• All filters use default settings for easy customization\n• Demonstrates the complete filtering pipeline",
        nodeCount: 12,
        isTemplate: true,
        detailedExplanation: "This template demonstrates the fundamental quiz configuration structure in AMQ+. It shows how to build a complete filtering pipeline from start to finish.\n\n**Flow Structure:**\n1. **Song List** - Defines the source pool (entire database by default)\n2. **Basic Settings** - Core game settings (guess time, sample point, etc.)\n3. **Songs & Types** - Splits between openings/endings/inserts and watched/random\n4. **Anime Type** - Filters by format (TV, Movie, OVA, etc.)\n5. **Vintage** - Filters by release year/season\n6. **Song Difficulty** - Controls difficulty distribution\n7. **Player Score** - Filters based on user ratings (requires user list)\n8. **Anime Score** - Filters by AniList ratings\n9. **Song Categories** - Filters by category (Standard, Character, etc.)\n10. **Genres** - Include/exclude/optional genre filtering\n11. **Tags** - Include/exclude/optional tag filtering\n12. **Number of Songs** - Final song count"
      },
      '841e6154-5473-4981-81d2-253a256e67f6': {
        name: "Random Execution Chances",
        description: "Demonstrates random node execution chances for creating dynamic quiz variations.\n\n• Multiple nodes with different execution chance percentages\n• Random selection of which nodes execute each simulation\n• Creates variety without complex routing logic",
        nodeCount: 15,
        isTemplate: true,
        detailedExplanation: "⚠️ **IMPORTANT WARNING:** This template is for demonstration purposes only. Due to its complex filter configurations and advanced setup, it will fail to match any songs when played. Use this template to learn about execution chances, then modify the filters to create a working quiz.\n\n---\n\nThis template showcases random execution chances, a powerful feature for creating dynamic quiz configurations.\n\n**Execution Chance System:**\nEach node has an execution chance (default 100%) that determines if it will be used during quiz generation. By default, all node instances execute, but when execution chance is applied, nodes execute randomly based on their configured chances.\n\n**Execution Chance Types:**\n- **Static Value:** Fixed percentage (e.g., 75% = executes 75% of the time)\n- **Range:** Random percentage within range (e.g., 50-100% = executes 50-100% of the time randomly)\n\n**Template Structure:**\n1. **Song List** - Source pool\n2. **Basic Settings A** - Configuration variant 1 (70% execution chance)\n3. **Basic Settings B** - Configuration variant 2 (30% execution chance)\n4. **Filter Nodes** - Various filters with different execution chances\n5. **Number of Songs** - Final song count\n\n**How It Works:**\n- **Node Executes (passes chance roll):** The node's configured settings are used in the final quiz configuration\n- **Node Fails (fails chance roll):** The system tries other instances of the same type. If all instances of a required category fail, one available instance is randomly selected to ensure coverage\n\n**To Set Execution Chance:** Right-click any node → \"Set Execution Chance\""
      },
      'e88e6b4c-df74-4223-815a-d89ce36a4867': {
        name: "Router & Modifier Nodes",
        description: "Advanced template featuring router-based branching and modifier nodes for complex quiz configurations.\n\n• Router node with multiple distinct routes\n• Selection Modifier nodes controlling execution\n• Advanced filter configurations with modifiers\n• Demonstrates complex flow control and dynamic behavior",
        nodeCount: 25,
        isTemplate: true,
        detailedExplanation: "⚠️ **IMPORTANT WARNING:** This template is for demonstration purposes only. Due to its complex filter configurations and advanced setup, it will fail to match any songs when played. Use this template to learn about Router and Modifier nodes, then modify the filters to create a working quiz.\n\n---\n\nThis template demonstrates advanced quiz configuration using Router nodes and Modifier nodes to create sophisticated, dynamic quizes.\n\n**Router System:**\nThe Router node randomly selects ONE route to execute, creating entirely different quiz configurations from the same setup. Each route can have completely different settings and behaviors.\n\n**Modifier Nodes:**\nSelection Modifier nodes control how many instances of connected nodes execute, adding another layer of dynamic behavior within each route.\n\n**Template Architecture:**\n\n**Route 1 - Competitive Mode (50% chance):**\n- Focuses on challenging, skill-testing configurations\n- Song List → Basic Settings (competitive) → Modifier → Filters...\n- **Modifier Controls:**\n  - Selection Modifier limits filter execution\n  - Only specific filters run per simulation\n- **Filters:**\n  - Only openings (100%)\n  - Advanced difficulty ranges (mostly hard songs)\n  - High anime scores only (7-10)\n  - Specific genre requirements\n- **Result:** 30 challenging opening songs\n\n**Route 2 - Casual Mode (50% chance):**\n- Balanced, accessible configuration for all players\n- Song List → Basic Settings (casual) → Modifier → Filters...\n- **Modifier Controls:**\n  - Different Selection Modifier settings\n  - More flexible filter combinations\n- **Filters:**\n  - All song types (inserts included)\n  - Balanced difficulty distribution\n  - Wider score ranges\n  - Genre flexibility\n- **Result:** 25 varied songs across types\n\n**Advanced Features Demonstrated:**\n\n1. **Router-Based Branching:**\n   - Two distinct quiz modes\n   - Random selection between routes\n   - Complete configuration separation\n\n2. **Selection Modifier Usage:**\n   - Controls filter execution within routes\n   - Creates sub-variation within each route\n   - Different modifier settings per route\n\n3. **Route-Specific Configurations:**\n   - Different Basic Settings per route\n   - Unique filter combinations\n   - Varied song counts and difficulty\n\n4. **Dynamic Behavior:**\n   - Random route selection\n   - Modifier-controlled execution\n   - Multiple layers of variation\n\n**Learning Objectives:**\n- Understand router-based branching\n- Learn Selection Modifier functionality\n- Master advanced filter settings\n- Combine routers with modifiers\n- Create complex dynamic configurations\n\n**Practical Applications:**\n- Tournament vs. practice modes\n- Difficulty tiers with modifiers\n- Theme variations with dynamic filters\n- Player skill-based routing\n- Event-specific configurations\n\n**Customization Strategies:**\n\n1. **Add More Routes:**\n   - 3-4 routes for more variety\n   - Adjust route probabilities\n   - Create specialized modes\n\n2. **Enhance Modifiers:**\n   - Add more Selection Modifiers\n   - Create modifier chains\n   - Experiment with different settings\n\n3. **Nested Complexity:**\n   - Add sub-routers within routes\n   - Create modifier hierarchies\n   - Build decision trees\n\n4. **Advanced Combinations:**\n   - Combine routers with execution chances\n   - Layer multiple modifier types\n   - Create maximum configuration diversity\n\n**Common Pitfalls to Avoid:**\n- Don't forget to connect all route paths\n- Ensure each route has proper modifiers\n- Balance route probabilities\n- Test each route independently\n- Avoid disconnected nodes\n\n**Pro Tips:**\n- Use route badges to track complex flows\n- Name routes and modifiers descriptively\n- Document configuration differences\n- Test modifier behavior thoroughly\n- Consider execution chances for fine-tuning"
      }
    };

    const metadata = templateMetadata[params.id] || null;

    return json({
      configuration_data: quizData.configuration_data,
      name: quizData.name,
      description: quizData.description,
      is_public: quizData.is_public,
      creator_username: quizData.creator_username,
      metadata: metadata
    });
  } catch (err) {
    console.error('Error loading template configuration:', err);
    return error(500, { message: 'Failed to load template configuration' });
  }
}
