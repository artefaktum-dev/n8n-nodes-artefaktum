import { describe, expect, it } from 'vitest';
import { readContent, sha256Hex } from '../nodes/Artefaktum/content';
import { mockExecute } from './helpers/mockExecute';

describe('readContent', () => {
	it('reads a binary property with its filename and mime type', async () => {
		const { ctx } = mockExecute({
			items: [{ json: {}, binary: { data: { data: Buffer.from('abc').toString('base64'), mimeType: 'text/csv', fileName: 'rows.csv' } } }],
			params: { inputDataSource: 'binary', binaryPropertyName: 'data', uploadOptions: { filename: '', contentType: '' } },
			responses: [],
		});
		const c = await readContent(ctx, 0);
		expect(c.bytes.toString()).toBe('abc');
		expect(c.filename).toBe('rows.csv');
		expect(c.contentType).toBe('text/csv');
	});

	it('lets the parameters override filename and content type', async () => {
		const { ctx } = mockExecute({
			items: [{ json: {}, binary: { data: { data: Buffer.from('abc').toString('base64'), mimeType: 'application/octet-stream' } } }],
			params: { inputDataSource: 'binary', binaryPropertyName: 'data', uploadOptions: { filename: 'named.bin', contentType: 'application/x-thing' } },
			responses: [],
		});
		const c = await readContent(ctx, 0);
		expect(c.filename).toBe('named.bin');
		expect(c.contentType).toBe('application/x-thing');
	});

	it('falls back to file.bin and octet-stream', async () => {
		const { ctx } = mockExecute({
			items: [{ json: {}, binary: { data: { data: Buffer.from('x').toString('base64'), mimeType: '' } } }],
			params: { inputDataSource: 'binary', binaryPropertyName: 'data', uploadOptions: { filename: '', contentType: '' } },
			responses: [],
		});
		const c = await readContent(ctx, 0);
		expect(c.filename).toBe('file.bin');
		expect(c.contentType).toBe('application/octet-stream');
	});

	it('names the missing binary property', async () => {
		const { ctx } = mockExecute({ items: [{ json: {} }], params: { inputDataSource: 'binary', binaryPropertyName: 'attachment' }, responses: [] });
		await expect(readContent(ctx, 0)).rejects.toThrow("'attachment'");
	});

	it('rejects an empty binary file naming the property', async () => {
		const { ctx } = mockExecute({
			items: [{ json: {}, binary: { data: { data: '', mimeType: 'text/plain', fileName: 'empty.txt' } } }],
			params: { inputDataSource: 'binary', binaryPropertyName: 'data', uploadOptions: { filename: '', contentType: '' } },
			responses: [],
		});
		await expect(readContent(ctx, 0)).rejects.toThrow("'data' is empty");
	});

	it('reads text with sensible defaults', async () => {
		const { ctx } = mockExecute({ params: { inputDataSource: 'text', content: '{"a":1}', uploadOptions: { filename: '', contentType: 'application/json' } }, responses: [] });
		const c = await readContent(ctx, 0);
		expect(c.bytes.toString()).toBe('{"a":1}');
		expect(c.filename).toBe('content.json');
		expect(c.contentType).toBe('application/json');
	});

	it('refuses empty text', async () => {
		const { ctx } = mockExecute({ params: { inputDataSource: 'text', content: '', uploadOptions: { filename: '', contentType: '' } }, responses: [] });
		await expect(readContent(ctx, 0)).rejects.toThrow("'Content'");
	});
});

describe('sha256Hex', () => {
	it('matches a known digest', () => {
		expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
});
