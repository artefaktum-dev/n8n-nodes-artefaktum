import { NodeOperationError } from 'n8n-workflow';
import { lookupArtifact } from '../lookup';
import { apiRequest } from '../../transport';
import type { Action } from '../common';

const del: Action = async ({ ctx, itemIndex, projectCache }) => {
	const found = await lookupArtifact(ctx, itemIndex, projectCache, { allowMissing: false });
	if (!found.found) throw new NodeOperationError(ctx.getNode(), 'Artifact not found', { itemIndex });
	const id = String(found.artifact.id);
	await apiRequest(ctx, 'DELETE', `/v1/artifacts/${encodeURIComponent(id)}`, { itemIndex });
	return [{ json: { id, deleted: true }, pairedItem: { item: itemIndex } }];
};

export default del;
