import { describe, expect, it } from 'vitest';
import { NodeHelpers, NodeOperationError } from 'n8n-workflow';
import { Artefaktum } from '../nodes/Artefaktum/Artefaktum.node';
import { mockExecute, on } from './helpers/mockExecute';

describe('Artefaktum node', () => {
	it('declares the credential, has a hidden resource parameter and is usable as a tool', () => {
		const d = new Artefaktum().description;
		expect(d.credentials).toEqual([{ name: 'artefaktumApi', required: true }]);
		expect(d.usableAsTool).toBe(true);
		expect(d.properties.find((p) => p.name === 'resource')?.type).toBe('hidden');
		expect(d.subtitle).toBe('={{ $parameter["operation"] }}');
	});

	it('gives each operation its own AI tool description', () => {
		const description = new Artefaktum().description;
		const tool = (operation: string) => NodeHelpers.getToolDescriptionForNode({ parameters: { descriptionType: 'auto', resource: 'artifact', operation } } as never, { description } as never);
		expect(tool('search')).toContain('Search artifacts');
		expect(tool('get')).toContain('Get an artifact');
	});

	it('dispatches per item and pairs outputs', async () => {
		const { ctx } = mockExecute({
			items: [{ json: { n: 1 } }, { json: { n: 2 } }],
			params: (name, i) => ({ operation: 'delete', artifactId: `a${i}` })[name],
			responses: [
				on('GET', '/v1/artifacts/a0', { body: { id: 'a0' } }),
				on('DELETE', '/v1/artifacts/a0', { statusCode: 202, body: undefined }),
				on('GET', '/v1/artifacts/a1', { body: { id: 'a1' } }),
				on('DELETE', '/v1/artifacts/a1', { statusCode: 202, body: undefined }),
			],
		});
		const [out] = await new Artefaktum().execute.call(ctx);
		expect(out.map((o) => o.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
	});

	it('continues on fail with the API message in the item', async () => {
		const { ctx } = mockExecute({
			items: [{ json: {} }, { json: {} }],
			params: (name, i) => ({ operation: 'delete', artifactId: i === 0 ? 'missing' : 'a2' })[name],
			responses: [
				on('GET', '/v1/artifacts/missing', { statusCode: 404, body: { code: 'artifact_not_found', detail: 'no artifact missing', status: 404 } }),
				on('GET', '/v1/artifacts/a2', { body: { id: 'a2' } }),
				on('DELETE', '/v1/artifacts/a2', { statusCode: 202, body: undefined }),
			],
			continueOnFail: true,
		});
		const [out] = await new Artefaktum().execute.call(ctx);
		expect(out[0].json).toEqual({ error: 'no artifact missing' });
		expect(out[1].json).toEqual({ id: 'a2', deleted: true });
	});

	it('throws the API error when not continuing on fail', async () => {
		const { ctx } = mockExecute({
			params: { operation: 'delete', artifactId: 'missing' },
			responses: [on('GET', '/v1/artifacts/missing', { statusCode: 404, body: { detail: 'no artifact missing' } })],
		});
		await expect(new Artefaktum().execute.call(ctx)).rejects.toThrow('no artifact missing');
	});

	it('rejects an unknown operation clearly', async () => {
		const { ctx } = mockExecute({ params: { operation: 'fly' }, responses: [] });
		await expect(new Artefaktum().execute.call(ctx)).rejects.toThrow("The operation 'fly' is not supported");
	});

	it('surfaces an empty Artifact ID as a NodeOperationError, not wrapped in NodeApiError', async () => {
		const { ctx } = mockExecute({ params: { operation: 'delete', artifactId: '' }, responses: [] });
		await expect(new Artefaktum().execute.call(ctx)).rejects.toThrow("'Artifact ID' is empty");
		const err = await new Artefaktum().execute.call(ctx).catch((e) => e);
		expect(err).toBeInstanceOf(NodeOperationError);
	});
});
