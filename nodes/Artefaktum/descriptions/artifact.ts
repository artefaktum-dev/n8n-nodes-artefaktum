import type { INodeProperties } from 'n8n-workflow';

const show = (operation: string[]) => ({ show: { operation } });

const ID_PLACEHOLDER = 'e.g. 0192a1b2-3c4d-7e5f-8a9b-0c1d2e3f4a5b';

export function projectLocator(operations: string[]): INodeProperties {
	return {
		displayName: 'Project',
		name: 'project',
		type: 'resourceLocator',
		default: { mode: 'slug', value: 'default' },
		required: true,
		description: 'The project the artifact belongs to. Every tenant has a project with slug "default".',
		modes: [
			{ displayName: 'From List', name: 'list', type: 'list', typeOptions: { searchListMethod: 'getProjects', searchable: true } },
			{ displayName: 'Slug', name: 'slug', type: 'string', placeholder: 'e.g. default' },
			{ displayName: 'ID', name: 'id', type: 'string', placeholder: 'e.g. 0192a1b2-...' },
		],
		displayOptions: show(operations),
	};
}

export const artifactOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['artifact'] } },
	default: 'upload',
	options: [
		{ name: 'Delete', value: 'delete', action: 'Delete an artifact', description: 'Delete an artifact and all its versions' },
		{ name: 'Get', value: 'get', action: 'Get an artifact', description: 'Fetch one artifact by ID or key, as a file, as text or as details only' },
		{ name: 'Search', value: 'search', action: 'Search artifacts', description: 'Find artifacts by meaning, keywords, tags and filters. Leave Query empty to list by filters only.' },
		{ name: 'Update', value: 'update', action: 'Update an artifact', description: 'Change title, description, tags, metadata or expiry' },
		{ name: 'Upload', value: 'upload', action: 'Upload an artifact', description: 'Store a file or text as an artifact, optionally under a key' },
	],
};

export function lookupFields(): INodeProperties[] {
	const lookupOps = ['get', 'update', 'delete'];
	return [
		{
			displayName: 'Lookup',
			name: 'lookup',
			type: 'options',
			default: 'id',
			options: [
				{ name: 'By ID', value: 'id' },
				{ name: 'By Key', value: 'key' },
			],
			displayOptions: show(lookupOps),
		},
		{
			displayName: 'Artifact ID',
			name: 'artifactId',
			type: 'string',
			default: '',
			required: true,
			placeholder: ID_PLACEHOLDER,
			description: 'The artifact ID, e.g. from a previous Artefaktum node in this workflow',
			displayOptions: { show: { operation: lookupOps, lookup: ['id'] } },
		},
		{
			displayName: 'Key',
			name: 'key',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. report:sales:2026-10-24',
			description: 'The key the artifact was uploaded under',
			displayOptions: { show: { operation: lookupOps, lookup: ['key'] } },
		},
		{
			...projectLocator(lookupOps),
			displayOptions: { show: { operation: lookupOps, lookup: ['key'] } },
		},
		{
			displayName: 'Max Age (Seconds)',
			name: 'maxAgeSeconds',
			type: 'number',
			default: 0,
			description: 'Treat an artifact last updated longer ago than this as not found. 0 accepts any age.',
			displayOptions: { show: { operation: ['get'], lookup: ['key'] } },
		},
		{
			displayName: 'If Not Found',
			name: 'ifNotFound',
			type: 'options',
			default: 'error',
			options: [
				// "found" is the literal output field name, so it stays lower case.
				// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
				{ name: 'Return found: false', value: 'empty', description: 'Output one item with found set to false, so an IF node can branch on it' },
				{ name: 'Stop With Error', value: 'error', description: 'Fail the node when no fresh enough artifact has this key' },
			],
			displayOptions: { show: { operation: ['get'], lookup: ['key'] } },
		},
	];
}

