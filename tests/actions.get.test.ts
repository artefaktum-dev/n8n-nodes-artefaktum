import { describe, expect, it } from 'vitest';
import get from '../nodes/Artefaktum/actions/artifact/get';
import { simplifyArtifact } from '../nodes/Artefaktum/actions/common';
import { mockExecute, on } from './helpers/mockExecute';

const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'; // sha256("abc")
const shaZzz = '17f165d5a5ba695f27c023a83aa2b3463e23810e360b7517127e90161eebabda'; // sha256("zzz")
const artifact = { id: 'a1', title: 'T', status: 'ready', latest_version: { id: 'v1', content_type: 'text/plain', original_filename: 'abc.txt', sha256: sha, size_bytes: 3 } };
const dl = { url: 'https://r2.test/get?sig', method: 'GET', expires_at: '2030-01-01T00:00:00Z', version_id: 'v1' };
// A version older than latest_version, with its own filename, mime type and digest.
const v0 = { id: 'v0', version_number: 1, original_filename: 'v0.bin', content_type: 'application/x-v0', size_bytes: 3, etag: null, sha256: shaZzz, status: 'ready', created_at: '2026-01-01T00:00:00Z' };

describe('artifact:get as binary', () => {
	it('puts verified bytes into the binary property and the artifact into json', async () => {
		const { ctx, calls } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', getOptions: { simplify: false } },
			responses: [on('GET', '/v1/artifacts/a1', { body: artifact }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abc' })],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toEqual(artifact);
		expect(item.binary?.data).toMatchObject({ fileName: 'abc.txt', mimeType: 'text/plain' });
		expect(Buffer.from(item.binary!.data.data, 'base64').toString()).toBe('abc');
		expect(calls[1].qs).toBeUndefined();
		expect(calls).toHaveLength(3); // no /versions lookup when the served version is already latest_version
	});

	it('requests a specific version and labels the file from that version, not latest', async () => {
		const { ctx, calls } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', getOptions: { simplify: false, versionId: 'v0', binaryPropertyName: 'file' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', 'r2.test', { body: 'zzz' }),
				on('GET', '/v1/artifacts/a1/versions', { body: [v0] }),
			],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(calls[1].qs).toEqual({ version_id: 'v0' });
		expect(item.binary?.file?.fileName).toBe('v0.bin');
		expect(item.binary?.file?.mimeType).toBe('application/x-v0');
	});

	it('still lets the File Name option override the versioned file name', async () => {
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', getOptions: { simplify: false, versionId: 'v0', binaryPropertyName: 'file', fileName: 'renamed.txt' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', 'r2.test', { body: 'zzz' }),
				on('GET', '/v1/artifacts/a1/versions', { body: [v0] }),
			],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.binary?.file?.fileName).toBe('renamed.txt');
	});

	it("verifies a specific version against that version's own digest, not latest_version's", async () => {
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', getOptions: { simplify: false, versionId: 'v0' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', 'r2.test', { body: 'zzz' }),
				on('GET', '/v1/artifacts/a1/versions', { body: [v0] }),
			],
		});
		// bytes "zzz" match v0's digest, so this must succeed even though it differs from latest_version's sha256.
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(Buffer.from(item.binary!.data.data, 'base64').toString()).toBe('zzz');
	});

	it('fails a wrong digest for the requested version, not for latest', async () => {
		const wrongV0 = { ...v0, sha256: sha }; // latest_version's digest, wrong for v0's bytes
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', getOptions: { simplify: false, versionId: 'v0' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', 'r2.test', { body: 'zzz' }),
				on('GET', '/v1/artifacts/a1/versions', { body: [wrongV0] }),
			],
		});
		await expect(get({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow(/checksum/i);
	});

	it('fails on a checksum mismatch', async () => {
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', getOptions: { simplify: false } },
			responses: [on('GET', '/v1/artifacts/a1', { body: artifact }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abd' })],
		});
		await expect(get({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow(/checksum/i);
	});
});

describe('artifact:get as text', () => {
	const responses = () => [on('GET', '/v1/artifacts/a1', { body: artifact }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abc' })];

	it('returns the content in json and no binary property', async () => {
		const { ctx } = mockExecute({ params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false } }, responses: responses() });
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toEqual({ ...artifact, content: 'abc', content_truncated: false, content_characters: 3, content_version_id: 'v1' });
		expect(item.binary).toBeUndefined();
	});

	it('defaults to binary when Output is not set', async () => {
		const { ctx } = mockExecute({ params: { lookup: 'id', artifactId: 'a1', getOptions: { simplify: false } }, responses: responses() });
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.binary?.data).toBeDefined();
		expect(item.json).toEqual(artifact);
	});

	it('cuts the content at Max Characters and says so', async () => {
		const { ctx } = mockExecute({ params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false, maxCharacters: 2 } }, responses: responses() });
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toMatchObject({ content: 'ab', content_truncated: true, content_characters: 3, content_version_id: 'v1' });
	});

	it('returns the whole content, not empty, when Max Characters is not a number', async () => {
		const { ctx } = mockExecute({ params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false, maxCharacters: 'abc' } }, responses: responses() });
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toMatchObject({ content: 'abc', content_truncated: false });
	});

	it('uses 50,000 characters when Max Characters is not set', async () => {
		const long = 'x'.repeat(60_000);
		const shaLong = (await import('node:crypto')).createHash('sha256').update(long).digest('hex');
		const big = { ...artifact, latest_version: { ...artifact.latest_version, sha256: shaLong, size_bytes: 60_000 } };
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false } },
			responses: [on('GET', '/v1/artifacts/a1', { body: big }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: long })],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect((item.json.content as string).length).toBe(50_000);
		expect(item.json).toMatchObject({ content_truncated: true, content_characters: 60_000, content_version_id: 'v1' });
	});

	it('still verifies the checksum before returning text', async () => {
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false } },
			responses: [on('GET', '/v1/artifacts/a1', { body: artifact }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'tampered' })],
		});
		await expect(get({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow(/Checksum mismatch/);
	});

	it('refuses a binary file and names its type', async () => {
		const png = { ...artifact, latest_version: { ...artifact.latest_version, content_type: 'image/png', original_filename: 'a.png' } };
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false } },
			responses: [on('GET', '/v1/artifacts/a1', { body: png }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abc' })],
		});
		await expect(get({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow(/image\/png.*Binary File/s);
	});

	it('refuses a binary file before making any request to storage', async () => {
		const png = { ...artifact, latest_version: { ...artifact.latest_version, content_type: 'image/png', original_filename: 'a.png' } };
		const { ctx, calls } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false } },
			responses: [on('GET', '/v1/artifacts/a1', { body: png }), on('GET', '/v1/artifacts/a1/download', { body: dl })],
		});
		await expect(get({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow(/image\/png.*Binary File/s);
		expect(calls.some((c) => c.url.includes('r2.test'))).toBe(false);
	});

	it('refuses a file over 25 MB before making any request to storage', async () => {
		const big = { ...artifact, latest_version: { ...artifact.latest_version, size_bytes: 26_214_401 } };
		const { ctx, calls } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false } },
			responses: [on('GET', '/v1/artifacts/a1', { body: big }), on('GET', '/v1/artifacts/a1/download', { body: dl })],
		});
		let message = '';
		try {
			await get({ ctx, itemIndex: 0, projectCache: new Map() });
		} catch (err) {
			message = (err as Error).message;
		}
		expect(message).toContain('25.0 MB');
		expect(message).toContain('Binary File');
		expect(calls.some((c) => c.url.includes('r2.test'))).toBe(false);
	});

	it('does not refuse a file of exactly 25 MB', async () => {
		const exact = { ...artifact, latest_version: { ...artifact.latest_version, size_bytes: 26_214_400 } };
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false } },
			responses: [on('GET', '/v1/artifacts/a1', { body: exact }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abc' })],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toMatchObject({ content: 'abc' });
	});

	it("checks the SERVED version's type, not latest_version's", async () => {
		const { ctx, calls } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false, versionId: 'v0' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', '/v1/artifacts/a1/versions', { body: [v0] }),
			],
		});
		await expect(get({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow(/application\/x-v0.*Binary File/s);
		expect(calls.some((c) => c.url.includes('r2.test'))).toBe(false);
	});

	it('succeeds for a text version served instead of latest, and labels which version it read', async () => {
		const v0Text = { ...v0, content_type: 'text/plain' };
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', output: 'text', getOptions: { simplify: false, versionId: 'v0' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', '/v1/artifacts/a1/versions', { body: [v0Text] }),
				on('GET', 'r2.test', { body: 'zzz' }),
			],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json.content).toBe('zzz');
		expect(item.json.content_version_id).toBe('v0');
	});
});

