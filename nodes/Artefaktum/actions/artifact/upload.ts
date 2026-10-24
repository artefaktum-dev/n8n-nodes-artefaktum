import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';
import { readContent, type Content } from '../../content';
import { resolveProjectId } from '../../projects';
import { apiRequest, type UploadInstructions } from '../../transport';
import { putAndComplete } from '../../upload';
import { locator, splitList, parseJsonParam, uploadMetadata, type Action } from '../common';

const MAX_PENDING_ROUNDS = 5;

const isStatus = (e: unknown, code: string) => (e as { httpCode?: string }).httpCode === code;
/** NodeApiError passes through unchanged; anything else is wrapped. */
const rethrow = (ctx: IExecuteFunctions, e: unknown): never => {
	throw new NodeApiError(ctx.getNode(), e as JsonObject);
};
const out = (json: IDataObject, itemIndex: number) => [{ json, pairedItem: { item: itemIndex } }];
const artifactPath = (id: string) => `/v1/artifacts/${encodeURIComponent(id)}`;

/** Plain create: POST uploads, PUT, complete, GET. */
async function createArtifact(ctx: IExecuteFunctions, itemIndex: number, projectId: string, content: Content): Promise<IDataObject> {
	const body = { project_id: projectId, ...uploadMetadata(ctx, itemIndex, content) };
	const ticket = await apiRequest(ctx, 'POST', '/v1/artifacts/uploads', { body, itemIndex });
	const ref = ticket.artifact as IDataObject;
	return putAndComplete(ctx, String(ref.id), String(ref.version_id), ticket.upload as unknown as UploadInstructions, content, itemIndex);
}

/** The fields the user set for title/description/tags/metadata/expiry, as a PATCH body. */
function patchBody(ctx: IExecuteFunctions, itemIndex: number): IDataObject {
	const body: IDataObject = {};
	const title = (ctx.getNodeParameter('title', itemIndex, '') as string).trim();
	if (title) body.title = title;
	const options = ctx.getNodeParameter('uploadOptions', itemIndex, {}) as IDataObject;
	if (typeof options.description === 'string' && options.description.trim()) body.description = options.description.trim();
	const tags = splitList(options.tags);
	if (tags.length) body.tags = tags;
	const metadata = parseJsonParam(ctx, options.metadata, 'Metadata (JSON)', itemIndex);
	if (metadata && Object.keys(metadata).length) body.metadata = metadata;
	const hours = Number(options.expiresInHours ?? 0);
	if (hours > 0) body.expires_at = new Date(Date.now() + hours * 3600 * 1000).toISOString();
	return body;
}

async function addVersion(ctx: IExecuteFunctions, itemIndex: number, id: string, content: Content): Promise<IDataObject> {
	const ticket = await apiRequest(ctx, 'POST', `${artifactPath(id)}/uploads`, {
		body: { filename: content.filename, content_type: content.contentType, size_bytes: content.bytes.length },
		itemIndex,
	});
	const ref = ticket.artifact as IDataObject;
	const done = await putAndComplete(ctx, id, String(ref.version_id), ticket.upload as unknown as UploadInstructions, content, itemIndex);
	const patch = patchBody(ctx, itemIndex);
	if (!Object.keys(patch).length) return done;
	await apiRequest(ctx, 'PATCH', artifactPath(id), { body: patch, itemIndex });
	return apiRequest(ctx, 'GET', artifactPath(id), { itemIndex });
}

async function versionPath(ctx: IExecuteFunctions, itemIndex: number, projectId: string, key: string, content: Content, retry = true): Promise<IDataObject> {
	let existing: IDataObject | undefined;
	try {
		existing = await apiRequest(ctx, 'GET', `/v1/artifacts/by-external-key/${encodeURIComponent(key)}`, { qs: { project_id: projectId }, itemIndex });
	} catch (e) {
		if (!isStatus(e, '404')) rethrow(ctx, e);
	}
	if (existing) return addVersion(ctx, itemIndex, String(existing.id), content);
	try {
		return await createArtifact(ctx, itemIndex, projectId, content);
	} catch (e) {
		if (retry && isStatus(e, '409')) return versionPath(ctx, itemIndex, projectId, key, content, false);
		return rethrow(ctx, e);
	}
}

async function reusePath(ctx: IExecuteFunctions, itemIndex: number, projectId: string, key: string, content: Content): Promise<IDataObject> {
	const maxAge = Number(ctx.getNodeParameter('maxAgeSeconds', itemIndex, 0));
	const body: IDataObject = { project_id: projectId, external_key: key, ...uploadMetadata(ctx, itemIndex, content, { externalKey: false, forResolve: true }) };
	if (maxAge > 0) body.max_age_seconds = Math.floor(maxAge);

	for (let round = 0; round <= MAX_PENDING_ROUNDS; round++) {
		const res = await apiRequest(ctx, 'POST', '/v1/artifacts/resolve', { body, itemIndex });
		if (res.status === 'hit') return { ...(res.artifact as IDataObject), cache: 'hit' };
		if (res.status === 'create') {
			const ref = res.reservation as IDataObject;
			let artifact = await putAndComplete(ctx, String(ref.id), String(ref.version_id), res.upload as unknown as UploadInstructions, content, itemIndex);
			const expires = patchBody(ctx, itemIndex).expires_at;
			if (expires) {
				await apiRequest(ctx, 'PATCH', artifactPath(String(ref.id)), { body: { expires_at: expires }, itemIndex });
				artifact = await apiRequest(ctx, 'GET', artifactPath(String(ref.id)), { itemIndex });
			}
			return { ...artifact, cache: 'created' };
		}
		if (round < MAX_PENDING_ROUNDS) await sleep(Math.min(Number(res.retry_after_seconds ?? 5), 5) * 1000);
	}
	throw new NodeOperationError(ctx.getNode(), `The artifact under '${key}' is still being uploaded by another run. Try again in a minute.`, { itemIndex });
}

const upload: Action = async ({ ctx, itemIndex, projectCache }) => {
	const loc = locator(ctx, itemIndex);
	const projectId = await resolveProjectId(ctx, loc, projectCache, itemIndex);
	const key = String(ctx.getNodeParameter('key', itemIndex, '') ?? '').trim();
	const mode = key ? String(ctx.getNodeParameter('ifKeyExists', itemIndex, 'error')) : 'error';
	const content = await readContent(ctx, itemIndex);

	if (mode === 'reuse') return out(await reusePath(ctx, itemIndex, projectId, key, content), itemIndex);
	if (mode === 'version') return out(await versionPath(ctx, itemIndex, projectId, key, content), itemIndex);
	try {
		return out(await createArtifact(ctx, itemIndex, projectId, content), itemIndex);
	} catch (e) {
		if (key && isStatus(e, '409')) {
			throw new NodeOperationError(ctx.getNode(), `An artifact with key '${key}' already exists in project '${loc.value}'. Set If Key Exists to add a version or reuse it.`, { itemIndex });
		}
		return rethrow(ctx, e);
	}
};

export default upload;
