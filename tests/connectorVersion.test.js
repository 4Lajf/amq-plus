import { describe, it, expect } from 'vitest';
import {
	MIN_CONNECTOR_VERSION,
	CONNECTOR_UPDATE_MESSAGE,
	isConnectorVersionAtLeast
} from '../src/lib/server/training/connector-version.js';

describe('isConnectorVersionAtLeast', () => {
	it('keeps public 1.4.2 playable while the next release is prepared', () => {
		expect(MIN_CONNECTOR_VERSION).toBe('1.4.2');
		expect(isConnectorVersionAtLeast('1.4.2')).toBe(true);
		expect(isConnectorVersionAtLeast('1.4.3')).toBe(true);
		expect(isConnectorVersionAtLeast('1.4.4')).toBe(true);
		expect(CONNECTOR_UPDATE_MESSAGE).toContain('1.4.2 or newer');
	});

	it('accepts the exact minimum', () => {
		expect(isConnectorVersionAtLeast(MIN_CONNECTOR_VERSION)).toBe(true);
	});

	it('accepts newer versions', () => {
		expect(isConnectorVersionAtLeast('1.4.6')).toBe(true);
		expect(isConnectorVersionAtLeast('1.5.0')).toBe(true);
		expect(isConnectorVersionAtLeast('2.0.0')).toBe(true);
	});

	it('rejects older versions', () => {
		expect(isConnectorVersionAtLeast('1.4.1')).toBe(false);
		expect(isConnectorVersionAtLeast('1.3.3')).toBe(false);
		expect(isConnectorVersionAtLeast('1.2.3')).toBe(false);
		expect(isConnectorVersionAtLeast('0.9.9')).toBe(false);
	});

	it('rejects a connector that reports nothing', () => {
		// Anything predating version reporting is by definition below the minimum,
		// and this is the case that matters most - it is every user on deploy day.
		expect(isConnectorVersionAtLeast(null)).toBe(false);
		expect(isConnectorVersionAtLeast(undefined)).toBe(false);
		expect(isConnectorVersionAtLeast('')).toBe(false);
	});

	it('handles short and long version strings', () => {
		expect(isConnectorVersionAtLeast('2', '1.3.4')).toBe(true);
		expect(isConnectorVersionAtLeast('1.3', '1.3.4')).toBe(false);
		expect(isConnectorVersionAtLeast('1.3.4.1', '1.3.4')).toBe(true);
	});

	it('tolerates suffixes and junk without throwing', () => {
		expect(isConnectorVersionAtLeast('1.4.5-beta')).toBe(true);
		expect(isConnectorVersionAtLeast('1.4.1-beta')).toBe(false);
		expect(isConnectorVersionAtLeast('not-a-version')).toBe(false);
	});

	it('compares numerically, not lexically', () => {
		expect(isConnectorVersionAtLeast('1.3.10', '1.3.9')).toBe(true);
		expect(isConnectorVersionAtLeast('1.10.0', '1.9.0')).toBe(true);
	});
});