describe('artifact:get details and by key', () => {
	const full = { ...artifact, description: 'D', metadata: { k: 1 }, created_at: '2026-01-01T00:00:00.000Z' };
	const projects = { items: [{ id: 'p1', name: 'default', slug: 'default' }] };
	const keyParams = { lookup: 'key', key: 'k', project: { mode: 'slug', value: 'default' }, maxAgeSeconds: 0 };

	it('details only makes no download call and simplifies by default', async () => {
		const { ctx, calls } = mockExecute({ params: { lookup: 'id', artifactId: 'a1', output: 'details' }, responses: [on('GET', '/v1/artifacts/a1', { body: full })] });
		const out = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(out).toEqual([{ json: simplifyArtifact(full), pairedItem: { item: 0 } }]);
		expect(calls).toHaveLength(1);
	});

	it('details only returns the raw object when simplify is off', async () => {
		const { ctx } = mockExecute({ params: { lookup: 'id', artifactId: 'a1', output: 'details', getOptions: { simplify: false } }, responses: [on('GET', '/v1/artifacts/a1', { body: full })] });
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toEqual(full);
	});

	it('simplify applies to the json half of a binary download', async () => {
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', getOptions: {} },
			responses: [on('GET', '/v1/artifacts/a1', { body: full }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abc' })],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toEqual(simplifyArtifact(full));
		expect(item.binary?.data).toBeDefined();
	});

	it('simplify applies under the text fields too', async () => {
		const { ctx } = mockExecute({
			params: { lookup: 'id', artifactId: 'a1', output: 'text' },
			responses: [on('GET', '/v1/artifacts/a1', { body: full }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abc' })],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toEqual({ ...simplifyArtifact(full), content: 'abc', content_truncated: false, content_characters: 3, content_version_id: 'v1' });
	});

	it('by key hit carries found true', async () => {
		const { ctx, calls } = mockExecute({
			params: { ...keyParams, output: 'details', getOptions: { simplify: false } },
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/k', { body: full })],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toEqual({ ...full, found: true });
		expect(calls[1].qs).toEqual({ project_id: 'p1' });
	});

	it('by key binary download carries found true', async () => {
		const { ctx } = mockExecute({
			params: keyParams,
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/k', { body: full }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abc' })],
		});
		const [item] = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json.found).toBe(true);
		expect(item.binary?.data).toBeDefined();
	});

	it('a miss returns json only, no binary property', async () => {
		const { ctx, calls } = mockExecute({
			params: { ...keyParams, ifNotFound: 'empty' },
			responses: [on('GET', '/v1/projects', { body: projects }), on('GET', '/by-external-key/k', { statusCode: 404, body: { detail: 'nope' } })],
		});
		const out = await get({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(out).toHaveLength(1);
		expect('binary' in out[0]).toBe(false);
		expect(out[0].json).toEqual({ found: false, key: 'k', project_id: 'p1', reason: 'missing' });
		expect(out[0].pairedItem).toEqual({ item: 0 });
		expect(calls).toHaveLength(2);
	});
});
