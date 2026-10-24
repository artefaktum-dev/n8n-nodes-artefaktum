import { describe, expect, it } from 'vitest';
import search from '../nodes/Artefaktum/actions/artifact/search';
import { mockExecute, on } from './helpers/mockExecute';

const artifact = { id: 'a1', title: 'T', status: 'ready' };
const a = { ctx: undefined as never, itemIndex: 0, projectCache: new Map<string, string>() };

describe('artifact:search', () => {
	const hit = (id: string) => ({ artifact: { ...artifact, id }, score: 0.5, match_mode: 'hybrid' });

	it('searches with filters and flattens hits', async () => {
		const { ctx, calls } = mockExecute({
			params: { project: { mode: 'id', value: 'p1' }, query: 'emissions', returnAll: false, limit: 2, filters: { tags: 'a, b', contentTypes: 'text/csv', createdAfter: '2026-01-01T00:00:00.000Z', includeSuperseded: true }, searchOptions: { mode: 'semantic', simplify: false } },
			responses: [on('POST', '/v1/artifacts/search', { body: { items: [hit('a1'), hit('a2')], next_cursor: 'c2', mode: 'semantic' } })],
		});
		const out = await search({ ...a, ctx });
		expect(out.map((o) => o.json.id)).toEqual(['a1', 'a2']);
		expect(out[0].json).toMatchObject({ score: 0.5, match_mode: 'hybrid' });
		expect(calls[0].body).toEqual({ project_id: 'p1', query: 'emissions', mode: 'semantic', limit: 2, filters: { tags_all: ['a', 'b'], content_types: ['text/csv'], created_after: '2026-01-01T00:00:00.000Z', exclude_superseded: false } });
	});

	it('keeps score and match_mode on the simplified item', async () => {
		const full = { id: 'a1', title: 'T', status: 'ready', metadata: { k: 1 }, created_by: 'user1' };
		const { ctx } = mockExecute({
			params: { project: { mode: 'id', value: 'p1' }, query: '', returnAll: false, limit: 50, filters: {}, searchOptions: { mode: 'hybrid', simplify: true } },
			responses: [on('POST', '/v1/artifacts/search', { body: { items: [{ artifact: full, score: 0.9, match_mode: 'text' }], next_cursor: null, mode: 'hybrid' } })],
		});
		const out = await search({ ...a, ctx });
		expect(out[0].json).toEqual({ id: 'a1', title: 'T', status: 'ready', score: 0.9, match_mode: 'text' });
	});

	it('follows cursors when returnAll is set', async () => {
		const { ctx, calls } = mockExecute({
			params: { project: { mode: 'id', value: 'p1' }, query: '', returnAll: true, filters: {}, searchOptions: { mode: 'hybrid', simplify: false } },
			responses: [
				on('POST', '/v1/artifacts/search', { body: { items: [hit('a1')], next_cursor: 'c2', mode: 'hybrid' } }),
				on('POST', '/v1/artifacts/search', { body: { items: [hit('a2')], next_cursor: null, mode: 'hybrid' } }),
			],
		});
		const out = await search({ ...a, ctx });
		expect(out.map((o) => o.json.id)).toEqual(['a1', 'a2']);
		expect((calls[1].body as Record<string, unknown>).cursor).toBe('c2');
		expect((calls[0].body as Record<string, unknown>).limit).toBe(100);
	});

	it('never exceeds the 1,000-item cap even when every page has a next_cursor', async () => {
		// A page size that does not divide the 1,000 cap evenly (300): the fourth page
		// would carry the running total from 900 to 1200 if the whole page were pushed
		// before checking the cap, so this also proves the cap is enforced mid-page, not
		// just between pages.
		const PAGE_SIZE = 300;
		const page = (start: number) => ({
			items: Array.from({ length: PAGE_SIZE }, (_, i) => hit(`id-${start + i}`)),
			next_cursor: 'more',
			mode: 'hybrid',
		});
		// Queued generously so the mock would keep serving pages past the cap if the
		// implementation kept requesting them; the assertion below checks it doesn't.
		const responses = Array.from({ length: 6 }, (_, i) => on('POST', '/v1/artifacts/search', { body: page(i * PAGE_SIZE) }));
		const { ctx, calls } = mockExecute({
			params: { project: { mode: 'id', value: 'p1' }, query: '', returnAll: true, filters: {}, searchOptions: { mode: 'hybrid' } },
			responses,
		});
		const out = await search({ ...a, ctx });
		expect(out).toHaveLength(1000);
		expect(calls.length).toBeLessThanOrEqual(10);
	});

	it('stops after 20 pages even if the server keeps handing back a next_cursor', async () => {
		// One hit per page and no item cap in play (well under 1,000), so only the page cap can stop this.
		const page = () => ({ items: [hit('x')], next_cursor: 'more', mode: 'hybrid' });
		const responses = Array.from({ length: 25 }, () => on('POST', '/v1/artifacts/search', { body: page() }));
		const { ctx, calls } = mockExecute({
			params: { project: { mode: 'id', value: 'p1' }, query: '', returnAll: true, filters: {}, searchOptions: { mode: 'hybrid' } },
			responses,
		});
		const out = await search({ ...a, ctx });
		expect(out).toHaveLength(20);
		expect(calls).toHaveLength(20);
	});
});
