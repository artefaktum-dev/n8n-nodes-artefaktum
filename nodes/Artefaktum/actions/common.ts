import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { Content } from '../content';

export interface ActionContext {
	ctx: IExecuteFunctions;
	itemIndex: number;
	projectCache: Map<string, string>;
}

export type Action = (a: ActionContext) => Promise<INodeExecutionData[]>;

export function splitList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
	return String(value ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export function parseJsonParam(ctx: IExecuteFunctions, value: unknown, displayName: string, itemIndex: number): IDataObject | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'object') return value as IDataObject;
	try {
		const parsed: unknown = JSON.parse(String(value));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
		return parsed as IDataObject;
	} catch {
		throw new NodeOperationError(ctx.getNode(), `Parameter '${displayName}' must be a JSON object, e.g. {"city": "Vilnius"}`, { itemIndex });
	}
}

/**
 * The metadata half of an upload or resolve body, from the shared upload parameters.
 *
 * `forResolve` leaves out `expires_at`, which the resolve endpoint does not accept: it is
 * Upload-only server-side, and the resolve endpoint rejects unknown fields with HTTP 400, so it
 * must never be included even if a stale workflow still has it set.
 */
export function uploadMetadata(ctx: IExecuteFunctions, itemIndex: number, content: Content, opts: { externalKey?: boolean; forResolve?: boolean } = {}): IDataObject {
	const title = (ctx.getNodeParameter('title', itemIndex, '') as string).trim() || content.filename;
	const options = ctx.getNodeParameter('uploadOptions', itemIndex, {}) as IDataObject;
	const body: IDataObject = { title, filename: content.filename, content_type: content.contentType, size_bytes: content.bytes.length };
	if (typeof options.description === 'string' && options.description.trim()) body.description = options.description.trim();
	const tags = splitList(options.tags);
	if (tags.length) body.tags = tags;
	const metadata = parseJsonParam(ctx, options.metadata, 'Metadata (JSON)', itemIndex);
	if (metadata && Object.keys(metadata).length) body.metadata = metadata;
	if (!opts.forResolve) {
		const hours = Number(options.expiresInHours ?? 0);
		if (hours > 0) body.expires_at = new Date(Date.now() + hours * 3600 * 1000).toISOString();
	}
	if (opts.externalKey !== false && typeof options.externalKey === 'string' && options.externalKey.trim()) body.external_key = options.externalKey.trim();
	return body;
}

/** The fields the Simplify option keeps: a stable subset of the raw artifact plus its latest version's content type and size. */
export function simplifyArtifact(a: IDataObject): IDataObject {
	const latestVersion = a.latest_version as IDataObject | undefined;
	const out: IDataObject = {};
	const keep = (key: string, value: unknown) => {
		if (value !== undefined) out[key] = value;
	};
	keep('id', a.id);
	keep('title', a.title);
	keep('description', a.description);
	keep('tags', a.tags);
	keep('external_key', a.external_key);
	keep('status', a.status);
	keep('content_type', latestVersion?.content_type);
	keep('size_bytes', latestVersion?.size_bytes);
	keep('created_at', a.created_at);
	keep('updated_at', a.updated_at);
	return out;
}

export function locator(ctx: IExecuteFunctions, itemIndex: number): { mode: 'list' | 'slug' | 'id'; value: string } {
	const raw = ctx.getNodeParameter('project', itemIndex) as { mode?: string; value?: unknown } | string;
	if (typeof raw === 'string') return { mode: 'slug', value: raw };
	return { mode: (raw.mode as 'list' | 'slug' | 'id') ?? 'slug', value: String(raw.value ?? '') };
}
