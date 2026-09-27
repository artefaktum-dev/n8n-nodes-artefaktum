import { describe, expect, it } from 'vitest';
import { artifactFields, artifactOperations, projectLocator } from '../nodes/Artefaktum/descriptions/artifact';
import { projectOperations } from '../nodes/Artefaktum/descriptions/project';

const shownFor = (name: string) => artifactFields.filter((f) => f.name === name).flatMap((f) => (f.displayOptions?.show?.operation as string[]) ?? []);

describe('artifact descriptions', () => {
	it('lists the seven operations with actions naming the resource', () => {
		const ops = (artifactOperations.options as Array<{ value: string; action: string }>).map((o) => o.value);
		// Alphabetized by the option's display name (n8n-nodes-base/node-param-options-type-unsorted-items).
		expect(ops).toEqual(['delete', 'download', 'get', 'getMany', 'getOrUpload', 'update', 'upload']);
		for (const o of artifactOperations.options as Array<{ action: string }>) expect(o.action.toLowerCase()).toContain('artifact');
	});

	it('shows content inputs for upload and getOrUpload only', () => {
		expect(shownFor('inputDataSource').sort()).toEqual(['getOrUpload', 'upload']);
		expect(shownFor('content')).toEqual(['upload', 'getOrUpload']);
	});

	it('requires the external key for getOrUpload', () => {
		const key = artifactFields.find((f) => f.name === 'externalKey' && f.required);
		expect(key?.displayOptions?.show?.operation).toEqual(['getOrUpload']);
	});

	it('hides Expires In (Hours) for getOrUpload (resolve does not accept it)', () => {
		const uploadOptions = artifactFields.find((f) => f.name === 'uploadOptions')!;
		const options = uploadOptions.options as Array<{ name: string; displayOptions?: { show?: Record<string, unknown> } }>;
		const opt = options.find((o) => o.name === 'expiresInHours')!;
		expect(opt.displayOptions?.show?.['/operation']).toEqual(['upload']);
	});

	it('has no Summary option: the API removed the field', () => {
		const uploadOptions = artifactFields.find((f) => f.name === 'uploadOptions')!;
		const names = (uploadOptions.options as Array<{ name: string }>).map((o) => o.name);
		expect(names).not.toContain('summary');
	});

	it('gives both Artifact ID fields the same description and placeholder', () => {
		const ids = artifactFields.filter((f) => f.name === 'artifactId');
		expect(ids).toHaveLength(2);
		expect(ids[0].description).toBe(ids[1].description);
		expect(ids[0].placeholder).toBe(ids[1].placeholder);
		expect(ids[0].description).toBeTruthy();
		expect(ids[0].placeholder).toBeTruthy();
	});

	it('shows the get project locator only when looking up by external key', () => {
		const locators = artifactFields.filter((f) => f.name === 'project' && (f.displayOptions?.show?.operation as string[] | undefined)?.includes('get'));
		const getLocator = locators.find((f) => (f.displayOptions?.show?.operation as string[]).length === 1);
		expect(getLocator?.displayOptions?.show?.lookup).toEqual(['externalKey']);
	});

	it('project locator defaults to the list picker', () => {
		const p = projectLocator(['upload']);
		expect(p.type).toBe('resourceLocator');
		expect(p.default).toEqual({ mode: 'list', value: '' });
		expect((p.modes ?? []).map((m) => m.name)).toEqual(['list', 'slug', 'id']);
	});

	it('shows Simplify for get and getMany only', () => {
		expect(shownFor('simplify').sort()).toEqual(['get', 'getMany']);
	});

	it('every boolean description starts with Whether', () => {
		const all = [...artifactFields, ...(artifactFields.flatMap((f) => (f.options as Array<{ type?: string; description?: string }> | undefined) ?? []))];
		for (const f of all) if (f.type === 'boolean') expect(f.description ?? '').toMatch(/^Whether /);
	});

	it('project has one operation', () => {
		expect((projectOperations.options as Array<{ value: string }>).map((o) => o.value)).toEqual(['getMany']);
	});

	it('offers Output Format for download only, defaulting to Binary File', () => {
		const field = artifactFields.find((f) => f.name === 'outputFormat')!;
		expect(field.displayOptions?.show?.operation).toEqual(['download']);
		expect(field.default).toBe('binary');
		expect((field.options as Array<{ value: string }>).map((o) => o.value)).toEqual(['binary', 'text']);
	});

	it('shows each download option only for the format it applies to', () => {
		const options = artifactFields.find((f) => f.name === 'downloadOptions')!.options as Array<{ name: string; displayOptions?: { show?: Record<string, unknown> } }>;
		const shown = (name: string) => options.find((o) => o.name === name)!.displayOptions?.show?.['/outputFormat'];
		expect(shown('fileName')).toEqual(['binary']);
		expect(shown('binaryPropertyName')).toEqual(['binary']);
		expect(shown('maxCharacters')).toEqual(['text']);
		expect(shown('verifyChecksum')).toBeUndefined();
		expect(shown('versionId')).toBeUndefined();
	});
});
