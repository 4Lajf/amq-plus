# AMQ Plus

**AMQ Plus** helps [Anime Music Quiz (AMQ)](https://animemusicquiz.com/) players build quizzes, curate reusable song lists, and practice songs with spaced repetition through the AMQ+ Connector.

## What is AMQ Plus?

The default path is deliberately simple: choose a playable starter, save it, and generate its songs. The builder also exposes advanced filters, multiple weighted routes, and source composition when you need them.

- **Quiz builder** — create a simple quiz or combine filters, sources, weighted routes, and modifiers.
- **Song lists** — search, import, curate, share, and reuse collections.
- **Training** — practice due and new songs in AMQ and inspect progress on the website.
- **User-list integration** — use AniList and MyAnimeList data as quiz sources.
- **AMQ+ Connector** — take saved quizzes and training sessions into AMQ.

Most creation and training data is stored under a Discord sign-in. Guest quizzes are temporary and expire after 72 hours without play.

## Song database

`src/lib/server/masterlist.json` is the application song database and currently contains about 38,200 entries. It is large, so expect the first server build and some filter tests to use substantial memory.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 22 or newer
- **Docker** or Docker Desktop (required for Supabase local development)

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/4Lajf/amq-plus.git
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

**Required for core functionality:**

- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` — database and authentication client configuration.
- `SUPABASE_SECRET_KEY` — server-side quiz, song-list, cache, and training operations. Never expose it to browser code.

**Optional - External Service Integration:**

- `MAL_CLIENT_ID` - **MyAnimeList Integration**:
  - ❌ Cannot import user lists from MyAnimeList
  - ❌ Cannot use MAL username in batch user list nodes
  - ❌ MAL user list caching will fail
  - ✅ AniList integration still works
  - ✅ All other features work normally

- `MAL_CLIENT_SECRET` — currently unused.

- `PIXELDRAIN_API_KEY` - **File Storage**:
  - ❌ Cannot create or save custom song lists
  - ❌ Cannot upload user list cache data to Pixeldrain
  - ❌ Cannot fetch song lists from storage (existing lists won't load)
  - ✅ Quiz creation and editing still works (uses masterlist)
  - ✅ AniList/MAL import still works (but won't cache to Pixeldrain)

- `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET` - **Discord OAuth**:
  - ❌ Cannot save quizzes to account
  - ❌ Cannot create/manage song lists
  - ❌ Cannot favorite quizzes or lists
  - ✅ Guests can create temporary quizzes and browse public content
  - ✅ Public quizzes can still be viewed and played

  Song-list creation, favourites, persistent quizzes, and training require sign-in.

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

> **Deploying to production: migrations go first, always.**
>
> Server routes `select` columns by name, so code that names a column its
> database does not have yet fails the whole query rather than degrading. The
> training page selects `daily_new_limit`; deployed against a database without
> it, PostgREST answers `42703` for every user and the page is down until the
> migration lands.
>
> Some migrations under `supabase/migrations/` are deliberately held back and
> say so in their header comment (`NOT YET APPLIED`, `NOT APPLIED. Applying is
the owner's call`) — those change user-visible scheduling or quiz settings and
> are meant to be run when you are ready to announce them.
>
> **`supabase db push` applies every pending migration, including those.** It is
> the wrong command when any held-back file is outstanding; apply the ones you
> want individually instead. To see what production is actually missing:
>
> ```bash
> supabase migration list --linked
> ```

For the current production drift and reviewed rollout order, read
[`docs/TESTING.md`](docs/TESTING.md) before applying anything.

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

See [`_FEATURE_IMPLEMENTATION_EXAMPLE.md`](./_FEATURE_IMPLEMENTATION_EXAMPLE.md) for how to add a filter (client registry, editor form, server `FILTER_REGISTRY`). Or copy an existing definition under `src/lib/filters/definitions/`.
