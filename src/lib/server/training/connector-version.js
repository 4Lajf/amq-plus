/**
 * Connector version gate.
 *
 * `POST /api/training/session/start` returns 202 + jobId; connectors below
 * MIN_CONNECTOR_VERSION do not understand that and fall into their generic
 * error branch. Checking the version the connector reports lets us answer with
 * an actionable message *before* spending a large-pool generation on a client
 * that could not consume the result anyway.
 *
 * Connectors that predate version reporting send nothing, which is itself the
 * answer: anything that old is below the minimum.
 *
 * @module lib/server/training/connector-version
 */

/**
 * Minimum compatible public connector, independent of the upcoming release.
 * Public 1.4.2 already reports its version and supports asynchronous session
 * start/polling and the ready-session payload. Retired shelf request fields
 * are ignored by the server, so their removal does not require an upgrade.
 */
export const MIN_CONNECTOR_VERSION = '1.4.2';

export const CONNECTOR_UPDATE_MESSAGE =
	`Please update the AMQ+ connector to ${MIN_CONNECTOR_VERSION} or newer ` +
	'(Tampermonkey → AMQ Plus Connector → Check for updates), then try again.';

/**
 * Parse a dotted version into numeric parts. Junk becomes 0 rather than NaN.
 *
 * @param {unknown} version
 * @returns {number[]}
 */
function parseVersion(version) {
	return String(version ?? '0')
		.split('.')
		.map((part) => parseInt(String(part).replace(/[^0-9].*$/, ''), 10) || 0);
}

/**
 * @param {unknown} version - Version the connector reported
 * @param {string} [required=MIN_CONNECTOR_VERSION]
 * @returns {boolean} True when `version` is at least `required`
 */
export function isConnectorVersionAtLeast(version, required = MIN_CONNECTOR_VERSION) {
	if (version === null || version === undefined || version === '') return false;

	const actual = parseVersion(version);
	const minimum = parseVersion(required);
	const length = Math.max(actual.length, minimum.length);

	for (let i = 0; i < length; i++) {
		const left = actual[i] || 0;
		const right = minimum[i] || 0;
		if (left > right) return true;
		if (left < right) return false;
	}

	return true;
}
