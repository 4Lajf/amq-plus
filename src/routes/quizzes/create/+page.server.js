export const load = async ({ locals, url }) => {
	let session = null;
	let user = null;

	try {
		const result = await locals.safeGetSession();
		session = result.session;
		user = result.user;
	} catch (err) {
		// Not logged in
	}

	const loadQuizId = url.searchParams.get('load') || null;
	const shareToken = url.searchParams.get('share') || null;

	return {
		session,
		user,
		loadQuizId,
		shareToken
	};
};
