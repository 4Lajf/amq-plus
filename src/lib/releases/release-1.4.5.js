/**
 * @typedef {Object} ReleaseItem
 * @property {string} text
 * @property {string=} credit
 *
 * @typedef {Object} ReleaseSection
 * @property {string} heading
 * @property {ReleaseItem[]} items
 * @property {boolean=} announcementLead
 * @property {string=} announcementHeading
 *
 * @typedef {Object} StructuredRelease
 * @property {string} version
 * @property {string} date
 * @property {'major' | 'feature' | 'improvement'} type
 * @property {string} title
 * @property {string} description
 * @property {string} announcementTitle
 * @property {string} announcementIntro
 * @property {string} connectorUrl
 * @property {string} connectorInstructions
 * @property {ReleaseSection[]} sections
 */

/**
 * @param {string} text
 * @param {string=} credit
 * @returns {ReleaseItem}
 */
function item(text, credit) {
	return credit ? { text, credit } : { text };
}

export const release145 = /** @satisfies {StructuredRelease} */ ({
	version: '1.4.5',
	date: '2026-09-04',
	type: 'major',
	title: '',
	description:
		'This update makes the main quiz and training paths clearer, retires the confusing Shelved state, and fixes the issues listed below. Update your connector before playing (Tampermonkey → AMQ Plus Connector → Check for updates, or reinstall from the link below).',
	announcementTitle: 'AMQ+ v2.0.0',
	announcementIntro:
		'Release candidate: this update includes the changes below. In-game verification, database concurrency tests, and the remaining accessibility checks must be completed before publication.',
	connectorUrl: 'https://github.com/4Lajf/amq-scripts/raw/refs/heads/main/amqPlusConnector.user.js',
	connectorInstructions: 'Tampermonkey > AMQ Plus Connector > Check for updates, or reinstall from',
	sections: [
		{
			heading: 'New Features',
			items: [
				item(
					'**Difficult-song suggestions after training.** When a learned song is forgotten again after at least 8 lapses, the session summary offers **Pause song**, **Keep practicing**, and **Details**. Songs are never paused automatically. When you host, the lobby pauses while you choose and resumes after all choices save; an existing manual pause is preserved. Keep practicing waits at least 30 days and 4 more lapses before asking again. Available to everyone with the updated connector.'
				),
				item(
					"**Pause a song in-game.** Double-click Pause in AMQ's Song Info action row to keep that song out of training until you resume it on the website.",
					'https://discord.com/channels/386089398975856641/1452371956337737981/1478995830080802949 requested by <@117524827560083457> <@96113323279421440> <@854221350783549440> <@1315816469833187338> <@157998279760674817>'
				),
				item(
					"**Build a song list from the quiz builder's filters.** Saves every match, not a sample.",
					'https://discord.com/channels/386089398975856641/1528763486241558678/1532431462324899993 requested by <@300287173218009088> <@854221350783549440> <@1315816469833187338>'
				),
				item(
					'**Use a quiz as a source for another quiz.** Its filters are re-run live, so it keeps up as you edit it.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1532433973412888627 requested by <@300287173218009088>'
				),
				item(
					'**Duplicate a quiz** from the quiz list. Settings only, cloning with progress is still on the training page.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1500933466768801803 requested by <@210069821650370560>'
				),
				item(
					'**Import songs that have no AnnSongID.** AMQ+ matches them by name and artist and asks you to confirm. Where several songs share a name it shows you the options instead of guessing.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1529879574693937243 requested by <@257881397862203392>, with <@336004465872207872> and <@854221350783549440> explaining it in the thread'
				),
				item(
					"**Bulk-add songs to a list** from your quiz's song table. Search, tick, add.",
					'https://discord.com/channels/386089398975856641/1452371956337737981/1479119927653957784 requested by <@96113323279421440>'
				),
				item(
					'**Catch Up preset.** One click for a 100% due session.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1515321908407832677 requested by <@108674623578574848> <@1315816469833187338>'
				),
				item(
					'**Export a song list to JSON** from the list editor.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1501209217233719356 requested by <@854221350783549440>'
				),
				item(
					'Rating overlay hotkeys: **1–4** = No idea / Lucky guess / Okay / Trivial, **S** = Skip (only while the overlay is visible). One press each, even if you have double-click ratings turned on.'
				),
				item(
					'**List commands** button on Users’ Lists posts `/add` `/list` help to chat for guests.'
				),
				item('Song distribution chat toggle (`/amqplus dist`) now **persists** across reloads.'),
				item(
					'**Daily Goal + Catch-Up Queue** on the training page. The goal is a progress marker, not a hard limit. Older overdue songs show as Catch-Up Queue, and same-day replays count again.'
				),
				item(
					'**Spread backlog** (7 / 14 / 30 days). Redistributes a huge due pile without wiping learning data. Most difficult songs come back sooner in the window.'
				)
			]
		},
		{
			heading: 'Changes',
			items: [
				item(
					'**Training no longer has a hidden Shelved state.** Songs previously parked in 2099 return gradually as ordinary scheduled reviews, with learning history preserved. Use **Pause** when you intentionally want to exclude a song; paused songs stay paused.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1534001470951653456 requested by <@257844320873218049> <@1315816469833187338> <@209620759201579008>'
				),
				item(
					'Songs you **miss** can come back the same day, in a later session - they used to wait until tomorrow.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1522307364051751153 requested by <@854221350783549440> <@157998279760674817>'
				),
				item(
					'**New songs get one extra look on the day you meet them.** Rate a brand-new song **Okay** and it comes back about ten minutes later - one session, to confirm it stuck - and only then moves to days. **Lucky guess** does the same. **Trivial** skips straight to days. This is the same spaced-repetition step as the miss above, not the quiz repeating itself.'
				),
				item(
					'The training day rolls over at 00:00 UTC, and every screen that mentions it now spells out what that is in your local time.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1535042471380389898 requested by <@209620759201579008>'
				),
				item(
					'Sessions pull the most difficult due songs first, so a short session still protects what you are closest to forgetting.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1522320699996373073 requested by <@1315816469833187338>'
				),
				item(
					'Rating buttons renamed to **No idea / Lucky guess / Okay / Trivial**, to better match what you should click in each situation. After a miss or timeout, **No idea is highlighted**; choosing Lucky guess / Okay / Trivial asks you to confirm — only if you knew the song but mistyped.'
				),
				item('**Compact rating controls.** Equal buttons fit within the video, with a clear learning-stage label. Muted **+ List** and **Pause** actions sit below Video/Anime in Song Info.'),
				item(
					'**Blank answers still show ratings.** Choose a rating yourself, or use Skip to leave progress unchanged. Unrated controls disappear when the next song starts.'
				),
				item(
					'**Daily new-song limit defaults to 20 for every quiz.** Quiz owners can change it in Training Settings. Unlimited intake was one of the factors that drove huge due counts.'
				)
			]
		},
		{
			heading: 'Things to expect',
			announcementLead: true,
			announcementHeading: 'Things to expect (side effects of this update):',
			items: [
				item(
					'**Previously parked songs will return gradually.** They are spread at no more than 10 restored songs per quiz per day, starting tomorrow; very large collections can take several months to re-enter the normal schedule.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1501888001033375845 requested by <@1315816469833187338>'
				),
				item(
					'**If you change advanced Song Categories or Anime Type quotas, preview the pool before saving.** These controls are now enforced correctly, and stricter choices can reduce the result (see Bug Fixes).'
				)
			]
		},
		{
			heading: 'Bug Fixes',
			items: [
				item('Training mode and double-click settings now use labelled native checkboxes that support keyboard navigation.'),
				item('Guest copies of public quizzes correctly become private in the editor, exposing their private edit link and allowing later saves to update the same copy.'),
				item('Navigation sign-in preserves your current page. Sign-out navigates home before refreshing protected-page data.'),
				item('Opening a starter or saved quiz preserves an unrelated recovery draft and hides its Restore prompt until you return to a blank builder.'),
				item('Loading a saved song list preserves an unrelated recovery draft instead of overwriting it with the loaded list.'),
				item('Concurrent ratings of duplicate-linked songs lock their shared progress in a consistent order, preventing a database deadlock. Requires the matching database migration.'),
				item('Signing in from Training preserves the overview or quiz page you were opening.'),
				item('Removing a quiz or song list from Favorites now removes its card and updates the result count immediately.'),
				item(
					'**Training history stays yours.** Automatic age-based cleanup of training attempts and inactive song progress is disabled. Older learning records are kept unless you explicitly delete them. This does not restore records previously deleted.'
				),
				item(
					'**Accurate Due filtering.** Training progress uses the same exact due-time check as the scheduler. Songs scheduled for later today are not due early, and paused or unavailable songs are excluded. Pause and Resume update the filter immediately. Paused songs remain visible in All Types after refresh so you can resume them. No new filters.'
				),
				item(
                    'Added protection against recording the same training answer twice on retry, with its schedule, history, duplicate-song schedule, and session score saved together. Temporary update conflicts keep the answer queued for retry. Queued answers automatically resume syncing after an AMQ reload. Session completion waits for queued answers to save before calculating the summary and difficult-song suggestions. Failed quiz starts no longer report a completed training session. Generated quiz titles fit the 30-character AMQ limit.'
				),
				item(
					'Fixed Start Training spinning 15 seconds then resetting with no error.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1531786990041960560 reported by <@1315816469833187338> <@854221350783549440> <@209620759201579008> <@240954263503765514> <@493041167030550528> <@257881397862203392> <@257844320873218049>'
				),
				item(
					'Fixed due counts never moving as you played.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1535018630969036900 reported by <@209620759201579008> <@1315816469833187338> <@257881397862203392>'
				),
				item(
					"Fixed the daily due cap being tied to your last session length (so a 50-song session left no due budget for the rest of the day), sessions padding with not-yet-due songs while due songs were waiting, and songs you'd already played that day coming back as filler.",
					'https://discord.com/channels/386089398975856641/1528763486241558678/1534117331087786016 reported by <@257844320873218049> <@209620759201579008>'
				),
				item(
					'Fixed "Failed to delete play records".',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1501888114631901235 reported by <@1315816469833187338> <@854221350783549440> <@493041167030550528>'
				),
				item(
					'Fixed large song pools timing out on Start Training.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1508977071265681408 reported by <@854221350783549440>'
				),
				item(
					'Fixed a skipped song corrupting every guess after it.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1502968772439445525 reported by <@240954263503765514> <@257881397862203392>'
				),
				item(
					'Fixed "Missing from database" on songs that exist - mostly.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1530996705317752872 reported by <@240954263503765514> <@493041167030550528> <@329147793732272132> <@854221350783549440> <@157998279760674817> <@209620759201579008> <@96113323279421440> <@115432407074734088> <@1315816469833187338> <@257881397862203392>'
				),
				item(
					'Fixed an AnisongDB outage taking the whole site down.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1510006875578695763 reported by <@209620759201579008> <@854221350783549440> <@96113323279421440> <@1315816469833187338>'
				),
				item(
					'Fixed custom sample points not applying in game.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1528831395450064936 reported by <@854221350783549440>'
				),
				item(
					'Fixed merging training data between quizzes silently failing, and timing out on large merges.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1479233981189984388 reported by <@1315816469833187338> <@133742740478492672>'
				),
				item(
					'Fixed imported songs being invisible to the Song Categories filter. They now land in the proper category or "unspecified" if it cannot be determined.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1494083561173811510 reported by <@854221350783549440> <@1315816469833187338>'
				),
				item(
					'Fixed filters scoped to a single source doing nothing at all. Selectors stay attached when other sources are removed, and deleted sources show a clear error instead of silently changing the filter.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1521610215659933776 reported by <@133742740478492672> <@257881397862203392>'
				),
				item(
					'Fixed anime-list status filters (e.g. only Completed) being ignored so the whole list was used.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1521934669233258599 reported by <@257881397862203392>'
				),
				item(
					"Fixed quizzes ignoring the song count / minimums you set. If a minimum can't be met, the builder now tells you which one.",
					'https://discord.com/channels/386089398975856641/1452371956337737981/1523289802982686851 reported by <@493041167030550528>'
				),
				item(
					'Fixed songs being scheduled absurdly far out after a single miss. Cap is now 6 months.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1522322475130687549 reported by <@157998279760674817> <@1315816469833187338>'
				),
				item(
					'Fixed **Lucky guess** on songs you are still learning: returns later in the day; on songs you already know it uses normal due spacing.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1522302562466926753 reported by <@157998279760674817> <@854221350783549440> <@1315816469833187338>'
				),
				item(
					'Fixed **Lucky guess on a song you know well pushing it much further out than it should.** A song you fluked at a one-month interval came back in 100 days; now it comes back in about 22.'
				),
				item(
					'Fixed opening the session-mix percentages panel silently switching you to Manual.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1515321908407832677 reported by <@108674623578574848> <@854221350783549440> <@1315816469833187338>'
				),
				item(
					'Fixed Auto mode cutting new songs to zero with no explanation when you had a big backlog — it still introduces at least some new songs, **and now tells you in chat why there were fewer** (backlog taper, or the daily new-song limit and when it resets).',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1535043479099539506 reported by <@257881397862203392> <@1315816469833187338>'
				),
				item(
					'Fixed the **daily new-song limit not applying** when your session mix was set to Manual — it capped the first batch and then quietly topped the session up past the limit anyway. Auto was always correct.'
				),
				item(
					'Fixed a session with nothing to play starting empty — it now tells you.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1532155784413188298 reported by <@209620759201579008> <@1315816469833187338>'
				),
				item(
					'Fixed song-list uploads: lists are checked after upload before you get a link, so a half-written file can no longer replace a good one.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1499576802350203082 reported by <@854221350783549440> <@96113323279421440>'
				),
				item(
					'Fixed Due Today and the day-0 forecast disagreeing about overdue songs.',
					'https://discord.com/channels/386089398975856641/1528763486241558678/1535018457861460095 reported by <@209620759201579008> <@1315816469833187338>'
				),
				item(
					"Fixed opening a session and backing out spending the day's due / new budget when those limits are set. Budgets now count songs you actually played."
				),
				item(
					'Fixed new songs in large quizzes always coming from the front of the pool — selection is fair now.'
				),
				item('Fixed advanced Song Categories and Anime Type quotas never applying.'),
				item('Saving or adding to a song list now refuses unverified uploads instead of reporting success.'),
				item('In-game list additions respect the 20,000-song limit even when the saved count is outdated.'),
				item('Fixed merging training history failing to add songs from another quiz.'),
				item('Fixed in-game Pause rejecting valid training sessions because it used the wrong quiz identifier.'),
				item('Training confirmations now open inside the app, including Clone Data, Merge, and token replacement or revocation.'),
				item('Leaving a builder with unsaved changes now uses an in-app confirmation and keeps the local draft available.'),
				item('Starting a new quiz now uses an in-app confirmation before clearing unsaved changes.'),
				item('Quiz loading progress and errors now stay visible instead of disappearing with a toast.'),
				item('Backlog messages no longer claim new songs were reduced when the count stayed the same.'),
				item('Confirmation dialogs have readable text on light backgrounds.'),
				item('Builder filter buttons now announce expanded state and return keyboard focus after Save or Cancel. Song type, difficulty, score, vintage, popularity, franchise size, genre and tag controls have descriptive names, including range bounds and units.'),
				item('On narrow screens, song type controls, vintage dates and advanced difficulty ranges stack to keep their inputs and actions inside the filter panel.'),
				item('Manual batch sources now let you add and remove users directly, with separate platforms and list selections. Source removal also works with the keyboard.'),
				item('Quiz generation consistently recognizes the same anime across numeric and text IDs, so disabling duplicate shows also applies during selection and repair.'),
				item('Genre and tag search suggestions close with Escape and keep keyboard focus after adding or removing an item.'),
				item('Fixed a repeated update when excluding a genre or tag with Show Rates enabled that could freeze the builder.'),
				item('Anime Type summaries show the active advanced allocations. Advanced controls have distinct accessible names and fit narrow screens.'),
				item('Training checks more frequently for a ready session during the first few seconds, reducing the wait between generation finishing and the connector receiving it.'),
				item('Skip now follows the double-click setting, and rating buttons pick up setting changes without a page reload.'),
				item('Retrying a provider import clears the previous success message while preserving songs already added to your list.'),
				item('AniList fetch failures now report a list-loading error instead of silently treating the list as empty. Nested quiz sources preserve the explanation, and Refresh Pool keeps its result visible beside the controls.'),
				item('Save Pool now resolves user-list sources correctly and refuses incomplete pools when a source fails to load.'),
				item('A quiz used as a source now reports child-list failures instead of silently returning an incomplete pool.'),
				item('Training start and Refresh Pool refuse incomplete source data before caching it or changing which songs are active.'),
				item('Song-list deletion confirmations now name the list being removed.'),
				item('Closing saved-list settings returns keyboard focus to that list’s menu button.'),
				item('Replacing a song-list share link returns keyboard focus to its Regenerate button after the request finishes. Cancel also restores that button.'),
				item('Invalid or replaced song-list share links explain that a new link is needed instead of opening an empty list builder.'),
				item('Song-list share link fields have distinct accessible names.'),
				item('Song playback settings have named controls and layouts that fit narrow screens. Sample range delete buttons are separate from range selection.'),
				item('Typed sample start and end changes now reach the playback settings instead of being lost when changing ranges or saving.'),
				item('Song search keeps a visible result count or no-results message after searching.'),
				item('Saving a quiz keeps its saved URL, so refreshing reopens the same quiz.'),
				item('Training starts as soon as AMQ confirms the mode and saved songs, without extra fixed waits.'),
				item('Score filters show active count allocations in their summaries, and exclusion buttons announce their score and selected state.'),
				item('Song Categories summaries reflect the active advanced allocation mode. Vintage count and percentage inputs display the same bounded value that will be saved.'),
				item('Popularity and Franchise Size fields wrap on narrow screens. Popularity’s reverse switch exposes its selected state.'),
				item('Score-filter allocation rows adapt to narrow screens.'),
				item('Advanced song-category controls remain contained on narrow screens.'),
				item('Imported-song match checkboxes name the song, candidate anime and ID. Match rows are clickable. Closing match review returns focus to the import button.'),
				item('Training history actions identify the session time or song and attempt time. Session pagination wraps on narrow screens.'),
				item('Playback time readouts round consistently to tenths of a second, including minute boundaries.'),
				item('Creating or replacing a training token immediately shows Token ready to paste while you copy it.'),
				item('Song-list card controls no longer also open the list dialog when using the keyboard or the options menu.'),
				item('Enter on Cancel in a song-list overwrite prompt now cancels instead of overwriting.'),
				item('Typing a daily goal or training limit now saves correctly, including clearing it for unlimited training.'),
				item('Quickly dismissing a training confirmation with Escape now returns focus to the action that opened it.'),
				item('Finishing or deleting a training session updates history without reloading the page and moves keyboard focus to Recent Sessions.'),
				item('Deleting an individual attempt keeps focus in Session Details. Progress, errors and partial-success messages stay visible instead of relying only on a toast.'),
				item('Replacing a song-list share link now uses an in-app warning that identifies which link will stop working.'),
				item('Connector confirmations now open inside AMQ for removing players, ending training, unlinking accounts, and importing training data.'),
				item('Quiz drafts now wait for Restore when returning to the builder, and Discard leaves a clean quiz.'),
				item(
					'Fixed anime you\'re rewatching never showing up. They now count as "watching".',
					'reported by <@257881397862203392> <@96113323279421440>'
				),
				item(
					'Fixed the quiz list offering **"Duplicate Quiz (with training)"** when it has always been a settings-only copy. It now says what it does.'
				)
			]
		},
		{
			heading: 'Website',
			items: [
				item(
					'**Training Settings** sit under Song Progress on the quiz training page, collapsed until you open them. Daily goal, review limit, new-song limit, combine duplicates, and **Same-day reviews** are there even before you have progress. Refresh pool and merge tools live under **Maintenance**.'
				),
				item(
					'**Same-day reviews toggle** (per quiz, on by default). Off restores the old “bump to tomorrow” behaviour for songs that would otherwise return later today.'
				),
				item(
					'**Mark due** on the Song Progress table. Schedules that song for your next session. How well you know it stays the same.',
					'https://discord.com/channels/386089398975856641/1452371956337737981/1479121326030721247 requested by <@96113323279421440>'
				),
				item(
					'**Mark due and Pause now work on a quiz someone shared with you**, not just your own. They only ever touch your copy of the song. Training preferences (goal, limits, duplicate policy, same-day reviews) are personal to your account for that quiz.'
				),
				item(
					'**Training Progress and Current Song List are easier to use on phones.** Below tablet width they become readable cards with sorting, the important facts first, and expandable details. Desktop keeps the denser tables.'
				),
				item(
					'**Keyboard navigation and accessible labels have been improved.** The checked Save and Load dialogs keep focus inside, close with Escape, and restore focus to their opener. Main controls expose more useful names and state. The complete nine-journey keyboard and manual screen-reader checks are still pending.'
				),
				item(
					'**Public / Remix** toggles in the quiz builder top bar when you own the loaded quiz (still also in Save).'
				),
				item('**Export** on My Song Lists (and a labelled Export in the list creator).'),
				item(
					'The home page now explains quizzes, song lists, and **Training**, and its three playable starters increase from Basic Linear Flow to Random Execution Chances and Router & Modifier Nodes.'
				),
				item(
					'The Dashboard clarifies that AMQ+ stores account data under your Discord sign-in while connector preferences stay in AMQ local storage.'
				)
			]
		}
	]
});
