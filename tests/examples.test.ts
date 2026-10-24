import { describe, expect, it } from 'vitest';
import cacheExample from '../examples/cache-expensive-step.json';
import demoExample from '../examples/demo-video/artefaktum-demo.json';

const OPERATIONS = ['upload', 'get', 'search', 'update', 'delete'];
const ALLOWED_PARAMETERS = new Set([
	'operation', 'project', 'inputDataSource', 'binaryPropertyName', 'content', 'title', 'key',
	'ifKeyExists', 'maxAgeSeconds', 'uploadOptions', 'lookup', 'artifactId', 'ifNotFound', 'output',
	'getOptions', 'query', 'returnAll', 'limit', 'filters', 'searchOptions', 'updateFields',
	'descriptionType', 'toolDescription',
]);
const FILES: Array<[string, unknown]> = [
	['examples/cache-expensive-step.json', cacheExample],
	['examples/demo-video/artefaktum-demo.json', demoExample],
];

interface ExampleNode {
	name: string;
	type: string;
	parameters: Record<string, unknown>;
}

describe.each(FILES)('%s', (_file, example) => {
	const workflow = example as { nodes: ExampleNode[] };
	const ours = workflow.nodes.filter((n) => n.type.startsWith('n8n-nodes-artefaktum.'));

	it('contains Artefaktum nodes', () => {
		expect(ours.length).toBeGreaterThan(0);
	});

	it.each(ours.map((n) => [n.name, n] as const))('%s uses the 0.3.0 surface', (_name, node) => {
		expect(OPERATIONS).toContain(node.parameters.operation);
		expect(node.parameters).not.toHaveProperty('resource');
		for (const name of Object.keys(node.parameters)) {
			expect(ALLOWED_PARAMETERS.has(name), `unknown parameter ${name}`).toBe(true);
		}
	});
});
