import { describe, expect, it } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';
import upload from '../nodes/Artefaktum/actions/artifact/upload';
import { mockExecute, on } from './helpers/mockExecute';

const ticket = { artifact: { id: 'a1', status: 'pending_upload', version_id: 'v1' }, upload: { method: 'PUT', url: 'https://r2.test/o?sig', headers: { 'content-type': 'application/json' }, expires_at: '2030-01-01T00:00:00Z' } };
const artifact = { id: 'a1', title: 'Weather', status: 'processing', tags: ['weather'] };
const projects = { items: [{ id: 'p1', name: 'default', slug: 'default' }] };

const params = {
	project: { mode: 'slug', value: 'default' },
	inputDataSource: 'text',
	content: '{"temp":21}',
	title: 'Weather',
	key: 'weather:today',
	ifKeyExists: 'error',
	maxAgeSeconds: 0,
	uploadOptions: { tags: 'weather, vilnius', description: 'Today', expiresInHours: 2, metadata: '{"city":"Vilnius"}', contentType: 'application/json' },
};

describe('artifact:upload', () => {
	it('creates the upload, PUTs, completes and returns the artifact', async () => {
		const { ctx, calls } = mockExecute({
			params,
			responses: [
				on('GET', '/v1/projects', { body: projects }),
				on('POST', '/v1/artifacts/uploads', { body: ticket }),
				on('PUT', 'r2.test', { body: '' }),
				on('POST', '/complete', { body: ticket.artifact }),
				on('GET', '/v1/artifacts/a1', { body: artifact }),
			],
		});
		const out = await upload({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(out).toEqual([{ json: artifact, pairedItem: { item: 0 } }]);
		const create = calls.find((c) => c.url.endsWith('/v1/artifacts/uploads'))!.body as Record<string, unknown>;
		expect(create).toMatchObject({ project_id: 'p1', title: 'Weather', filename: 'content.json', content_type: 'application/json', size_bytes: 11, tags: ['weather', 'vilnius'], description: 'Today', metadata: { city: 'Vilnius' }, external_key: 'weather:today' });
		expect(typeof create.expires_at).toBe('string');
		expect(new Date(create.expires_at as string).getTime()).toBeGreaterThan(Date.now() + 1.9 * 3600 * 1000);
	});

	it('ignores a summary left over in a workflow saved with 0.1.3', async () => {
		const { ctx, calls } = mockExecute({
			params: { ...params, uploadOptions: { ...params.uploadOptions, summary: 'left over' } },
			responses: [
				on('GET', '/v1/projects', { body: projects }),
				on('POST', '/v1/artifacts/uploads', { body: ticket }),
				on('PUT', 'r2.test', { body: '' }),
				on('POST', '/complete', { body: ticket.artifact }),
				on('GET', '/v1/artifacts/a1', { body: artifact }),
			],
		});
		const out = await upload({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(out).toEqual([{ json: artifact, pairedItem: { item: 0 } }]);
		const createCall = calls.find((c) => c.url.endsWith('/v1/artifacts/uploads'))!;
		expect((createCall.body as Record<string, unknown>).summary).toBeUndefined();
	});

	it('defaults the title to the filename and omits unset options', async () => {
		const { ctx, calls } = mockExecute({
			items: [{ json: {}, binary: { data: { data: Buffer.from('x').toString('base64'), mimeType: 'text/csv', fileName: 'rows.csv' } } }],
			params: { ...params, inputDataSource: 'binary', binaryPropertyName: 'data', title: '', key: '', uploadOptions: {} },
			responses: [on('GET', '/v1/projects', { body: projects }), on('POST', '/v1/artifacts/uploads', { body: ticket }), on('PUT', 'r2.test', { body: '' }), on('POST', '/complete', { body: ticket.artifact }), on('GET', '/v1/artifacts/a1', { body: artifact })],
		});
		await upload({ ctx, itemIndex: 0, projectCache: new Map() });
		const create = calls.find((c) => c.url.endsWith('/v1/artifacts/uploads'))!.body as Record<string, unknown>;
		expect(create).toEqual({ project_id: 'p1', title: 'rows.csv', filename: 'rows.csv', content_type: 'text/csv', size_bytes: 1 });
	});

	it('rejects invalid metadata JSON naming the field', async () => {
		const { ctx } = mockExecute({ params: { ...params, uploadOptions: { metadata: '{nope' } }, responses: [on('GET', '/v1/projects', { body: projects })] });
		await expect(upload({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow("'Metadata (JSON)'");
	});

	it('keeps a NodeOperationError for invalid metadata JSON on the plain path', async () => {
		const { ctx } = mockExecute({ params: { ...params, uploadOptions: { metadata: '{nope' } }, responses: [on('GET', '/v1/projects', { body: projects })] });
		await expect(upload({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toBeInstanceOf(NodeOperationError);
	});

	it('keeps a NodeOperationError for invalid metadata JSON on the version path', async () => {
		const { ctx } = mockExecute({ params: { ...params, ifKeyExists: 'version', uploadOptions: { metadata: '{nope' } }, responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/', { statusCode: 404, body: { detail: 'nf' } })] });
		await expect(upload({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toBeInstanceOf(NodeOperationError);
	});

	describe('If Key Exists', () => {
		const run = (ctx: never) => upload({ ctx, itemIndex: 0, projectCache: new Map() });
		const key = { ...params, key: 'k1', title: '', uploadOptions: {} };
		const done = [on('PUT', 'r2.test', { body: '' }), on('POST', '/complete', { body: ticket.artifact })];
		const versionTicket = { artifact: { id: 'a1', status: 'pending_upload', version_id: 'v2' }, upload: ticket.upload };
		const resolveUpload = { method: 'PUT', url: 'https://r2.test/o?sig', headers: {}, expires_at: '2030-01-01T00:00:00Z' };

		it('trims the key before resolve', async () => {
			const { ctx, calls } = mockExecute({ params: { ...key, key: '  k1 ', ifKeyExists: 'reuse' }, responses: [on('GET', '/v1/projects', { body: projects }), on('POST', '/v1/artifacts/resolve', { body: { status: 'hit', artifact } })] });
			const res = await run(ctx as never);
			expect((calls[1].body as Record<string, unknown>).external_key).toBe('k1');
			expect(res[0].json).toEqual({ ...artifact, cache: 'hit' });
		});

		it('a 409 on plain upload names the key and the project', async () => {
			const { ctx } = mockExecute({ params: key, responses: [on('GET', '/v1/projects', { body: projects }), on('POST', '/v1/artifacts/uploads', { statusCode: 409, body: { detail: 'dup' } })] });
			await expect(run(ctx as never)).rejects.toThrow("An artifact with key 'k1' already exists in project 'default'. Set If Key Exists to add a version or reuse it.");
		});

		it('an empty key behaves as error', async () => {
			const { ctx, calls } = mockExecute({ params: { ...key, key: '', ifKeyExists: 'version' }, responses: [on('GET', '/v1/projects', { body: projects }), on('POST', '/v1/artifacts/uploads', { body: ticket }), ...done, on('GET', '/v1/artifacts/a1', { body: artifact })] });
			await run(ctx as never);
			expect((calls[1].body as Record<string, unknown>).external_key).toBeUndefined();
		});

		it('version path adds a version when the key exists', async () => {
			const { ctx, calls } = mockExecute({ params: { ...key, ifKeyExists: 'version' }, responses: [on('GET', '/v1/projects', { body: projects }), on('GET', 'by-external-key/k1', { body: artifact }), on('POST', '/v1/artifacts/a1/uploads', { body: versionTicket }), ...done, on('GET', '/v1/artifacts/a1', { body: artifact })] });
			const res = await run(ctx as never);
			expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.test', '')}`)).toEqual([
				'GET /v1/projects', 'GET /v1/artifacts/by-external-key/k1', 'POST /v1/artifacts/a1/uploads', 'PUT https://r2.test/o?sig', 'POST /v1/artifacts/a1/versions/v2/complete', 'GET /v1/artifacts/a1',
			]);
			expect(calls[1].qs).toEqual({ project_id: 'p1' });
			expect(calls[2].body).toEqual({ filename: 'content.txt', content_type: 'text/plain', size_bytes: 11 });
			expect(res[0].json).toEqual(artifact);
			expect(res[0].json.cache).toBeUndefined();
		});

		it('version path creates when the key is missing', async () => {
			const { ctx, calls } = mockExecute({ params: { ...key, ifKeyExists: 'version' }, responses: [on('GET', '/v1/projects', { body: projects }), on('GET', 'by-external-key/k1', { statusCode: 404, body: {} }), on('POST', '/v1/artifacts/uploads', { body: ticket }), ...done, on('GET', '/v1/artifacts/a1', { body: artifact })] });
			await run(ctx as never);
			expect(calls[2].body).toMatchObject({ external_key: 'k1' });
		});

		it('version path retries once when the create loses a race', async () => {
			const { ctx, calls } = mockExecute({ params: { ...key, ifKeyExists: 'version' }, responses: [
				on('GET', '/v1/projects', { body: projects }),
				on('GET', 'by-external-key/k1', { statusCode: 404, body: {} }),
				on('POST', '/v1/artifacts/uploads', { statusCode: 409, body: {} }),
				on('GET', 'by-external-key/k1', { body: artifact }),
				on('POST', '/v1/artifacts/a1/uploads', { body: versionTicket }), ...done, on('GET', '/v1/artifacts/a1', { body: artifact })] });
			await run(ctx as never);
			expect(calls.filter((c) => c.url.includes('by-external-key'))).toHaveLength(2);
		});

		it('version path patches title and tags after the new version', async () => {
			const { ctx, calls } = mockExecute({ params: { ...key, ifKeyExists: 'version', title: 'New', uploadOptions: { tags: 'a, b' } }, responses: [on('GET', '/v1/projects', { body: projects }), on('GET', 'by-external-key/k1', { body: artifact }), on('POST', '/v1/artifacts/a1/uploads', { body: versionTicket }), ...done, on('GET', '/v1/artifacts/a1', { body: artifact }), on('PATCH', '/v1/artifacts/a1', { body: artifact }), on('GET', '/v1/artifacts/a1', { body: { ...artifact, title: 'New' } })] });
			const res = await run(ctx as never);
			const patch = calls.find((c) => c.method === 'PATCH')!;
			expect(patch.body).toEqual({ title: 'New', tags: ['a', 'b'] });
			expect(calls.indexOf(patch)).toBeGreaterThan(calls.findIndex((c) => c.url.endsWith('/complete')));
			expect(res[0].json.title).toBe('New');
		});

		it('reuse hit does not PATCH expiry', async () => {
			const { ctx, calls } = mockExecute({ params: { ...key, ifKeyExists: 'reuse', uploadOptions: { expiresInHours: 1 } }, responses: [on('GET', '/v1/projects', { body: projects }), on('POST', '/v1/artifacts/resolve', { body: { status: 'hit', artifact } })] });
			await run(ctx as never);
			expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
			expect((calls[1].body as Record<string, unknown>).expires_at).toBeUndefined();
		});

		it('reuse created patches expiry', async () => {
			const { ctx, calls } = mockExecute({ params: { ...key, ifKeyExists: 'reuse', uploadOptions: { expiresInHours: 1 } }, responses: [
				on('GET', '/v1/projects', { body: projects }),
				on('POST', '/v1/artifacts/resolve', { body: { status: 'create', reservation: { id: 'a2', status: 'pending_upload', version_id: 'v2' }, upload: resolveUpload } }),
				on('PUT', 'r2.test', { body: '' }), on('POST', '/complete', { body: {} }),
				on('GET', '/v1/artifacts/a2', { body: { ...artifact, id: 'a2' } }),
				on('PATCH', '/v1/artifacts/a2', { body: {} }),
				on('GET', '/v1/artifacts/a2', { body: { ...artifact, id: 'a2' } })] });
			const res = await run(ctx as never);
			const patch = calls.find((c) => c.method === 'PATCH')!.body as Record<string, unknown>;
			expect(Object.keys(patch)).toEqual(['expires_at']);
			expect(res[0].json).toMatchObject({ id: 'a2', cache: 'created' });
		});

		it('reuse waits while pending, then gives up after five rounds', async () => {
			const pending = on('POST', '/v1/artifacts/resolve', { body: { status: 'pending', retry_after_seconds: 0 } });
			const { ctx } = mockExecute({ params: { ...key, ifKeyExists: 'reuse' }, responses: [on('GET', '/v1/projects', { body: projects }), pending, pending, pending, pending, pending, pending] });
			await expect(run(ctx as never)).rejects.toThrow("The artifact under 'k1' is still being uploaded by another run. Try again in a minute.");
		});

		it('reuse sends max_age and never expires_at to resolve', async () => {
			const { ctx, calls } = mockExecute({ params: { ...key, ifKeyExists: 'reuse', maxAgeSeconds: 3600, uploadOptions: { expiresInHours: 3, description: 'd' } }, responses: [on('GET', '/v1/projects', { body: projects }), on('POST', '/v1/artifacts/resolve', { body: { status: 'hit', artifact } })] });
			await run(ctx as never);
			expect(calls[1].body).toMatchObject({ external_key: 'k1', max_age_seconds: 3600, description: 'd' });
			expect((calls[1].body as Record<string, unknown>).expires_at).toBeUndefined();
		});
	});
});
