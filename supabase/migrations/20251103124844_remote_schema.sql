


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."cleanup_all_expired_cache"() RETURNS TABLE("deleted_count" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM user_list_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN QUERY SELECT deleted;
END;
$$;


ALTER FUNCTION "public"."cleanup_all_expired_cache"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_all_expired_cache"() IS 'Deletes all expired cache entries. Should be called periodically (e.g., via pg_cron daily).';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Delete all expired cache entries for this user/platform/username
  DELETE FROM user_list_cache
  WHERE user_id = NEW.user_id
    AND platform = NEW.platform
    AND username = NEW.username
    AND expires_at < NOW();
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_cache"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_cache"() IS 'Automatically deletes expired cache entries for the same user/platform/username before insert/update';



CREATE OR REPLACE FUNCTION "public"."clear_user_cache"("p_user_id" "uuid", "p_platform" "text", "p_username" "text", "p_status" "text" DEFAULT NULL::"text") RETURNS TABLE("deleted_count" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  deleted INTEGER;
BEGIN
  IF p_status IS NOT NULL THEN
    -- Clear specific status
    DELETE FROM user_list_cache
    WHERE user_id = p_user_id
      AND platform = p_platform
      AND username = p_username
      AND status = p_status;
  ELSE
    -- Clear all statuses for this user/platform/username
    DELETE FROM user_list_cache
    WHERE user_id = p_user_id
      AND platform = p_platform
      AND username = p_username;
  END IF;
  
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN QUERY SELECT deleted;
END;
$$;


ALTER FUNCTION "public"."clear_user_cache"("p_user_id" "uuid", "p_platform" "text", "p_username" "text", "p_status" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."clear_user_cache"("p_user_id" "uuid", "p_platform" "text", "p_username" "text", "p_status" "text") IS 'Clears cache entries for a user/platform/username. Optionally specify status to clear only that status.';



CREATE OR REPLACE FUNCTION "public"."get_cached_statuses"("p_user_id" "uuid", "p_platform" "text", "p_username" "text") RETURNS TABLE("status" "text", "anime_count" integer, "songs_count" integer, "expires_at" timestamp with time zone, "is_expired" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ulc.status,
    ulc.anime_count,
    ulc.songs_count,
    ulc.expires_at,
    (ulc.expires_at < NOW()) as is_expired
  FROM user_list_cache ulc
  WHERE ulc.user_id = p_user_id
    AND ulc.platform = p_platform
    AND ulc.username = p_username;
END;
$$;


ALTER FUNCTION "public"."get_cached_statuses"("p_user_id" "uuid", "p_platform" "text", "p_username" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_cached_statuses"("p_user_id" "uuid", "p_platform" "text", "p_username" "text") IS 'Returns all cached statuses for a given user/platform/username with expiration info';



CREATE OR REPLACE FUNCTION "public"."touch_cache_entry"("cache_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE user_list_cache
  SET last_accessed_at = NOW()
  WHERE id = cache_id;
END;
$$;


ALTER FUNCTION "public"."touch_cache_entry"("cache_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."touch_cache_entry"("cache_id" "uuid") IS 'Updates last_accessed_at timestamp for a cache entry. Call this when reading from cache.';



CREATE OR REPLACE FUNCTION "public"."update_quiz_configurations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_quiz_configurations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."quiz_configurations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "is_public" boolean DEFAULT false,
    "configuration_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "creator_username" "text" NOT NULL,
    "is_temporary" boolean DEFAULT false,
    "last_played_at" timestamp with time zone,
    "share_token" "text",
    "play_token" "text",
    "allow_remixing" boolean DEFAULT false,
    "quiz_metadata" "jsonb"
);


ALTER TABLE "public"."quiz_configurations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_quiz_configurations" WITH ("security_invoker"='on') AS
 SELECT "id",
    "name",
    "description",
    "created_at",
    "updated_at",
    "creator_username",
    "user_id" AS "creator_id",
    "allow_remixing",
    "play_token",
    "quiz_metadata"
   FROM "public"."quiz_configurations"
  WHERE ("is_public" = true);


ALTER VIEW "public"."public_quiz_configurations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."song_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "creator_username" "text" NOT NULL,
    "songs_list_link" "text" NOT NULL,
    "song_count" numeric NOT NULL,
    "supports_player_score" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."song_lists" OWNER TO "postgres";


COMMENT ON COLUMN "public"."song_lists"."supports_player_score" IS 'Indicates whether this list contains user metadata (ratings, progress) needed for Player Score filtering. True for lists imported from AniList/MAL with user data, false for mixed or global lists.';



CREATE OR REPLACE VIEW "public"."public_song_lists" WITH ("security_invoker"='on') AS
 SELECT "id",
    "name",
    "description",
    "created_at",
    "updated_at",
    "user_id" AS "creator_id",
    "creator_username",
    "song_count"
   FROM "public"."song_lists" "sl"
  WHERE ("is_public" = true);


ALTER VIEW "public"."public_song_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quiz_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "plays" integer DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quiz_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_favorite_lists" (
    "user_id" "uuid" NOT NULL,
    "list_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_favorite_lists" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_favorite_lists" IS 'Stores user favorites for public song lists';



CREATE TABLE IF NOT EXISTS "public"."user_favorite_quizzes" (
    "user_id" "uuid" NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_favorite_quizzes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_list_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform" "text" NOT NULL,
    "username" "text" NOT NULL,
    "status" "text" NOT NULL,
    "anime_count" integer DEFAULT 0 NOT NULL,
    "songs_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "last_accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "anime_list_link" "text",
    "songs_list_link" "text",
    CONSTRAINT "user_list_cache_platform_check" CHECK (("platform" = ANY (ARRAY['anilist'::"text", 'mal'::"text"]))),
    CONSTRAINT "user_list_cache_status_check" CHECK (("status" = ANY (ARRAY['CURRENT'::"text", 'PLANNING'::"text", 'COMPLETED'::"text", 'DROPPED'::"text", 'PAUSED'::"text", 'REPEATING'::"text"])))
);


ALTER TABLE "public"."user_list_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_list_cache" IS 'Caches user anime lists from AniList/MAL. Lists are stored in Pixeldrain (song_cache folder), only links stored here. Automatically cleaned by triggers.';



COMMENT ON COLUMN "public"."user_list_cache"."status" IS 'The list status: CURRENT (watching), PLANNING, COMPLETED, DROPPED, PAUSED, REPEATING';



COMMENT ON COLUMN "public"."user_list_cache"."anime_list_link" IS 'Pixeldrain link to the anime list JSON file for this status';



COMMENT ON COLUMN "public"."user_list_cache"."songs_list_link" IS 'Pixeldrain link to the songs list JSON file for this status';



ALTER TABLE ONLY "public"."quiz_configurations"
    ADD CONSTRAINT "quiz_configurations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quiz_stats"
    ADD CONSTRAINT "quiz_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quiz_stats"
    ADD CONSTRAINT "quiz_stats_quiz_id_key" UNIQUE ("quiz_id");



ALTER TABLE ONLY "public"."song_lists"
    ADD CONSTRAINT "song_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_favorite_lists"
    ADD CONSTRAINT "user_favorite_lists_pkey" PRIMARY KEY ("user_id", "list_id");



ALTER TABLE ONLY "public"."user_favorite_quizzes"
    ADD CONSTRAINT "user_favorite_quizzes_pkey" PRIMARY KEY ("user_id", "quiz_id");



ALTER TABLE ONLY "public"."user_list_cache"
    ADD CONSTRAINT "user_list_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_list_cache"
    ADD CONSTRAINT "user_list_cache_platform_username_status_unique" UNIQUE ("platform", "username", "status");



CREATE INDEX "idx_quiz_configurations_created_at" ON "public"."quiz_configurations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_quiz_configurations_is_public" ON "public"."quiz_configurations" USING "btree" ("is_public");



CREATE INDEX "idx_quiz_configurations_name" ON "public"."quiz_configurations" USING "btree" ("name");



CREATE INDEX "idx_quiz_configurations_user_id" ON "public"."quiz_configurations" USING "btree" ("user_id");



CREATE INDEX "idx_quiz_stats_likes" ON "public"."quiz_stats" USING "btree" ("likes" DESC);



CREATE INDEX "idx_quiz_stats_plays" ON "public"."quiz_stats" USING "btree" ("plays" DESC);



CREATE INDEX "idx_quiz_stats_quiz_id" ON "public"."quiz_stats" USING "btree" ("quiz_id");



CREATE INDEX "idx_quiz_temporary_cleanup" ON "public"."quiz_configurations" USING "btree" ("is_temporary", "last_played_at") WHERE ("is_temporary" = true);



CREATE INDEX "idx_song_lists_created_at" ON "public"."song_lists" USING "btree" ("created_at");



CREATE INDEX "idx_song_lists_player_score" ON "public"."song_lists" USING "btree" ("supports_player_score") WHERE ("supports_player_score" = true);



CREATE INDEX "idx_song_lists_public" ON "public"."song_lists" USING "btree" ("is_public") WHERE ("is_public" = true);



CREATE INDEX "idx_song_lists_user_id" ON "public"."song_lists" USING "btree" ("user_id");



CREATE INDEX "idx_user_favorite_lists_created_at" ON "public"."user_favorite_lists" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_favorite_lists_list_id" ON "public"."user_favorite_lists" USING "btree" ("list_id");



CREATE INDEX "idx_user_favorite_lists_user_id" ON "public"."user_favorite_lists" USING "btree" ("user_id");



CREATE INDEX "idx_user_favorite_quizzes_quiz_id" ON "public"."user_favorite_quizzes" USING "btree" ("quiz_id");



CREATE INDEX "idx_user_favorite_quizzes_user_id" ON "public"."user_favorite_quizzes" USING "btree" ("user_id");



CREATE INDEX "idx_user_list_cache_expires" ON "public"."user_list_cache" USING "btree" ("expires_at");



CREATE OR REPLACE TRIGGER "quiz_configurations_updated_at" BEFORE UPDATE ON "public"."quiz_configurations" FOR EACH ROW EXECUTE FUNCTION "public"."update_quiz_configurations_updated_at"();



CREATE OR REPLACE TRIGGER "update_quiz_stats_updated_at" BEFORE UPDATE ON "public"."quiz_stats" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_song_lists_updated_at" BEFORE UPDATE ON "public"."song_lists" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."quiz_configurations"
    ADD CONSTRAINT "quiz_configurations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quiz_stats"
    ADD CONSTRAINT "quiz_stats_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz_configurations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."song_lists"
    ADD CONSTRAINT "song_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_favorite_lists"
    ADD CONSTRAINT "user_favorite_lists_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."song_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_favorite_lists"
    ADD CONSTRAINT "user_favorite_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_favorite_quizzes"
    ADD CONSTRAINT "user_favorite_quizzes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz_configurations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_favorite_quizzes"
    ADD CONSTRAINT "user_favorite_quizzes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."quiz_configurations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quiz_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."song_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_favorite_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_favorite_quizzes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_list_cache" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."cleanup_all_expired_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_all_expired_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_all_expired_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_user_cache"("p_user_id" "uuid", "p_platform" "text", "p_username" "text", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."clear_user_cache"("p_user_id" "uuid", "p_platform" "text", "p_username" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_user_cache"("p_user_id" "uuid", "p_platform" "text", "p_username" "text", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cached_statuses"("p_user_id" "uuid", "p_platform" "text", "p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cached_statuses"("p_user_id" "uuid", "p_platform" "text", "p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cached_statuses"("p_user_id" "uuid", "p_platform" "text", "p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_cache_entry"("cache_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."touch_cache_entry"("cache_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_cache_entry"("cache_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_quiz_configurations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_quiz_configurations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_quiz_configurations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."quiz_configurations" TO "anon";
GRANT ALL ON TABLE "public"."quiz_configurations" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_configurations" TO "service_role";



GRANT ALL ON TABLE "public"."public_quiz_configurations" TO "anon";
GRANT ALL ON TABLE "public"."public_quiz_configurations" TO "authenticated";
GRANT ALL ON TABLE "public"."public_quiz_configurations" TO "service_role";



GRANT ALL ON TABLE "public"."song_lists" TO "anon";
GRANT ALL ON TABLE "public"."song_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."song_lists" TO "service_role";



GRANT ALL ON TABLE "public"."public_song_lists" TO "anon";
GRANT ALL ON TABLE "public"."public_song_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."public_song_lists" TO "service_role";



GRANT ALL ON TABLE "public"."quiz_stats" TO "anon";
GRANT ALL ON TABLE "public"."quiz_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."quiz_stats" TO "service_role";



GRANT ALL ON TABLE "public"."user_favorite_lists" TO "anon";
GRANT ALL ON TABLE "public"."user_favorite_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."user_favorite_lists" TO "service_role";



GRANT ALL ON TABLE "public"."user_favorite_quizzes" TO "anon";
GRANT ALL ON TABLE "public"."user_favorite_quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_favorite_quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."user_list_cache" TO "anon";
GRANT ALL ON TABLE "public"."user_list_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."user_list_cache" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


