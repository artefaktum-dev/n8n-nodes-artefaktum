import type { IDataObject, INodeExecutionData } from 'n8n-workflow';
import { resolveProjectId } from '../../projects';
import { apiRequest } from '../../transport';
import { locator, simplifyArtifact, splitList, type Action } from '../common';

const RETURN_ALL_CAP = 1000;
// Defensive cap on the number of search pages fetched per item: a server that never stops
// paging (e.g. a buggy or malicious next_cursor loop) shouldn't be able to hang this node forever.
const MAX_PAGES = 20;

const search: Action = async ({ ctx, itemIndex, projectCache }) => {
	const projectId = await resolveProjectId(ctx, locator(ctx, itemIndex), projectCache, itemIndex);
	const options = ctx.getNodeParameter('searchOptions', itemIndex, {}) as IDataObject;
	const simplify = options.simplify !== false;
	const mode = typeof options.mode === 'string' && options.mode ? options.mode : 'hybrid';
	const returnAll = ctx.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? 100 : Math.max(1, Math.min(100, Number(ctx.getNodeParameter('limit', itemIndex, 50))));
	const f = ctx.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const filters: IDataObject = {};
	const tags = splitList(f.tags);
	if (tags.length) filters.tags_all = tags;
	const types = splitList(f.contentTypes);
	if (types.length) filters.content_types = types;
	if (typeof f.createdAfter === 'string' && f.createdAfter) filters.created_after = f.createdAfter;
	if (typeof f.createdBefore === 'string' && f.createdBefore) filters.created_before = f.createdBefore;
	if (f.includeSuperseded === true) filters.exclude_superseded = false;

	const body: IDataObject = { project_id: projectId, query: ctx.getNodeParameter('query', itemIndex, '') as string, mode, limit };
	if (Object.keys(filters).length) body.filters = filters;

	const out: INodeExecutionData[] = [];
	let cursor: string | null = null;
	let pageCount = 0;
	do {
		const page = await apiRequest(ctx, 'POST', '/v1/artifacts/search', { body: cursor ? { ...body, cursor } : body, itemIndex });
		pageCount++;
		for (const hit of (page.items as IDataObject[]) ?? []) {
			const artifact = hit.artifact as IDataObject;
			const json = simplify ? simplifyArtifact(artifact) : { ...artifact };
			out.push({ json: { ...json, score: hit.score, match_mode: hit.match_mode }, pairedItem: { item: itemIndex } });
			if (!returnAll && out.length >= limit) return out;
			if (returnAll && out.length >= RETURN_ALL_CAP) return out;
		}
		cursor = returnAll && pageCount < MAX_PAGES && typeof page.next_cursor === 'string' ? page.next_cursor : null;
	} while (cursor);
	return out;
};

export default search;
