/** Format a playback position to the nearest tenth of a second. */
export function formatPlaybackTime(seconds) {
	if (!Number.isFinite(seconds)) return '0:00.0';
	const tenths = Math.round(Math.max(0, seconds) * 10);
	const minutes = Math.floor(tenths / 600);
	const wholeSeconds = Math.floor(tenths / 10) % 60;
	return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${tenths % 10}`;
}
