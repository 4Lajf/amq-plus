/**
 * Debounce a call and keep only the latest one.
 *
 * Rapid calls (keystrokes) wait until `waitMs` of idle, then run once with the
 * last argument. If another call is scheduled while a run is in flight, the
 * previous AbortSignal is aborted so the caller can cancel its fetch, and the
 * superseded promise settles as `{ stale: true }` immediately.
 *
 * @param {(arg: any, signal: AbortSignal) => Promise<any>} run
 * @param {number} [waitMs=250]
 * @returns {{ (arg?: any): Promise<{ stale: boolean, result: any }>, cancel: () => void }}
 */
export function createDebouncedLatest(run, waitMs = 250) {
	let timer = null;
	/** @type {AbortController | null} */
	let controller = null;
	let generation = 0;
	/** @type {{ resolve: (value: { stale: boolean, result: any }) => void, reject: (error: any) => void } | null} */
	let pending = null;

	function settlePendingAsStale() {
		if (!pending) return;
		const { resolve } = pending;
		pending = null;
		resolve({ stale: true, result: undefined });
	}

	/**
	 * @param {any} [arg]
	 * @returns {Promise<{ stale: boolean, result: any }>}
	 */
	function schedule(arg) {
		generation += 1;
		const gen = generation;
		controller?.abort();
		controller = new AbortController();
		const { signal } = controller;
		clearTimeout(timer);
		settlePendingAsStale();

		return new Promise((resolve, reject) => {
			pending = { resolve, reject };
			timer = setTimeout(async () => {
				try {
					const result = await run(arg, signal);
					if (pending?.resolve !== resolve || gen !== generation || signal.aborted) {
						resolve({ stale: true, result: undefined });
						if (pending?.resolve === resolve) pending = null;
						return;
					}
					pending = null;
					resolve({ stale: false, result });
				} catch (error) {
					const aborted =
						(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') ||
						gen !== generation ||
						pending?.resolve !== resolve;
					if (aborted) {
						resolve({ stale: true, result: undefined });
						if (pending?.resolve === resolve) pending = null;
						return;
					}
					pending = null;
					reject(error);
				}
			}, waitMs);
		});
	}

	schedule.cancel = () => {
		generation += 1;
		clearTimeout(timer);
		controller?.abort();
		settlePendingAsStale();
	};

	return schedule;
}
