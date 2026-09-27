/**
 * Reading an artifact as text, for AI agents.
 *
 * n8n drops binary data from a tool's response, so an agent can only read what is in
 * `json`. These helpers decide whether a file is text, decode it, and keep it to a size
 * a language model can take.
 */

const TEXT_TYPES = new Set(['application/json', 'application/xml', 'application/yaml', 'application/x-yaml', 'application/x-ndjson', 'application/csv']);

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
