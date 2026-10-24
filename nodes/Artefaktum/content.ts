import { createHash } from 'crypto';
import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export interface Content {
	bytes: Buffer;
	filename: string;
	contentType: string;
}

export function sha256Hex(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex');
}

/** The bytes to upload for one item: a binary property, or text typed into the node. */
export async function readContent(ctx: IExecuteFunctions, itemIndex: number): Promise<Content> {
	const source = ctx.getNodeParameter('inputDataSource', itemIndex, 'binary') as string;
	const options = ctx.getNodeParameter('uploadOptions', itemIndex, {}) as { filename?: unknown; contentType?: unknown };
	const filenameParam = String(options.filename ?? '').trim();
	const contentTypeParam = String(options.contentType ?? '').trim();

	if (source === 'text') {
		const text = ctx.getNodeParameter('content', itemIndex, '') as string;
		if (text === '') throw new NodeOperationError(ctx.getNode(), "Parameter 'Content' is empty", { itemIndex });
		const contentType = contentTypeParam || 'text/plain';
		const ext = contentType.includes('json') ? 'json' : contentType.includes('csv') ? 'csv' : contentType.includes('markdown') ? 'md' : 'txt';
		return { bytes: Buffer.from(text, 'utf8'), filename: filenameParam || `content.${ext}`, contentType };
	}

	const property = (ctx.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string) || 'data';
	const binary = ctx.helpers.assertBinaryData(itemIndex, property);
	const bytes = await ctx.helpers.getBinaryDataBuffer(itemIndex, property);
	if (bytes.length === 0) throw new NodeOperationError(ctx.getNode(), `The file in property '${property}' is empty`, { itemIndex });
	return {
		bytes,
		filename: filenameParam || binary.fileName || 'file.bin',
		contentType: contentTypeParam || binary.mimeType || 'application/octet-stream',
	};
}
