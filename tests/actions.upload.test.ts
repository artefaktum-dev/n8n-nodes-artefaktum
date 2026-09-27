import { describe, expect, it } from 'vitest';
import upload from '../nodes/Artefaktum/actions/artifact/upload';
import { mockExecute, on } from './helpers/mockExecute';

const ticket = { artifact: { id: 'a1', status: 'pending_upload', version_id: 'v1' }, upload: { method: 'PUT', url: 'https://r2.test/o?sig', headers: { 'content-type': 'application/json' }, expires_at: '2030-01-01T00:00:00Z' } };
const artifact = { id: 'a1', title: 'Weather', status: 'processing', tags: ['weather'] };
const projects = { items: [{ id: 'p1', name: 'default', slug: 'default' }] };

const params = {
	project: { mode: 'slug', value: 'default' },
	inputDataSource: 'text',
	content: '{"temp":21}',
	filename: '',
	contentType: 'application/json',
	title: 'Weather',
	uploadOptions: { tags: 'weather, vilnius', description: 'Today', expiresInHours: 2, metadata: '{"city":"Vilnius"}', externalKey: 'weather:today' },
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
			params: { ...params, inputDataSource: 'binary', binaryPropertyName: 'data', title: '', contentType: '', uploadOptions: {} },
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
});
