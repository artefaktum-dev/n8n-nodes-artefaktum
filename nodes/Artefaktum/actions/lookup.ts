import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { resolveProjectId } from '../projects';
import { apiRequest } from '../transport';
import { locator } from './common';

export interface Found {
	found: true;
	artifact: IDataObject;
}
export interface Missing {
	found: false;
	key: string;
	projectId: string;
	reason: 'missing' | 'stale';
	ageSeconds?: number;
}
export type Lookup = Found | Missing;

/**
 * Find the artifact the Lookup, Artifact ID / Key and Project parameters point at.
 *
 * A miss throws, unless the caller allows a Missing and If Not Found is 'empty', in which case
 * the Missing is returned. By ID a 404 always propagates unchanged and Max Age is ignored.
 */
export async function lookupArtifact(
	ctx: IExecuteFunctions,
	itemIndex: number,
	projectCache: Map<string, string>,
	opts: { allowMissing: boolean },
): Promise<Lookup> {
	const mode = ctx.getNodeParameter('lookup', itemIndex, 'id') as string;
	if (mode !== 'key') {
		const id = (ctx.getNodeParameter('artifactId', itemIndex) as string).trim();
		if (!id) throw new NodeOperationError(ctx.getNode(), "Parameter 'Artifact ID' is empty", { itemIndex });
		return { found: true, artifact: await apiRequest(ctx, 'GET', `/v1/artifacts/${encodeURIComponent(id)}`, { itemIndex }) };
	}

	const key = (ctx.getNodeParameter('key', itemIndex) as string).trim();
	if (!key) throw new NodeOperationError(ctx.getNode(), "Parameter 'Key' is empty", { itemIndex });
	const loc = locator(ctx, itemIndex);
	const projectId = await resolveProjectId(ctx, loc, projectCache, itemIndex);
	// Max Age and If Not Found belong to Get only; Update and Delete never read them.
	const maxAge = opts.allowMissing ? Number(ctx.getNodeParameter('maxAgeSeconds', itemIndex, 0)) : 0;
	const ifNotFound = opts.allowMissing ? (ctx.getNodeParameter('ifNotFound', itemIndex, 'error') as string) : 'error';
	const returnMissing = ifNotFound === 'empty';
	const where = `key '${key}' in project '${loc.value}'`;

	let artifact: IDataObject;
	try {
		artifact = await apiRequest(ctx, 'GET', `/v1/artifacts/by-external-key/${encodeURIComponent(key)}`, { qs: { project_id: projectId }, itemIndex });
	} catch (error) {
		// A NodeApiError passes through NodeApiError's constructor unchanged.
		if (!(error instanceof NodeApiError) || String(error.httpCode) !== '404') throw new NodeApiError(ctx.getNode(), error as JsonObject);
		if (returnMissing) return { found: false, key, projectId, reason: 'missing' };
		throw new NodeOperationError(ctx.getNode(), `No artifact with ${where}`, { itemIndex });
	}

	if (maxAge > 0) {
		const ageSeconds = (Date.now() - Date.parse(String(artifact.updated_at))) / 1000;
		if (ageSeconds > maxAge) {
			if (returnMissing) return { found: false, key, projectId, reason: 'stale', ageSeconds };
			throw new NodeOperationError(
				ctx.getNode(),
				`The artifact with ${where} is ${Math.floor(ageSeconds)} seconds old, older than Max Age (${Math.floor(maxAge)})`,
				{ itemIndex },
			);
		}
	}
	return { found: true, artifact };
}
