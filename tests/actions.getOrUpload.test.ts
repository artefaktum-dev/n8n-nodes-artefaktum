import { describe, expect, it } from 'vitest';
import getOrUpload from '../nodes/Artefaktum/actions/artifact/getOrUpload';
import { mockExecute, on } from './helpers/mockExecute';

const projects = { items: [{ id: 'p1', name: 'default', slug: 'default' }] };
const artifact = { id: 'a1', title: 'Weather', status: 'ready', external_key: 'weather:today' };
const upload = { method: 'PUT', url: 'https://r2.test/o?sig', headers: {}, expires_at: '2030-01-01T00:00:00Z' };
const params = { project: { mode: 'slug', value: 'default' }, externalKey: 'weather:today', maxAgeSeconds: 3600, inputDataSource: 'text', content: 'sunny', filename: '', contentType: '', title: 'Weather', uploadOptions: {} };

describe('artifact:getOrUpload', () => {
	it('returns the stored artifact on a hit without uploading', async () => {
		const { ctx, calls } = mockExecute({ params, responses: [on('GET', '/v1/projects', { body: projects }), on('POST', '/v1/artifacts/resolve', { body: { status: 'hit', artifact } })] });
		const out = await getOrUpload({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(out).toEqual([{ json: { ...artifact, cache: 'hit' }, pairedItem: { item: 0 } }]);
		const resolve = calls[1].body as Record<string, unknown>;
		expect(resolve).toMatchObject({ project_id: 'p1', external_key: 'weather:today', max_age_seconds: 3600, filename: 'content.txt', content_type: 'text/plain', size_bytes: 5, title: 'Weather' });
		expect(calls).toHaveLength(2);
	});

	it('sends no max_age when 0', async () => {
		const { ctx, calls } = mockExecute({ params: { ...params, maxAgeSeconds: 0 }, responses: [on('GET', '/v1/projects', { body: projects }), on('POST', '/v1/artifacts/resolve', { body: { status: 'hit', artifact } })] });
		await getOrUpload({ ctx, itemIndex: 0, projectCache: new Map() });
		expect((calls[1].body as Record<string, unknown>).max_age_seconds).toBeUndefined();
	});

	it('uploads and completes on create', async () => {
		const { ctx, calls } = mockExecute({
			params,
			responses: [
				on('GET', '/v1/projects', { body: projects }),
				on('POST', '/v1/artifacts/resolve', { body: { status: 'create', reservation: { id: 'a2', status: 'pending_upload', version_id: 'v2' }, upload } }),
				on('PUT', 'r2.test', { body: '' }),
				on('POST', '/v1/artifacts/a2/versions/v2/complete', { body: { id: 'a2', status: 'processing', version_id: 'v2' } }),
				on('GET', '/v1/artifacts/a2', { body: { ...artifact, id: 'a2' } }),
			],
		});
		const out = await getOrUpload({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(out[0].json).toEqual({ ...artifact, id: 'a2', cache: 'created' });
		expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'PUT', 'POST', 'GET']);
	});

	it('waits and retries while another upload is pending', async () => {
		const { ctx, calls } = mockExecute({
			params,
			responses: [
				on('GET', '/v1/projects', { body: projects }),
				on('POST', '/v1/artifacts/resolve', { body: { status: 'pending', retry_after_seconds: 0 } }),
				on('POST', '/v1/artifacts/resolve', { body: { status: 'hit', artifact } }),
			],
		});
		const out = await getOrUpload({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(out[0].json).toMatchObject({ cache: 'hit' });
		expect(calls.filter((c) => c.url.endsWith('/resolve'))).toHaveLength(2);
	});

	it('gives up after five pending answers', async () => {
		const pending = on('POST', '/v1/artifacts/resolve', { body: { status: 'pending', retry_after_seconds: 0 } });
		const { ctx } = mockExecute({ params, responses: [on('GET', '/v1/projects', { body: projects }), pending, pending, pending, pending, pending, pending] });
		await expect(getOrUpload({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow(/still being uploaded/);
	});

	it('never sends expires_at to resolve, even when set', async () => {
		const { ctx, calls } = mockExecute({
			params: { ...params, uploadOptions: { summary: 'x', expiresInHours: 3, description: 'd', tags: 'a' } },
			responses: [on('GET', '/v1/projects', { body: projects }), on('POST', '/v1/artifacts/resolve', { body: { status: 'hit', artifact } })],
		});
		await getOrUpload({ ctx, itemIndex: 0, projectCache: new Map() });
		const resolve = calls[1].body as Record<string, unknown>;
		expect(resolve).toMatchObject({ description: 'd', tags: ['a'] });
		expect(resolve.summary).toBeUndefined();
		expect(resolve.expires_at).toBeUndefined();
	});
});
