import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { sha256Hex } from '../../content';
import { apiRequest, storageRequest } from '../../transport';
import { TEXT_MAX_BYTES, decodeText, isTextLike, resolveMaxCharacters, truncate } from '../../text';
import type { Action } from '../common';

const download: Action = async ({ ctx, itemIndex }) => {
	const artifactId = (ctx.getNodeParameter('artifactId', itemIndex) as string).trim();
	if (!artifactId) throw new NodeOperationError(ctx.getNode(), "Parameter 'Artifact ID' is empty", { itemIndex });
	const outputFormat = ctx.getNodeParameter('outputFormat', itemIndex, 'binary') as string;
	const options = ctx.getNodeParameter('downloadOptions', itemIndex, {}) as IDataObject;
	const property = (options.binaryPropertyName as string) || 'data';
	const verify = options.verifyChecksum !== false;
	const encodedId = encodeURIComponent(artifactId);

	const artifact = await apiRequest(ctx, 'GET', `/v1/artifacts/${encodedId}`, { itemIndex });
	const qs: IDataObject = {};
	if (typeof options.versionId === 'string' && options.versionId.trim()) qs.version_id = options.versionId.trim();
	const link = await apiRequest(ctx, 'GET', `/v1/artifacts/${encodedId}/download`, { itemIndex, qs: Object.keys(qs).length ? qs : undefined });

	let version = (artifact.latest_version as IDataObject | null) ?? {};
	const servedVersionId = typeof link.version_id === 'string' ? link.version_id : undefined;
	const contentVersionId = servedVersionId ?? (typeof version.id === 'string' ? version.id : undefined);
	if (servedVersionId && servedVersionId !== version.id) {
		// The served bytes are an older version than latest_version: latest_version's filename/mime/sha256
		// describe the wrong file, so look the served version up instead of mislabelling and misverifying it.
		const versions = (await apiRequest(ctx, 'GET', `/v1/artifacts/${encodedId}/versions`, { itemIndex })) as unknown as IDataObject[];
		const match = (Array.isArray(versions) ? versions : []).find((v) => v.id === servedVersionId);
		if (match) version = match;
	}
	const mimeType = typeof version.content_type === 'string' ? version.content_type : undefined;
	if (outputFormat === 'text') {
		// Resolve type and size from the served version's own record before fetching any bytes: an agent
		// handed a huge or non-text artifact ID must be refused, not made to buffer the whole file first.
		if (!isTextLike(mimeType)) {
			throw new NodeOperationError(
				ctx.getNode(),
				`Artifact ${artifactId} has content type '${mimeType ?? 'unknown'}', which is not text. Set Output Format to Binary File to download it.`,
				{ itemIndex },
			);
		}
		const sizeBytes = typeof version.size_bytes === 'number' ? version.size_bytes : Number(version.size_bytes);
		if (Number.isFinite(sizeBytes) && sizeBytes > TEXT_MAX_BYTES) {
			const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
			throw new NodeOperationError(
				ctx.getNode(),
				`Artifact ${artifactId} is ${sizeMb} MB, which is more than the 25 MB that can be read as text. Set Output Format to Binary File to download it.`,
				{ itemIndex },
			);
		}
	}

	const bytes = await storageRequest(ctx, { method: String(link.method ?? 'GET'), url: String(link.url), headers: {}, expires_at: String(link.expires_at ?? '') }, { itemIndex });
	if (verify && typeof version.sha256 === 'string' && version.sha256) {
		const actual = sha256Hex(bytes);
		if (actual !== version.sha256) throw new NodeOperationError(ctx.getNode(), `Checksum mismatch for artifact ${artifactId}: expected ${version.sha256}, got ${actual}. Run the node again; if it persists, the stored object is damaged.`, { itemIndex });
	}
	const fileName = (typeof options.fileName === 'string' && options.fileName.trim()) || (typeof version.original_filename === 'string' ? version.original_filename : undefined);
	if (outputFormat === 'text') {
		const maxCharacters = resolveMaxCharacters(options.maxCharacters);
		const { content, truncated, characters } = truncate(decodeText(bytes), maxCharacters);
		return [{ json: { ...artifact, content, content_truncated: truncated, content_characters: characters, content_version_id: contentVersionId }, pairedItem: { item: itemIndex } }];
	}
	const binary = await ctx.helpers.prepareBinaryData(bytes, fileName, mimeType);
	return [{ json: artifact, binary: { [property]: binary }, pairedItem: { item: itemIndex } }];
};

export default download;
