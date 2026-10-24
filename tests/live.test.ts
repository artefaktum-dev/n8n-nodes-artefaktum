import { describe, expect, it } from 'vitest';
import { sleep } from 'n8n-workflow';
import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import del from '../nodes/Artefaktum/actions/artifact/del';
import get from '../nodes/Artefaktum/actions/artifact/get';
import upload from '../nodes/Artefaktum/actions/artifact/upload';

const KEY = import.meta.env.ARTEFAKTUM_TEST_API_KEY as string | undefined;
const BASE = (import.meta.env.ARTEFAKTUM_TEST_BASE_URL as string | undefined) ?? 'https://api.artefaktum.dev';

async function realRequest(options: IHttpRequestOptions, auth: boolean) {
	const headers: Record<string, string> = { ...((options.headers as Record<string, string>) ?? {}) };
	if (auth) headers.Authorization = `Bearer ${KEY}`;
	if (options.json && options.body !== undefined) headers['content-type'] = 'application/json';
	const url = new URL(String(options.url));
	for (const [k, v] of Object.entries((options.qs as Record<string, string>) ?? {})) url.searchParams.set(k, String(v));
	const res = await fetch(url, { method: options.method, headers, body: options.json && options.body !== undefined ? JSON.stringify(options.body) : (options.body as BodyInit | undefined) });
	const text = options.encoding === 'arraybuffer' ? Buffer.from(await res.arrayBuffer()) : await res.text();
	let body: unknown = text;
	if (options.encoding !== 'arraybuffer' && typeof text === 'string' && text && (res.headers.get('content-type') ?? '').includes('json')) body = JSON.parse(text);
	return { statusCode: res.status, headers: Object.fromEntries(res.headers), body };
}

function liveCtx(params: Record<string, unknown>): IExecuteFunctions {
	const node = { name: 'live', type: 'n8n-nodes-artefaktum.artefaktum', typeVersion: 1, position: [0, 0], parameters: {} };
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => params[name] ?? fallback,
		getCredentials: async () => ({ apiKey: KEY, baseUrl: BASE }),
		continueOnFail: () => false,
		getNode: () => node,
		helpers: {
			httpRequestWithAuthentication: async (_c: string, o: IHttpRequestOptions) => realRequest(o, true),
			httpRequest: async (o: IHttpRequestOptions) => realRequest(o, false),
			prepareBinaryData: async (buffer: Buffer, fileName?: string, mimeType?: string) => ({ data: buffer.toString('base64'), mimeType: mimeType ?? 'application/octet-stream', fileName }),
		},
	} as unknown as IExecuteFunctions;
}

describe.skipIf(!KEY)('live API', () => {
	const stamp = Date.now();
	const key = `n8n-live-test:${stamp}`;
	const project = { mode: 'slug', value: 'default' };
	let id = '';

	const run = (action: typeof upload, params: Record<string, unknown>) => action({ ctx: liveCtx(params), itemIndex: 0, projectCache: new Map() });

	it('uploads text with a key', async () => {
		const [item] = await run(upload, { project, inputDataSource: 'text', content: `hello ${stamp}`, title: `n8n live ${stamp}`, key, ifKeyExists: 'error', uploadOptions: { tags: 'n8n-live-test', expiresInHours: 1 } });
		id = String(item.json.id);
		expect(item.json.title).toBe(`n8n live ${stamp}`);
	}, 60_000);

	it('gets it by key', async () => {
		const [item] = await run(get, { lookup: 'key', key, project, maxAgeSeconds: 0, ifNotFound: 'error', output: 'details', getOptions: {} });
		expect(item.json.found).toBe(true);
		expect(item.json.id).toBe(id);
	}, 30_000);

	it('upload with reuse hits', async () => {
		const [item] = await run(upload, { project, inputDataSource: 'text', content: 'ignored', title: '', key, ifKeyExists: 'reuse', maxAgeSeconds: 0, uploadOptions: {} });
		expect(item.json.cache).toBe('hit');
		expect(item.json.id).toBe(id);
	}, 60_000);

	it('upload with version under the same key returns the same id', async () => {
		const [item] = await run(upload, { project, inputDataSource: 'text', content: `v2 ${stamp}`, title: '', key, ifKeyExists: 'version', maxAgeSeconds: 0, uploadOptions: {} });
		expect(item.json.id).toBe(id);
	}, 60_000);

	it('reports a stale artifact as not found', async () => {
		await sleep(1500);
		const [item] = await run(get, { lookup: 'key', key, project, maxAgeSeconds: 1, ifNotFound: 'empty', output: 'details', getOptions: {} });
		expect(item.json.found).toBe(false);
		expect(item.json.reason).toBe('stale');
	}, 30_000);

	it('gets the content as text', async () => {
		// The worker may still be indexing; retry until the version is readable.
		for (let i = 0; i < 10; i++) {
			try {
				const [item] = await run(get, { lookup: 'key', key, project, maxAgeSeconds: 0, ifNotFound: 'error', output: 'text', getOptions: {} });
				expect(item.json.content).toBe(`hello ${stamp}`);
				return;
			} catch (e) {
				if (i === 9) throw e as Error;
				await sleep(3000);
			}
		}
	}, 60_000);

	it('reports an unknown key as not found', async () => {
		const [item] = await run(get, { lookup: 'key', key: `${key}:missing`, project, maxAgeSeconds: 0, ifNotFound: 'empty', output: 'details', getOptions: {} });
		expect(item.json.found).toBe(false);
	}, 30_000);

	it('deletes', async () => {
		const [item] = await run(del, { lookup: 'id', artifactId: id });
		expect(item.json.deleted).toBe(true);
	}, 30_000);
});
