import { describe, expect, it } from 'vitest';
import { lookupArtifact } from '../nodes/Artefaktum/actions/lookup';
import { mockExecute, on } from './helpers/mockExecute';

const projects = { items: [{ id: 'p1', name: 'default', slug: 'default' }, { id: 'p2', name: 'R', slug: 'r' }] };
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
const tenYears = 10 * 365 * 24 * 3600;
const base = { lookup: 'key', key: 'k1', project: { mode: 'slug', value: 'default' }, maxAgeSeconds: 0, ifNotFound: 'error' };

describe('lookupArtifact', () => {
	it('by id fetches the artifact and ignores maxAgeSeconds', async () => {
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', maxAgeSeconds: 1 },
			responses: [on('GET', '/v1/artifacts/a1', { body: { id: 'a1', updated_at: ago(tenYears) } })],
		});
		const r = await lookupArtifact(ctx, 0, new Map(), { allowMissing: true });
		expect(r.found).toBe(true);
	});

	it('with allowMissing false ignores a stray Max Age', async () => {
		const { ctx } = mockExecute({
			params: { ...base, maxAgeSeconds: 1, ifNotFound: 'empty' },
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/', { body: { id: 'a1', updated_at: ago(tenYears) } })],
		});
		const r = await lookupArtifact(ctx, 0, new Map(), { allowMissing: false });
		expect(r.found).toBe(true);
	});

	it('by key is url-encoded and carries the project id', async () => {
		const { ctx, calls } = mockExecute({
			params: { ...base, key: 'weather:today/vilnius', project: { mode: 'slug', value: 'r' } },
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/', { body: { id: 'a1', updated_at: ago(5) } })],
		});
		await lookupArtifact(ctx, 0, new Map(), { allowMissing: true });
		expect(calls[1].url.endsWith('/by-external-key/weather%3Atoday%2Fvilnius')).toBe(true);
		expect(calls[1].qs).toEqual({ project_id: 'p2' });
	});

	it('trims the key', async () => {
		const { ctx, calls } = mockExecute({
			params: { ...base, key: ' k1 ' },
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/', { body: { id: 'a1', updated_at: ago(5) } })],
		});
		await lookupArtifact(ctx, 0, new Map(), { allowMissing: true });
		expect(calls[1].url.endsWith('/by-external-key/k1')).toBe(true);
	});

	it("a 404 by key throws \"No artifact with key 'k1' in project 'default'\" when ifNotFound is error", async () => {
		const { ctx } = mockExecute({
			params: base,
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/', { statusCode: 404, body: { detail: 'nope' } })],
		});
		await expect(lookupArtifact(ctx, 0, new Map(), { allowMissing: true })).rejects.toThrow("No artifact with key 'k1' in project 'default'");
	});

	it('a 404 by key returns found false with reason missing when ifNotFound is empty', async () => {
		const { ctx } = mockExecute({
			params: { ...base, ifNotFound: 'empty' },
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/', { statusCode: 404, body: { detail: 'nope' } })],
		});
		expect(await lookupArtifact(ctx, 0, new Map(), { allowMissing: true })).toEqual({ found: false, key: 'k1', projectId: 'p1', reason: 'missing' });
	});

	it('an artifact older than Max Age is stale', async () => {
		const reply = () => [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/', { body: { id: 'a1', updated_at: ago(7200) } })];
		const empty = mockExecute({ params: { ...base, maxAgeSeconds: 3600, ifNotFound: 'empty' }, responses: reply() });
		const r = await lookupArtifact(empty.ctx, 0, new Map(), { allowMissing: true });
		expect(r).toMatchObject({ found: false, reason: 'stale', key: 'k1', projectId: 'p1' });
		const err = mockExecute({ params: { ...base, maxAgeSeconds: 3600 }, responses: reply() });
		await expect(lookupArtifact(err.ctx, 0, new Map(), { allowMissing: true })).rejects.toThrow(/older than Max Age \(3600\)/);
	});

	it('update and delete never get a Missing', async () => {
		const { ctx } = mockExecute({
			params: { ...base, ifNotFound: 'empty' },
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/', { statusCode: 404, body: {} })],
		});
		await expect(lookupArtifact(ctx, 0, new Map(), { allowMissing: false })).rejects.toThrow("No artifact with key 'k1'");
	});

	it('rejects empty key and empty id', async () => {
		const k = mockExecute({ params: { ...base, key: '  ' }, responses: [on('GET', '/v1/projects', { body: projects })] });
		await expect(lookupArtifact(k.ctx, 0, new Map(), { allowMissing: false })).rejects.toThrow("Parameter 'Key' is empty");
		const i = mockExecute({ params: { lookup: 'id', artifactId: '' }, responses: [] });
		await expect(lookupArtifact(i.ctx, 0, new Map(), { allowMissing: false })).rejects.toThrow("Parameter 'Artifact ID' is empty");
	});
});
