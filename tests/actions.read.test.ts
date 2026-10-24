import { describe, expect, it } from 'vitest';
import del from '../nodes/Artefaktum/actions/artifact/del';
import update from '../nodes/Artefaktum/actions/artifact/update';
import { mockExecute, on } from './helpers/mockExecute';

const projects = { items: [{ id: 'p1', name: 'default', slug: 'default' }, { id: 'p2', name: 'R', slug: 'r' }] };
const artifact = { id: 'a1', title: 'T', status: 'ready' };
const a = { ctx: undefined as never, itemIndex: 0, projectCache: new Map<string, string>() };

describe('artifact:update', () => {
	it('sends only the fields that are set', async () => {
		const { ctx, calls } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', updateFields: { title: 'New', tags: 'x, y', metadata: '{"k":1}', clearExpiresAt: true } },
			responses: [on('GET', '/v1/artifacts/a1', { body: artifact }), on('PATCH', '/v1/artifacts/a1', { body: { ...artifact, title: 'New' } })],
		});
		const out = await update({ ...a, ctx });
		expect(out[0].json).toMatchObject({ title: 'New' });
		expect(calls[1].body).toEqual({ title: 'New', tags: ['x', 'y'], metadata: { k: 1 }, clear_expires_at: true });
	});

	it('refuses an empty update', async () => {
		const { ctx } = mockExecute({ params: { lookup: 'id', artifactId: 'a1', updateFields: {} }, responses: [on('GET', '/v1/artifacts/a1', { body: artifact })] });
		await expect(update({ ...a, ctx })).rejects.toThrow(/at least one field/i);
	});
});

describe('artifact:update by key', () => {
	it('update by key resolves the id first', async () => {
		const { ctx, calls } = mockExecute({
			params: { lookup: 'key', key: 'k1', project: { mode: 'id', value: 'p1' }, updateFields: { title: 'New' } },
			responses: [on('GET', '/v1/artifacts/by-external-key/k1', { body: artifact }), on('PATCH', '/v1/artifacts/a1', { body: { ...artifact, title: 'New' } })],
		});
		await update({ ...a, ctx });
		expect(calls.map((c) => `${c.method} ${c.url}`).join('|')).toMatch(/by-external-key\/k1.*\|PATCH .*\/v1\/artifacts\/a1$/);
	});

	it('update by slug resolves the project, then the key, then patches', async () => {
		const { ctx, calls } = mockExecute({
			params: { lookup: 'key', key: 'k1', project: { mode: 'slug', value: 'r' }, updateFields: { title: 'New' } },
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/v1/artifacts/by-external-key/k1', { body: artifact }), on('PATCH', '/v1/artifacts/a1', { body: artifact })],
		});
		await update({ ...a, ctx });
		expect(calls).toHaveLength(3);
		expect(calls[2].method).toBe('PATCH');
	});
});

describe('artifact:delete', () => {
	it('delete by key that is missing throws No artifact with key', async () => {
		const { ctx } = mockExecute({
			params: { lookup: 'key', key: 'K', project: { mode: 'id', value: 'P' } },
			responses: [on('GET', '/v1/artifacts/by-external-key/K', { statusCode: 404, body: { detail: 'nope' } })],
		});
		await expect(del({ ...a, ctx })).rejects.toThrow("No artifact with key 'K' in project 'P'");
	});

	it('deletes and reports', async () => {
		const { ctx, calls } = mockExecute({ params: { lookup: 'id', artifactId: 'a1' }, responses: [on('GET', '/v1/artifacts/a1', { body: artifact }), on('DELETE', '/v1/artifacts/a1', { statusCode: 202, body: undefined })] });
		expect(await del({ ...a, ctx })).toEqual([{ json: { id: 'a1', deleted: true }, pairedItem: { item: 0 } }]);
		expect(calls[1].method).toBe('DELETE');
	});
});