const uploadFields: INodeProperties[] = [
	{
		displayName: 'Input Data Source',
		name: 'inputDataSource',
		type: 'options',
		default: 'binary',
		options: [
			{ name: 'Binary File', value: 'binary', description: 'Upload the file held in a binary property of the input item' },
			{ name: 'Text', value: 'text', description: 'Upload text or JSON typed here or built with an expression' },
		],
		displayOptions: show(['upload']),
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'Name of the binary property that holds the file',
		displayOptions: { show: { operation: ['upload'], inputDataSource: ['binary'] } },
	},
	{
		displayName: 'Content',
		name: 'content',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		description: 'The text to store, built with an expression if needed',
		displayOptions: { show: { operation: ['upload'], inputDataSource: ['text'] } },
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		placeholder: 'e.g. Q3 supplier emissions',
		description: 'What the artifact is. Searched by other agents. Defaults to the file name.',
		displayOptions: show(['upload']),
	},
	{
		displayName: 'Key',
		name: 'key',
		type: 'string',
		default: '',
		placeholder: 'e.g. report:sales:2026-10-24',
		description: 'Your own unique key for this artifact within the project. Lets you find it again, add versions or reuse it. Leave empty for no key.',
		displayOptions: show(['upload']),
	},
	{
		displayName: 'If Key Exists',
		name: 'ifKeyExists',
		type: 'options',
		default: 'error',
		description: 'What to do when an artifact with this key already exists in the project',
		options: [
			{ name: 'Add New Version', value: 'version', description: 'Store this upload as a new version of the existing artifact' },
			{ name: 'Reuse Existing', value: 'reuse', description: 'Return the existing artifact and upload nothing' },
			{ name: 'Stop With Error', value: 'error', description: 'Fail the node' },
		],
		displayOptions: { show: { operation: ['upload'] }, hide: { key: [''] } },
	},
	{
		displayName: 'Max Age (Seconds)',
		name: 'maxAgeSeconds',
		type: 'number',
		default: 0,
		description: 'Reuse the existing artifact only if it was last updated more recently than this. 0 reuses at any age.',
		displayOptions: { show: { operation: ['upload'], ifKeyExists: ['reuse'] } },
	},
	{
		displayName: 'Options',
		name: 'uploadOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: show(['upload']),
		options: [
			{ displayName: 'Content Type', name: 'contentType', type: 'string', default: '', placeholder: 'e.g. application/json', description: 'MIME type. Defaults to the binary file type, or text/plain for text.' },
			{ displayName: 'Description', name: 'description', type: 'string', typeOptions: { rows: 3 }, default: '', description: 'Longer description; searched semantically' },
			{ displayName: 'Expires In (Hours)', name: 'expiresInHours', type: 'number', default: 0, description: 'Delete the artifact automatically after this many hours. 0 keeps it.' },
			{ displayName: 'File Name', name: 'filename', type: 'string', default: '', placeholder: 'e.g. report.json', description: 'Stored file name. Defaults to the binary file name, or a generated name for text.' },
			{ displayName: 'Metadata (JSON)', name: 'metadata', type: 'json', default: '{}', description: 'Structured metadata, searchable by filters' },
			{ displayName: 'Tags', name: 'tags', type: 'string', default: '', placeholder: 'e.g. finance, q3, csv', description: 'Comma-separated tags' },
		],
	},
];

