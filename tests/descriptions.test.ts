import { NodeHelpers } from 'n8n-workflow';
import type { INodeProperties } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { artifactFields, artifactOperations, lookupFields, projectLocator } from '../nodes/Artefaktum/descriptions/artifact';

const ops = () => (artifactOperations.options as Array<{ value: string }>).map((o) => o.value);
const field = (name: string) => artifactFields.find((f) => f.name === name)!;
const optionNames = (name: string) => (field(name).options as Array<{ name: string }>).map((o) => o.name).sort();
const visible = (values: Record<string, unknown>, p: INodeProperties) => NodeHelpers.displayParameter(values as never, p, null, null);

describe('artifact descriptions', () => {
	it('lists the five operations in display order', () => {
		expect(ops()).toEqual(['delete', 'get', 'search', 'update', 'upload']);
		expect(artifactOperations.default).toBe('upload');
		for (const o of artifactOperations.options as Array<{ action: string }>) expect(o.action.toLowerCase()).toContain('artifact');
	});

	it('shows If Key Exists only once a key is typed', () => {
		const p = field('ifKeyExists');
		expect(visible({ operation: 'upload', key: '' }, p)).toBe(false);
		expect(visible({ operation: 'upload', key: 'k' }, p)).toBe(true);
		expect(visible({ operation: 'get', key: 'k' }, p)).toBe(false);
		expect(p.default).toBe('error');
		expect((p.options as Array<{ value: string }>).map((o) => o.value)).toEqual(['version', 'reuse', 'error']);
	});

	it('shows Max Age only for reuse on upload and for key lookups on get', () => {
		const shown = artifactFields.filter((f) => f.name === 'maxAgeSeconds').map((f) => f.displayOptions?.show);
		expect(shown).toEqual([{ operation: ['upload'], ifKeyExists: ['reuse'] }, { operation: ['get'], lookup: ['key'] }]);
	});

	it('shows If Not Found for get by key only', () => {
		const p = field('ifNotFound');
		expect(p.displayOptions?.show).toEqual({ operation: ['get'], lookup: ['key'] });
		expect(p.default).toBe('error');
		expect((p.options as Array<{ value: string }>).map((o) => o.value)).toEqual(['empty', 'error']);
	});

	it('project locator defaults to the default slug', () => {
		const p = projectLocator(['upload']);
		expect(p.type).toBe('resourceLocator');
		expect(p.default).toEqual({ mode: 'slug', value: 'default' });
		expect((p.modes ?? []).map((m) => m.name)).toEqual(['list', 'slug', 'id']);
	});

	it('lookup block has the documented order and visibility', () => {
		expect(lookupFields().map((f) => f.name)).toEqual(['lookup', 'artifactId', 'key', 'project', 'maxAgeSeconds', 'ifNotFound']);
		const [lookup, id, key, project] = lookupFields();
		expect(lookup.displayOptions?.show?.operation).toEqual(['get', 'update', 'delete']);
		expect(id.displayOptions?.show?.lookup).toEqual(['id']);
		expect(key.required).toBe(true);
		expect(project.displayOptions?.show?.lookup).toEqual(['key']);
	});

	it('shows the project locator for upload, search and key lookups', () => {
		const p = artifactFields.filter((f) => f.name === 'project');
		expect(p[0].displayOptions?.show?.operation).toEqual(['upload', 'search']);
		expect(visible({ operation: 'get', lookup: 'id' }, p[1])).toBe(false);
		expect(visible({ operation: 'get', lookup: 'key' }, p[1])).toBe(true);
	});

	it('offers Output for get, defaulting to Binary File, with Details Only as an option', () => {
		const p = field('output');
		expect(p.displayOptions?.show?.operation).toEqual(['get']);
		expect(p.default).toBe('binary');
		expect((p.options as Array<{ value: string }>).map((o) => o.value)).toEqual(['binary', 'details', 'text']);
		expect(p.description).toBe('How to return the artifact. Choose Text when an AI agent needs to read the file: agents cannot see binary files.');
	});

	it('keeps Key top-level and optional on upload', () => {
		const k = field('key');
		expect(k.required).toBeFalsy();
		expect(k.placeholder).toBe('e.g. report:sales:2026-10-24');
		expect(k.displayOptions?.show?.operation).toEqual(['upload']);
	});

	it('keeps File Name and Content Type inside Options', () => {
		expect(optionNames('uploadOptions')).toEqual(['contentType', 'description', 'expiresInHours', 'filename', 'metadata', 'tags']);
	});

	it('keeps get options together', () => {
		expect(optionNames('getOptions')).toEqual(['binaryPropertyName', 'fileName', 'maxCharacters', 'simplify', 'verifyChecksum', 'versionId']);
	});

	it('keeps search filters together', () => {
		expect(optionNames('filters')).toEqual(['contentTypes', 'createdAfter', 'createdBefore', 'includeSuperseded', 'tags']);
	});

	it('keeps Search Mode and Simplify inside Search options', () => {
		expect(optionNames('searchOptions')).toEqual(['mode', 'simplify']);
	});

	it('hides Limit when Return All is on', () => {
		const p = field('limit');
		expect(visible({ operation: 'search', returnAll: true }, p)).toBe(false);
		expect(visible({ operation: 'search', returnAll: false }, p)).toBe(true);
	});

	it('every boolean description starts with Whether', () => {
		const all = [...artifactFields, ...artifactFields.flatMap((f) => (f.options as Array<{ type?: string; description?: string }> | undefined) ?? [])];
		for (const f of all) if ((f as { type?: string }).type === 'boolean') expect(f.description ?? '').toMatch(/^Whether /);
	});

	it('has no resource parameter and no project operations', () => {
		expect(artifactFields.some((f) => f.name === 'resource')).toBe(false);
		expect(ops()).not.toContain('getMany');
	});
});
