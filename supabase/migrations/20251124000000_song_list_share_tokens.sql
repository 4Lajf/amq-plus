-- Add share tokens to song_lists table
ALTER TABLE "public"."song_lists"
    ADD COLUMN "view_token" text,
    ADD COLUMN "edit_token" text;

-- Create indexes for fast token lookup
CREATE INDEX "idx_song_lists_view_token" ON "public"."song_lists" USING "btree" ("view_token");
CREATE INDEX "idx_song_lists_edit_token" ON "public"."song_lists" USING "btree" ("edit_token");

-- Add comment to explain token usage
COMMENT ON COLUMN "public"."song_lists"."view_token" IS 'Token for read-only access to a private list (allows copying)';
COMMENT ON COLUMN "public"."song_lists"."edit_token" IS 'Token for write access to a private or public list';

