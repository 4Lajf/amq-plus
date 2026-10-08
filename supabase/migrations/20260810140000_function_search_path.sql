-- R7a: pin search_path on the 12 pre-existing functions the Supabase linter flags
-- (0011_function_search_path_mutable).
--
-- All 12 are SECURITY INVOKER, so this is hardening rather than a live hole - a
-- caller cannot use it to escalate, only to make a function resolve an unqualified
-- name against their own schema. The two functions added in this recovery branch
-- already set it; these are the ones that predate it.
--
-- pg_temp is pinned last so a temp table can never shadow a public one.

alter function public.cleanup_all_expired_cache() set search_path = public, pg_temp;
alter function public.cleanup_expired_cache() set search_path = public, pg_temp;
alter function public.cleanup_expired_quizzes() set search_path = public, pg_temp;
alter function public.clear_user_cache(p_user_id uuid, p_platform text, p_username text, p_status text) set search_path = public, pg_temp;
alter function public.extract_fsrs_due(fsrs_state jsonb) set search_path = public, pg_temp;
alter function public.generate_quiz_tokens() set search_path = public, pg_temp;
alter function public.get_cached_statuses(p_user_id uuid, p_platform text, p_username text) set search_path = public, pg_temp;
alter function public.prune_quiz_lobby_song_history() set search_path = public, pg_temp;
alter function public.touch_cache_entry(cache_id uuid) set search_path = public, pg_temp;
alter function public.update_quiz_configurations_updated_at() set search_path = public, pg_temp;
alter function public.update_training_progress_updated_at() set search_path = public, pg_temp;
alter function public.update_updated_at_column() set search_path = public, pg_temp;
