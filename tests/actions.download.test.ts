import { describe, expect, it } from 'vitest';
import download from '../nodes/Artefaktum/actions/artifact/download';
import { mockExecute, on } from './helpers/mockExecute';

const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'; // sha256("abc")
const shaZzz = '17f165d5a5ba695f27c023a83aa2b3463e23810e360b7517127e90161eebabda'; // sha256("zzz")
const artifact = { id: 'a1', title: 'T', status: 'ready', latest_version: { id: 'v1', content_type: 'text/plain', original_filename: 'abc.txt', sha256: sha, size_bytes: 3 } };
const dl = { url: 'https://r2.test/get?sig', method: 'GET', expires_at: '2030-01-01T00:00:00Z', version_id: 'v1' };
// A version older than latest_version, with its own filename, mime type and digest.
const v0 = { id: 'v0', version_number: 1, original_filename: 'v0.bin', content_type: 'application/x-v0', size_bytes: 3, etag: null, sha256: shaZzz, status: 'ready', created_at: '2026-01-01T00:00:00Z' };

describe('artifact:download', () => {
	it('puts verified bytes into the binary property and the artifact into json', async () => {
		const { ctx, calls } = mockExecute({
			params: { artifactId: 'a1', downloadOptions: {} },
			responses: [on('GET', '/v1/artifacts/a1', { body: artifact }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abc' })],
		});
		const [item] = await download({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.json).toEqual(artifact);
		expect(item.binary?.data).toMatchObject({ fileName: 'abc.txt', mimeType: 'text/plain' });
		expect(Buffer.from(item.binary!.data.data, 'base64').toString()).toBe('abc');
		expect(calls[1].qs).toBeUndefined();
		expect(calls).toHaveLength(3); // no /versions lookup when the served version is already latest_version
	});

	it('requests a specific version and labels the file from that version, not latest', async () => {
		const { ctx, calls } = mockExecute({
			params: { artifactId: 'a1', downloadOptions: { versionId: 'v0', binaryPropertyName: 'file' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', 'r2.test', { body: 'zzz' }),
				on('GET', '/v1/artifacts/a1/versions', { body: [v0] }),
			],
		});
		const [item] = await download({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(calls[1].qs).toEqual({ version_id: 'v0' });
		expect(item.binary?.file?.fileName).toBe('v0.bin');
		expect(item.binary?.file?.mimeType).toBe('application/x-v0');
	});

	it('still lets the File Name option override the versioned file name', async () => {
		const { ctx } = mockExecute({
			params: { artifactId: 'a1', downloadOptions: { versionId: 'v0', binaryPropertyName: 'file', fileName: 'renamed.txt' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', 'r2.test', { body: 'zzz' }),
				on('GET', '/v1/artifacts/a1/versions', { body: [v0] }),
			],
		});
		const [item] = await download({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(item.binary?.file?.fileName).toBe('renamed.txt');
	});

	it("verifies a specific version against that version's own digest, not latest_version's", async () => {
		const { ctx } = mockExecute({
			params: { artifactId: 'a1', downloadOptions: { versionId: 'v0' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', 'r2.test', { body: 'zzz' }),
				on('GET', '/v1/artifacts/a1/versions', { body: [v0] }),
			],
		});
		// bytes "zzz" match v0's digest, so this must succeed even though it differs from latest_version's sha256.
		const [item] = await download({ ctx, itemIndex: 0, projectCache: new Map() });
		expect(Buffer.from(item.binary!.data.data, 'base64').toString()).toBe('zzz');
	});

	it('fails a wrong digest for the requested version, not for latest', async () => {
		const wrongV0 = { ...v0, sha256: sha }; // latest_version's digest, wrong for v0's bytes
		const { ctx } = mockExecute({
			params: { artifactId: 'a1', downloadOptions: { versionId: 'v0' } },
			responses: [
				on('GET', '/v1/artifacts/a1', { body: artifact }),
				on('GET', '/v1/artifacts/a1/download', { body: { ...dl, version_id: 'v0' } }),
				on('GET', 'r2.test', { body: 'zzz' }),
				on('GET', '/v1/artifacts/a1/versions', { body: [wrongV0] }),
			],
		});
		await expect(download({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow(/checksum/i);
	});

	it('fails on a checksum mismatch', async () => {
		const { ctx } = mockExecute({
			params: { artifactId: 'a1', downloadOptions: {} },
			responses: [on('GET', '/v1/artifacts/a1', { body: artifact }), on('GET', '/v1/artifacts/a1/download', { body: dl }), on('GET', 'r2.test', { body: 'abd' })],
		});
		await expect(download({ ctx, itemIndex: 0, projectCache: new Map() })).rejects.toThrow(/checksum/i);
	});
});
