import { describe, expect, it } from 'vitest';
import cacheExample from '../examples/templates/cache-expensive-step.json';
import demoExample from '../examples/demo-video/artefaktum-demo.json';

const OPERATIONS = ['upload', 'get', 'search', 'update', 'delete'];
const TOOL = ['descriptionType', 'toolDescription'];
const LOOKUP = ['lookup', 'artifactId', 'key', 'project'];
const ALLOWED: Record<string, Set<string>> = {
	upload: new Set(['operation', 'project', 'inputDataSource', 'binaryPropertyName', 'content', 'title', 'key', 'ifKeyExists', 'maxAgeSeconds', 'uploadOptions', ...TOOL]),
	get: new Set(['operation', ...LOOKUP, 'maxAgeSeconds', 'ifNotFound', 'output', 'getOptions', ...TOOL]),
	search: new Set(['operation', 'project', 'query', 'returnAll', 'limit', 'filters', 'searchOptions', ...TOOL]),
	update: new Set(['operation', ...LOOKUP, 'updateFields', ...TOOL]),
	delete: new Set(['operation', ...LOOKUP, ...TOOL]),
};
const EXPECTED_TEMPLATES = ['cache-expensive-step.json', 'nightly-report-latest-wins.json', 'process-each-url-once.json'];
const templateModules = (import.meta as unknown as { glob: (p: string, o: { eager: true; import: 'default' }) => Record<string, unknown> }).glob(
	'../examples/templates/*.json',
	{ eager: true, import: 'default' },
);
const templates: Array<[string, unknown]> = Object.entries(templateModules)
	.map(([path, wf]) => [path.split('/').pop()!, wf] as [string, unknown])
	.sort((x, y) => x[0].localeCompare(y[0]));
const FILES: Array<[string, unknown]> = [
	...templates.map(([f, wf]) => [`examples/templates/${f}`, wf] as [string, unknown]),
	['examples/demo-video/artefaktum-demo.json', demoExample],
];

describe('templates', () => {
	it('has the three expected files', () => {
		for (const f of EXPECTED_TEMPLATES) expect(templates.map(([n]) => n)).toContain(f);
	});
	it.each(templates)('%s has a sticky note', (_f, example) => {
		const wf = example as { nodes: Array<{ type: string }> };
		expect(wf.nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote').length).toBeGreaterThanOrEqual(1);
	});
});

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
			expect(ALLOWED[node.parameters.operation as string].has(name), `parameter ${name} not valid for ${String(node.parameters.operation)}`).toBe(true);
		}
	});
});

describe('cache example pattern', () => {
	const wf = cacheExample as unknown as {
		nodes: ExampleNode[];
		connections: Record<string, { main: Array<Array<unknown>> }>;
	};
	const byName = (name: string) => wf.nodes.find((n) => n.name === name)!;

	it('replaces a stale copy with a new version under the same key', () => {
		const get = byName('Get cached weather');
		const upload = byName('Store weather');
		expect(upload.parameters.ifKeyExists).toBe('version');
		expect(upload.parameters.key).toBe(get.parameters.key);
	});

	it('connects both IF outputs', () => {
		const main = wf.connections['Found?'].main;
		expect(main).toHaveLength(2);
		expect(main[0].length).toBeGreaterThan(0);
		expect(main[1].length).toBeGreaterThan(0);
	});
});

interface PatternWorkflow {
	name: string;
	nodes: Array<ExampleNode & { name: string }>;
	connections: Record<string, { main: Array<Array<{ node: string }>> }>;
}
const tpl = (file: string) => templates.find(([n]) => n === file)![1] as unknown as PatternWorkflow;

const TEMPLATE_NAMES: Record<string, string> = {
	'cache-expensive-step.json': 'Stop paying twice for the same API call',
	'nightly-report-latest-wins.json': 'Share a file between two workflows',
	'process-each-url-once.json': "Skip items you've already processed",
};

describe('patterns', () => {
	it.each(Object.entries(TEMPLATE_NAMES))('%s is named by the problem it solves', (file, name) => {
		expect(tpl(file).name).toBe(name);
	});
	it('nightly report adds a version under the key that Get reads', () => {
		const wf = tpl('nightly-report-latest-wins.json');
		const upload = wf.nodes.find((n) => n.parameters.operation === 'upload')!;
		const get = wf.nodes.find((n) => n.parameters.operation === 'get')!;
		expect(upload.parameters.ifKeyExists).toBe('version');
		expect(upload.parameters.key).toBe(get.parameters.key);
	});

	it('process-once reuses at any age and connects both IF outputs', () => {
		const wf = tpl('process-each-url-once.json');
		const upload = wf.nodes.find((n) => n.parameters.operation === 'upload')!;
		expect(upload.parameters.ifKeyExists).toBe('reuse');
		expect(upload.parameters.maxAgeSeconds).toBe(0);
		const iff = wf.nodes.find((n) => n.type === 'n8n-nodes-base.if')!;
		const main = wf.connections[iff.name].main;
		expect(main).toHaveLength(2);
		expect(main[0].length).toBeGreaterThan(0);
		expect(main[1].length).toBeGreaterThan(0);
	});

	describe.each(templates)('%s', (_f, example) => {
		const wf = example as PatternWorkflow;
		it('uses a valid ifKeyExists everywhere', () => {
			for (const n of wf.nodes.filter((x) => x.type.startsWith('n8n-nodes-artefaktum.'))) {
				if ('ifKeyExists' in n.parameters) expect(['error', 'version', 'reuse']).toContain(n.parameters.ifKeyExists);
			}
		});
		it('only connects to existing nodes', () => {
			const names = new Set(wf.nodes.map((n) => n.name));
			for (const [from, c] of Object.entries(wf.connections)) {
				expect(names.has(from), `source ${from}`).toBe(true);
				for (const out of c.main) for (const t of out) expect(names.has(t.node), `target ${t.node}`).toBe(true);
			}
		});
	});
});
