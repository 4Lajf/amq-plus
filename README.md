# AMQ Plus

**AMQ Plus** is an advanced lobby settings editor for [Anime Music Quiz (AMQ)](https://animemusicquiz.com/). Create custom quiz configurations using a powerful visual node-based editor that goes beyond the game's built-in options.

## What is AMQ Plus?

AMQ Plus provides a visual, drag-and-drop interface for designing complex AMQ lobby configurations. Using a node-based editor, you can:

- **Create Custom Quiz Configurations** - Design advanced settings with filters, routing, and modifiers
- **Visual Node Editor** - Drag and connect nodes to build your quiz flow
- **Advanced Filtering** - Filter songs by type, genre, tags, vintage era, difficulty, player score, and more
- **Probabilistic Routing** - Create multiple quiz paths with weighted probabilities
- **Custom Playlists** - Build personalized song lists from your favorite tracks
- **Configuration Simulation** - Preview how your settings will resolve before exporting
- **User List Integration** - Import lists from AniList and MyAnimeList

## ⚠️ Important Note About Masterlist

**The `src/lib/server/masterlist.json` file in this repository is a sample version** containing only 1,000 entries for development and testing purposes.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v24
- **Docker** or Docker Desktop (required for Supabase local development)

## Local Development Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd amq-plus
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Rename the `.env.example` file to `.env` and fill it with your local configuration.

#### Environment Variable Requirements

Here's what breaks if specific environment variables are missing:

**Required for Core Functionality:**
- `PUBLIC_SUPABASE_URL` & `PUBLIC_SUPABASE_PUBLISHABLE_KEY` - App won't start without these. Required for database access, authentication, and all data operations.
- `SUPABASE_SECRET_KEY` - Required for server-side admin operations (creating quizzes, managing song lists, user list caching).

**Optional - External Service Integration:**

- `MAL_CLIENT_ID` - **MyAnimeList Integration**:
  - ❌ Cannot import user lists from MyAnimeList
  - ❌ Cannot use MAL username in batch user list nodes
  - ❌ MAL user list caching will fail
  - ✅ AniList integration still works
  - ✅ All other features work normally

- `MAL_CLIENT_SECRET` - **Not currently used**

- `PIXELDRAIN_API_KEY` - **File Storage**:
  - ❌ Cannot create or save custom song lists
  - ❌ Cannot upload user list cache data to Pixeldrain
  - ❌ Cannot fetch song lists from storage (existing lists won't load)
  - ✅ Quiz creation and editing still works (uses masterlist)
  - ✅ AniList/MAL import still works (but won't cache to Pixeldrain)

- `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID` & `SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET` - **Discord OAuth**:
  - ❌ Cannot save quizzes to account
  - ❌ Cannot create/manage song lists
  - ❌ Cannot favorite quizzes or lists
  - ✅ All features work without authentication (temporary quizzes, local storage)
  - ✅ Public quizzes can still be viewed and played

**Note**: For local development, you can start with just Supabase variables. Other services are only needed if you want to test those specific features.

### 4. Start Supabase Locally

```bash
# Start Supabase services (this will start Docker containers)
supabase start

# Get your local credentials
supabase status
```

Copy the `API URL`, `Publishable key` and `Secret key` from the output to your `.env` file:
- `PUBLIC_SUPABASE_URL` = API URL
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY` = publishable key
- `SUPABASE_SECRET_KEY` = secret key

### 5. Run Database Migrations

```bash
# Reset database and apply migrations
supabase db reset
```

### 6. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 7. Access Supabase Studio (Optional)

Supabase Studio provides a web interface to manage your local database:

```
http://127.0.0.1:54323
```

## Building for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview
```

## Contributing

**Read the Contribution Guide**: See [`_FEATURE_IMPLEMENTATION_EXAMPLE.md`](./_FEATURE_IMPLEMENTATION_EXAMPLE.md) for a comprehensive guide on architecture overview and a guide on how to add new features.