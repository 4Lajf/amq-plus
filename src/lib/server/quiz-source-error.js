/** A structural quiz reference that the user can repair in the builder. */
export class QuizSourceError extends Error {
	/** @param {string} message */
	constructor(message) {
		super(message);
		this.name = 'QuizSourceError';
	}
}

/** A referenced quiz could not load its complete pool. Safe to show to the user. */
export class QuizSourceLoadError extends Error {
	constructor(message, status = 502) {
		super(message);
		this.name = 'QuizSourceLoadError';
		this.status = status;
	}
}
