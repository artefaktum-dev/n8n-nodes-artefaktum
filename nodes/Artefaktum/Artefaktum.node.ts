import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import del from './actions/artifact/del';
import get from './actions/artifact/get';
import search from './actions/artifact/search';
import update from './actions/artifact/update';
import upload from './actions/artifact/upload';
import type { Action } from './actions/common';
import { artifactFields, artifactOperations } from './descriptions/artifact';
import { searchProjects } from './projects';

const ACTIONS: Record<string, Action> = { upload, get, search, update, delete: del };

export class Artefaktum implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Artefaktum',
		name: 'artefaktum',
		icon: { light: 'file:artefaktum.svg', dark: 'file:artefaktum.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Store, find and reuse artifacts between workflows and AI agents',
		defaults: { name: 'Artefaktum' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'artefaktumApi', required: true }],
		properties: [artifactOperations, ...artifactFields],
	};

	methods = {
		listSearch: {
			async getProjects(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				return searchProjects(this, filter);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const projectCache = new Map<string, string>();

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			const action = ACTIONS[operation];
			if (!action) throw new NodeOperationError(this.getNode(), `The operation '${operation}' is not supported`, { itemIndex });
			try {
				out.push(...(await action({ ctx: this, itemIndex, projectCache })));
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: itemIndex } });
					continue;
				}
				// A NodeOperationError already carries its own itemIndex; NodeApiError's constructor
				// does not special-case NodeOperationError (only NodeApiError), so wrapping it there
				// would rebuild the error and lose that itemIndex. NodeOperationError's constructor
				// does return the same instance unchanged when given one, so route through it instead.
				if (error instanceof NodeOperationError) throw new NodeOperationError(this.getNode(), error);
				// Actions already throw NodeApiError/NodeOperationError; NodeApiError's constructor
				// returns the same instance unchanged when given one, so this preserves it as-is.
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}
		return [out];
	}
}
