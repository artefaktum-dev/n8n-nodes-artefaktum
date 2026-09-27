import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_CHARACTERS, TEXT_MAX_BYTES, decodeText, isTextLike, resolveMaxCharacters, truncate } from '../nodes/Artefaktum/text';

describe('isTextLike', () => {
	it.each([
		'text/plain',
		'text/csv',
		'text/markdown',
		'text/html',
		'application/json',
		'application/xml',
		'application/yaml',
		'application/x-yaml',
		'application/x-ndjson',
		'application/csv',
		'application/vnd.api+json',
		'image/svg+xml',
		'Text/Plain; charset=UTF-8',
		' application/json ',
	])('accepts %s', (type) => {
		expect(isTextLike(type)).toBe(true);
	});

	it.each(['image/png', 'application/pdf', 'application/octet-stream', 'application/zip', 'video/mp4', '', undefined])('refuses %s', (type) => {
		expect(isTextLike(type)).toBe(false);
	});
});

describe('decodeText', () => {
	it('decodes UTF-8', () => {
		expect(decodeText(Buffer.from('Šiauliai 12 °C', 'utf8'))).toBe('Šiauliai 12 °C');
	});

	it('drops a byte order mark', () => {
		expect(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('abc')]))).toBe('abc');
	});
});

describe('truncate', () => {
	it('leaves a short text alone', () => {
		expect(truncate('abc', 10)).toEqual({ content: 'abc', truncated: false, characters: 3 });
	});

	it('leaves a text of exactly the limit alone', () => {
		expect(truncate('abcde', 5)).toEqual({ content: 'abcde', truncated: false, characters: 5 });
	});

	it('cuts a long text and reports the full length', () => {
		expect(truncate('abcdefgh', 5)).toEqual({ content: 'abcde', truncated: true, characters: 8 });
	});

	it('treats 0 as no limit', () => {
		expect(truncate('abcdefgh', 0)).toEqual({ content: 'abcdefgh', truncated: false, characters: 8 });
	});

	it('never cuts a surrogate pair in half', () => {
		const text = 'ab😀cd'; // the emoji is two UTF-16 code units, at index 2 and 3
		expect(truncate(text, 3).content).toBe('ab');
		expect(truncate(text, 4).content).toBe('ab😀');
	});
});

describe('TEXT_MAX_BYTES', () => {
	it('is 25 MB, 26,214,400 bytes', () => {
		expect(TEXT_MAX_BYTES).toBe(26_214_400);
	});
});

describe('resolveMaxCharacters', () => {
	it.each([
		['undefined', undefined, DEFAULT_MAX_CHARACTERS],
		['null', null, DEFAULT_MAX_CHARACTERS],
		['empty string', '', DEFAULT_MAX_CHARACTERS],
		["'abc'", 'abc', DEFAULT_MAX_CHARACTERS],
		['{}', {}, DEFAULT_MAX_CHARACTERS],
		['NaN', NaN, DEFAULT_MAX_CHARACTERS],
		['Infinity', Infinity, DEFAULT_MAX_CHARACTERS],
		['0', 0, 0],
		['-5', -5, 0],
		["'1200'", '1200', 1200],
		['1200.9', 1200.9, 1200],
	])('resolves %s to %d', (_label, raw, expected) => {
		expect(resolveMaxCharacters(raw)).toBe(expected);
	});

	it('DEFAULT_MAX_CHARACTERS is 50000', () => {
		expect(DEFAULT_MAX_CHARACTERS).toBe(50000);
	});
});