const getFields: INodeProperties[] = [
	{
		displayName: 'Output',
		name: 'output',
		type: 'options',
		noDataExpression: true,
		default: 'binary',
		description: 'How to return the artifact. Choose Text when an AI agent needs to read the file: agents cannot see binary files.',
		options: [
			{ name: 'Binary File', value: 'binary', description: 'Put the file into a binary property of the output item' },
			{ name: 'Details Only', value: 'details', description: 'Return the artifact details without fetching the file' },
			{ name: 'Text', value: 'text', description: 'Put the file content into the "content" field of the output, for text files such as JSON, CSV or Markdown' },
		],
		displayOptions: show(['get']),
	},
	{
		displayName: 'Options',
		name: 'getOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: show(['get']),
		options: [
			{ displayName: 'File Name', name: 'fileName', type: 'string', default: '', description: 'Override the file name on the binary property', displayOptions: { show: { '/output': ['binary'] } } },
			{ displayName: 'Max Characters', name: 'maxCharacters', type: 'number', typeOptions: { minValue: 0 }, default: 50000, description: 'Cut the content after this many characters. The output says whether it was cut. 0 returns everything.', displayOptions: { show: { '/output': ['text'] } } },
			{ displayName: 'Put Output File in Field', name: 'binaryPropertyName', type: 'string', default: 'data', description: 'Name of the binary property to write the file to', displayOptions: { show: { '/output': ['binary'] } } },
			{ displayName: 'Simplify', name: 'simplify', type: 'boolean', default: true, description: 'Whether to return a simplified version of the artifact instead of the raw data' },
			{ displayName: 'Verify Checksum', name: 'verifyChecksum', type: 'boolean', default: true, description: 'Whether to compare the downloaded bytes against the stored SHA-256', displayOptions: { show: { '/output': ['binary', 'text'] } } },
			{ displayName: 'Version ID', name: 'versionId', type: 'string', default: '', description: 'A specific version; defaults to the latest', displayOptions: { show: { '/output': ['binary', 'text'] } } },
		],
	},
];

const searchFields: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		placeholder: 'e.g. supplier emission factors 2026',
		description: 'What you are looking for, in words. Leave empty to list by filters only.',
		displayOptions: show(['search']),
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: show(['search']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 100 },
		description: 'Max number of results to return',
		displayOptions: { show: { operation: ['search'], returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add filter',
		default: {},
		displayOptions: show(['search']),
		options: [
			{ displayName: 'Content Types', name: 'contentTypes', type: 'string', default: '', placeholder: 'e.g. application/json, text/csv', description: 'Comma-separated MIME types' },
			{ displayName: 'Created After', name: 'createdAfter', type: 'dateTime', default: '' },
			{ displayName: 'Created Before', name: 'createdBefore', type: 'dateTime', default: '' },
			{ displayName: 'Include Superseded', name: 'includeSuperseded', type: 'boolean', default: false, description: 'Whether to include artifacts that a newer artifact supersedes' },
			{ displayName: 'Tags (All Of)', name: 'tags', type: 'string', default: '', placeholder: 'e.g. finance, q3', description: 'Comma-separated; every tag must match' },
		],
	},
	{
		displayName: 'Options',
		name: 'searchOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: show(['search']),
		options: [
			{
				displayName: 'Search Mode',
				name: 'mode',
				type: 'options',
				default: 'hybrid',
				options: [
					{ name: 'Hybrid', value: 'hybrid', description: 'Keyword and meaning combined' },
					{ name: 'Semantic', value: 'semantic', description: 'By meaning' },
					{ name: 'Text', value: 'text', description: 'By keywords' },
				],
			},
			{ displayName: 'Simplify', name: 'simplify', type: 'boolean', default: true, description: 'Whether to return a simplified version of the response instead of the raw data' },
		],
	},
];

export const artifactFields: INodeProperties[] = [
	projectLocator(['upload', 'search']),
	...uploadFields,
	...lookupFields(),
	...getFields,
	...searchFields,
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: show(['update']),
		options: [
			{ displayName: 'Clear Expiry', name: 'clearExpiresAt', type: 'boolean', default: false, description: 'Whether to remove the expiry so the artifact is kept' },
			{ displayName: 'Description', name: 'description', type: 'string', typeOptions: { rows: 3 }, default: '' },
			{ displayName: 'Expires At', name: 'expiresAt', type: 'dateTime', default: '' },
			{ displayName: 'Metadata (JSON)', name: 'metadata', type: 'json', default: '{}' },
			{ displayName: 'Tags', name: 'tags', type: 'string', default: '', description: 'Comma-separated; replaces the existing tags' },
			{ displayName: 'Title', name: 'title', type: 'string', default: '' },
		],
	},
];
