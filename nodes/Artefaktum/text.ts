/**
 * Reading an artifact as text, for AI agents.
 *
 * n8n drops binary data from a tool's response, so an agent can only read what is in
 * `json`. These helpers decide whether a file is text, decode it, and keep it to a size
 * a language model can take.
 */

const TEXT_TYPES = new Set(['application/json', 'application/xml', 'application/yaml', 'application/x-yaml', 'application/x-ndjson', 'application/csv']);

/** The largest file Text mode will read: 25 MB. Not a node parameter. */
export const TEXT_MAX_BYTES = 25 * 1024 * 1024;

/** Max Characters when the parameter is unset. */
export const DEFAULT_MAX_CHARACTERS = 50000;

/**
 * Coerce the Max Characters option to a usable cap.
 *
 * `undefined`, `null`, `''`, or anything that is not a finite number after `Number(...)`
 * (e.g. `'abc'`, `{}`, `NaN`, `Infinity`) falls back to the default so a bad value never
 * silently produces empty content. A finite negative number is clamped to 0, which `truncate`
 * treats as no limit, same as today.
 */
export function resolveMaxCharacters(raw: unknown): number {
	if (raw === undefined || raw === null || raw === '') return DEFAULT_MAX_CHARACTERS;
	const num = Number(raw);
	if (!Number.isFinite(num)) return DEFAULT_MAX_CHARACTERS;
	return Math.max(0, Math.floor(num));
}

/** Whether a content type names text: `text/*`, the types above, or any `+json` / `+xml`. */
export function isTextLike(contentType: string | undefined): boolean {
	const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
	if (!type) return false;
	return type.startsWith('text/') || TEXT_TYPES.has(type) || type.endsWith('+json') || type.endsWith('+xml');
}

/** Decode UTF-8 and drop a leading byte order mark. */
export function decodeText(bytes: Buffer): string {
	const text = bytes.toString('utf8');
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Cut `text` to `maxCharacters` (0 means no limit) without splitting a surrogate pair. */
export function truncate(text: string, maxCharacters: number): { content: string; truncated: boolean; characters: number } {
	const characters = text.length;
	if (maxCharacters <= 0 || characters <= maxCharacters) return { content: text, truncated: false, characters };
	let end = maxCharacters;
	const last = text.charCodeAt(end - 1);
	if (last >= 0xd800 && last <= 0xdbff) end -= 1;
	return { content: text.slice(0, end), truncated: true, characters };
}
