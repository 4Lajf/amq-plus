// SvelteKit ambient app types. `hooks.server.js` populates every field below on
// `event.locals`; without this declaration `App.Locals` is empty and every
// `locals.safeGetSession()` / `locals.realUser` read is a type error.
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			/**
			 * Returns the *effective* session/user, which differ from the real ones
			 * while an admin is impersonating someone (dev only).
			 */
			safeGetSession: () => Promise<{
				session: Session | null;
				user: User | null;
				realUser?: User | null;
				effectiveUser?: User | null;
				impersonation?: { active: boolean; targetUserId: string | null };
			}>;
			session: Session | null;
			user: User | null;
			/** The signed-in account, ignoring impersonation. */
			realUser: User | null;
			/** The account being acted as - equals realUser unless impersonating. */
			effectiveUser: User | null;
			impersonation: { active: boolean; targetUserId: string | null };
		}
	}
}

export {};
