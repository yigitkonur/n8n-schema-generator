#!/usr/bin/env npx ts-node
/**
 * Schema Extraction Script
 * 
 * Extracts all validation schemas from n8n-workflow and n8n-nodes-base into JSON files.
 * This includes:
 * - All node type schemas (INodeTypeDescription)
 * - Workflow structure schema
 * - Connection schemas
 * - Common parameter type schemas (filter, fixedCollection, etc.)
 * - Credential type schemas
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load n8n packages via CommonJS
const n8nWorkflow = require('n8n-workflow') as any;
const { NodeHelpers, VersionedNodeType: CjsVersionedNodeType } = n8nWorkflow;

interface ExtractedNodeSchema {
  name: string;
  displayName: string;
  description: string;
  group: string[];
  version: number | number[];
  defaults: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
  properties: any[];
  credentials?: any[];
  // Computed fields
  requiredFields: string[];
  optionalFields: string[];
  parameterTypes: Record<string, string>;
  hasVersions: boolean;
  availableVersions?: number[];
  defaultVersion?: number;
}

interface WorkflowSchema {
  required: string[];
  properties: Record<string, PropertySchema>;
  nodeSchema: NodeInstanceSchema;
  connectionSchema: ConnectionSchema;
}

interface PropertySchema {
  type: string;
  description: string;
  required?: boolean;
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
}

interface NodeInstanceSchema {
  required: string[];
  properties: Record<string, PropertySchema>;
}

interface ConnectionSchema {
  type: string;
  description: string;
  properties: Record<string, PropertySchema>;
}

interface ExtractionResult {
  nodes: Map<string, ExtractedNodeSchema>;
  workflow: WorkflowSchema;
  commonTypes: Record<string, any>;
  credentials: Map<string, any>;
  stats: ExtractionStats;
}

interface ExtractionStats {
  totalNodes: number;
  versionedNodes: number;
  totalVersions: number;
  credentialTypes: number;
  extractedAt: string;
  n8nVersion: string;
}

class SchemaExtractor {
  private nodesBaseRoot: string;
  private outputDir: string;
  private nodes: Map<string, any> = new Map();
  private credentials: Map<string, any> = new Map();

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    
    try {
      this.nodesBaseRoot = path.join(
        path.dirname(require.resolve('n8n-nodes-base/package.json')),
        'dist',
        'nodes',
      );
    } catch {
      throw new Error('Could not locate n8n-nodes-base. Please run: npm install');
    }
  }

  /**
   * Main extraction method
   */
  async extract(): Promise<ExtractionResult> {
    console.log('🔍 Starting schema extraction...\n');

    // Create output directories
    this.ensureDirectories();

    // Load all nodes
    console.log('📦 Loading nodes from n8n-nodes-base...');
    await this.loadAllNodes();
    console.log(`   Found ${this.nodes.size} unique node types\n`);

    // Extract node schemas
    console.log('📝 Extracting node schemas...');
    const nodeSchemas = this.extractNodeSchemas();
    console.log(`   Extracted ${nodeSchemas.size} node schemas\n`);

    // Extract workflow schema
    console.log('📋 Extracting workflow schema...');
    const workflowSchema = this.extractWorkflowSchema();

    // Extract common types
    console.log('🔧 Extracting common parameter types...');
    const commonTypes = this.extractCommonTypes();

    // Extract credential schemas
    console.log('🔐 Extracting credential schemas...');
    const credentialSchemas = this.extractCredentialSchemas();

    // Write all schemas to files
    console.log('\n💾 Writing schemas to files...');
    await this.writeSchemas(nodeSchemas, workflowSchema, commonTypes, credentialSchemas);

    // Generate stats
    const stats = this.generateStats(nodeSchemas);

    console.log('\n✅ Extraction complete!');
    console.log(`   Output directory: ${this.outputDir}`);

    return {
      nodes: nodeSchemas,
      workflow: workflowSchema,
      commonTypes,
      credentials: credentialSchemas,
      stats,
    };
  }

  private ensureDirectories(): void {
    const dirs = [
      this.outputDir,
      path.join(this.outputDir, 'nodes'),
      path.join(this.outputDir, 'nodes', 'by-category'),
      path.join(this.outputDir, 'workflow'),
      path.join(this.outputDir, 'common'),
      path.join(this.outputDir, 'credentials'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private async loadAllNodes(): Promise<void> {
    this.scanDirectory(this.nodesBaseRoot);
  }

  private scanDirectory(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.node.js')) {
        this.loadNodeFile(fullPath);
      }
    }
  }

  private loadNodeFile(filePath: string): void {
    try {
      const module = require(filePath);

      for (const key in module) {
        const ExportedClass = module[key];
        if (typeof ExportedClass === 'function' && ExportedClass.prototype) {
          try {
            const instance = new ExportedClass();
            if (instance.description) {
              const name = instance.description.name;
              // Store the full node instance for complete extraction
              this.nodes.set(name, instance);
              this.nodes.set(`n8n-nodes-base.${name}`, instance);
            }
          } catch {
            // Skip nodes that can't be instantiated
          }
        }
      }
    } catch {
      // Skip files that can't be loaded
    }
  }

  private extractNodeSchemas(): Map<string, ExtractedNodeSchema> {
    const schemas = new Map<string, ExtractedNodeSchema>();

    for (const [name, nodeInstance] of this.nodes) {
      // Skip undefined or prefixed duplicates
      if (!name || typeof name !== 'string') continue;
      if (name.startsWith('n8n-nodes-base.')) continue;

      try {
        const schema = this.extractSingleNodeSchema(name, nodeInstance);
        if (schema) {
          schemas.set(name, schema);
        }
      } catch (error: any) {
        console.warn(`   ⚠️ Failed to extract schema for ${name}: ${error.message}`);
      }
    }

    return schemas;
  }

  private extractSingleNodeSchema(name: string, nodeInstance: any): ExtractedNodeSchema | null {
    const isVersioned = nodeInstance instanceof CjsVersionedNodeType;
    
    let description: any;
    let availableVersions: number[] | undefined;
    let defaultVersion: number | undefined;

    if (isVersioned) {
      const vt = nodeInstance as any;
      defaultVersion = vt.description?.defaultVersion ?? vt.getLatestVersion();
      availableVersions = this.getAvailableVersions(vt);
      
      // Get the latest version's description
      const concrete = vt.getNodeType(defaultVersion);
      description = concrete.description;
    } else {
      description = nodeInstance.description;
    }

    if (!description) return null;

    // Extract required and optional fields
    const { requiredFields, optionalFields, parameterTypes } = this.analyzeProperties(description.properties || []);

    // Compute default parameters using n8n's own logic
    let computedDefaults: Record<string, unknown> = {};
    try {
      computedDefaults = NodeHelpers.getNodeParameters(
        description.properties || [],
        {},
        true,
        true,
        { typeVersion: defaultVersion ?? 1 },
        description,
      ) || {};
    } catch {
      // Use static defaults if computation fails
      computedDefaults = description.defaults || {};
    }

    return {
      name: description.name,
      displayName: description.displayName,
      description: description.description || '',
      group: description.group || [],
      version: description.version,
      defaults: computedDefaults,
      inputs: description.inputs || ['main'],
      outputs: description.outputs || ['main'],
      properties: this.cleanProperties(description.properties || []),
      credentials: description.credentials || [],
      requiredFields,
      optionalFields,
      parameterTypes,
      hasVersions: isVersioned,
      availableVersions,
      defaultVersion,
    };
  }

  private getAvailableVersions(versionedNode: any): number[] {
    const versions: number[] = [];
    try {
      // Try to get all versions from the versioned node
      if (versionedNode.nodeVersions) {
        versions.push(...Object.keys(versionedNode.nodeVersions).map(Number));
      } else if (versionedNode.description?.version) {
        const v = versionedNode.description.version;
        if (Array.isArray(v)) {
          versions.push(...v);
        } else {
          versions.push(v);
        }
      }
    } catch {
      // Return empty array on failure
    }
    return versions.sort((a, b) => a - b);
  }

  private analyzeProperties(properties: any[]): {
    requiredFields: string[];
    optionalFields: string[];
    parameterTypes: Record<string, string>;
  } {
    const requiredFields: string[] = [];
    const optionalFields: string[] = [];
    const parameterTypes: Record<string, string> = {};

    for (const prop of properties) {
      if (!prop.name) continue;

      parameterTypes[prop.name] = prop.type || 'unknown';

      // A field is required if it has no default AND is not in a displayOptions condition
      const hasDefault = prop.default !== undefined;
      const hasDisplayOptions = !!prop.displayOptions;
      const isRequired = prop.required === true || (!hasDefault && !hasDisplayOptions);

      if (isRequired) {
        requiredFields.push(prop.name);
      } else {
        optionalFields.push(prop.name);
      }
    }

    return { requiredFields, optionalFields, parameterTypes };
  }

  private cleanProperties(properties: any[]): any[] {
    return properties.map(prop => {
      const cleaned: any = {
        name: prop.name,
        displayName: prop.displayName,
        type: prop.type,
        default: prop.default,
        required: prop.required,
        description: prop.description,
      };

      // Include type-specific fields
      if (prop.options) cleaned.options = prop.options;
      if (prop.typeOptions) cleaned.typeOptions = prop.typeOptions;
      if (prop.displayOptions) cleaned.displayOptions = prop.displayOptions;
      if (prop.placeholder) cleaned.placeholder = prop.placeholder;
      if (prop.hint) cleaned.hint = prop.hint;
      if (prop.noDataExpression !== undefined) cleaned.noDataExpression = prop.noDataExpression;
      if (prop.routing) cleaned.routing = prop.routing;

      return cleaned;
    });
  }

  private extractWorkflowSchema(): WorkflowSchema {
    return {
      required: ['nodes', 'connections'],
      properties: {
        id: { type: 'string', description: 'Unique workflow identifier' },
        name: { type: 'string', description: 'Workflow name' },
        active: { type: 'boolean', description: 'Whether the workflow is active' },
        nodes: {
          type: 'array',
          description: 'Array of workflow nodes',
          items: { type: 'object', description: 'Node instance' },
        },
        connections: {
          type: 'object',
          description: 'Map of node connections',
        },
        settings: {
          type: 'object',
          description: 'Workflow settings',
          properties: {
            saveManualExecutions: { type: 'boolean', description: 'Save manual runs' },
            saveDataErrorExecution: { type: 'string', description: 'Save on error behavior' },
            saveDataSuccessExecution: { type: 'string', description: 'Save on success behavior' },
            saveExecutionProgress: { type: 'boolean', description: 'Save execution progress' },
            executionTimeout: { type: 'number', description: 'Timeout in seconds' },
            errorWorkflow: { type: 'string', description: 'Error workflow ID' },
            timezone: { type: 'string', description: 'Workflow timezone' },
            executionOrder: { type: 'string', description: 'Execution order (v0 or v1)' },
          },
        },
        staticData: { type: 'object', description: 'Persistent workflow data' },
        pinData: { type: 'object', description: 'Pinned node data for testing' },
        tags: {
          type: 'array',
          description: 'Workflow tags',
          items: { type: 'object', description: 'Tag object' },
        },
        meta: {
          type: 'object',
          description: 'Workflow metadata',
          properties: {
            instanceId: { type: 'string', description: 'n8n instance ID' },
          },
        },
      },
      nodeSchema: this.extractNodeInstanceSchema(),
      connectionSchema: this.extractConnectionSchema(),
    };
  }

  private extractNodeInstanceSchema(): NodeInstanceSchema {
    return {
      required: ['type', 'typeVersion', 'position', 'parameters'],
      properties: {
        id: { type: 'string', description: 'Unique node identifier (UUID)' },
        name: { type: 'string', description: 'Node display name (must be unique in workflow)' },
        type: { type: 'string', description: 'Node type (e.g., n8n-nodes-base.httpRequest)' },
        typeVersion: { type: 'number', description: 'Node type version' },
        position: {
          type: 'array',
          description: 'Node position [x, y] on canvas',
          items: { type: 'number', description: 'Coordinate value' },
        },
        parameters: { type: 'object', description: 'Node-specific parameters' },
        credentials: { type: 'object', description: 'Credential references' },
        disabled: { type: 'boolean', description: 'Whether node is disabled' },
        notes: { type: 'string', description: 'Node notes/comments' },
        notesInFlow: { type: 'boolean', description: 'Show notes in flow' },
        retryOnFail: { type: 'boolean', description: 'Retry on failure' },
        maxTries: { type: 'number', description: 'Max retry attempts' },
        waitBetweenTries: { type: 'number', description: 'Wait between retries (ms)' },
        alwaysOutputData: { type: 'boolean', description: 'Always output data' },
        executeOnce: { type: 'boolean', description: 'Execute once for all items' },
        continueOnFail: { type: 'boolean', description: 'Continue on failure' },
        onError: { type: 'string', description: 'Error handling mode' },
        webhookId: { type: 'string', description: 'Webhook identifier' },
      },
    };
  }

  private extractConnectionSchema(): ConnectionSchema {
    return {
      type: 'object',
      description: 'Node connection mapping. Keys are source node names.',
      properties: {
        '[nodeName]': {
          type: 'object',
          description: 'Connections from this node',
          properties: {
            main: {
              type: 'array',
              description: 'Array of output connections (one array per output)',
              items: {
                type: 'array',
                description: 'Connections for this output',
                items: {
                  type: 'object',
                  description: 'Single connection',
                  properties: {
                    node: { type: 'string', description: 'Target node name' },
                    type: { type: 'string', description: 'Connection type (main)' },
                    index: { type: 'number', description: 'Target input index' },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private extractCommonTypes(): Record<string, any> {
    return {
      // Filter type (used by If, Switch, etc.)
      FilterValue: {
        type: 'object',
        description: 'Filter condition value (If/Switch nodes)',
        required: ['options', 'conditions', 'combinator'],
        properties: {
          options: {
            type: 'object',
            required: ['caseSensitive', 'leftValue'],
            properties: {
              caseSensitive: { type: 'boolean', default: true },
              leftValue: { type: 'string', default: '' },
              typeValidation: { type: 'string', enum: ['strict', 'loose'], default: 'strict' },
              version: { type: 'number', description: 'Filter version (for Switch v3.2+)' },
            },
          },
          conditions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                leftValue: { type: 'string', description: 'Left operand (can be expression)' },
                rightValue: { type: 'string', description: 'Right operand' },
                operator: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['string', 'number', 'boolean', 'dateTime', 'object', 'array'] },
                    operation: { type: 'string', description: 'Operation (equals, contains, etc.)' },
                    rightType: { type: 'string' },
                    singleValue: { type: 'boolean' },
                  },
                },
              },
            },
          },
          combinator: { type: 'string', enum: ['and', 'or'], default: 'and' },
        },
      },

      // Expression types
      Expression: {
        type: 'string',
        description: 'n8n expression (starts with = or {{ }})',
        pattern: '^(=.*|\\{\\{.*\\}\\})$',
        examples: [
          '={{ $json.fieldName }}',
          '={{ $node["NodeName"].json.field }}',
          '={{ $now.format("yyyy-MM-dd") }}',
        ],
      },

      // Fixed Collection type
      FixedCollection: {
        type: 'object',
        description: 'Fixed collection parameter type',
        properties: {
          '[optionName]': {
            type: 'array',
            description: 'Array of values for this option',
            items: { type: 'object' },
          },
        },
      },

      // Resource Locator type
      ResourceLocator: {
        type: 'object',
        description: 'Resource locator for selecting resources by ID, URL, or list',
        properties: {
          __rl: { type: 'boolean', const: true },
          mode: { type: 'string', enum: ['id', 'url', 'list', 'name'] },
          value: { type: 'string' },
          cachedResultName: { type: 'string' },
          cachedResultUrl: { type: 'string' },
        },
      },

      // Credential reference
      CredentialReference: {
        type: 'object',
        description: 'Reference to a stored credential',
        properties: {
          id: { type: 'string', description: 'Credential ID' },
          name: { type: 'string', description: 'Credential name' },
        },
      },

      // Parameter types enum
      ParameterTypes: {
        type: 'string',
        enum: [
          'string',
          'number',
          'boolean',
          'json',
          'options',
          'multiOptions',
          'collection',
          'fixedCollection',
          'color',
          'dateTime',
          'filter',
          'assignmentCollection',
          'resourceLocator',
          'resourceMapper',
          'notice',
          'button',
          'credentials',
          'hidden',
        ],
        description: 'All available parameter types in n8n',
      },

      // Node type format
      NodeTypeFormat: {
        type: 'string',
        pattern: '^[a-zA-Z0-9-]+\\.[a-zA-Z0-9]+$',
        description: 'Node type format: package.nodeName (e.g., n8n-nodes-base.httpRequest)',
        examples: [
          'n8n-nodes-base.httpRequest',
          'n8n-nodes-base.if',
          'n8n-nodes-base.webhook',
          '@n8n/n8n-nodes-langchain.agent',
        ],
      },

      // Routing config (for declarative nodes)
      RoutingConfig: {
        type: 'object',
        description: 'Declarative API routing configuration',
        properties: {
          request: {
            type: 'object',
            properties: {
              method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
              url: { type: 'string' },
              baseURL: { type: 'string' },
              headers: { type: 'object' },
              body: { type: 'object' },
              qs: { type: 'object' },
            },
          },
          output: {
            type: 'object',
            properties: {
              postReceive: { type: 'array' },
            },
          },
        },
      },

      // Trigger types
      TriggerTypes: {
        polling: {
          description: 'Polls for data at intervals',
          properties: {
            pollTimes: { type: 'object', description: 'When to poll' },
          },
        },
        webhook: {
          description: 'Receives webhook calls',
          properties: {
            webhookId: { type: 'string' },
            path: { type: 'string' },
            httpMethod: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] },
          },
        },
        event: {
          description: 'Listens for external events',
          properties: {
            eventSource: { type: 'string' },
          },
        },
      },
    };
  }

  private extractCredentialSchemas(): Map<string, any> {
    const credentials = new Map<string, any>();

    // Try to load credential types from n8n-nodes-base
    try {
      const credentialsDir = path.join(
        path.dirname(require.resolve('n8n-nodes-base/package.json')),
        'dist',
        'credentials',
      );

      if (fs.existsSync(credentialsDir)) {
        this.scanCredentialsDirectory(credentialsDir, credentials);
      }
    } catch {
      console.warn('   ⚠️ Could not load credential schemas');
    }

    return credentials;
  }

  private scanCredentialsDirectory(dir: string, credentials: Map<string, any>): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.credentials.js')) {
        try {
          const module = require(fullPath);
          for (const key in module) {
            const ExportedClass = module[key];
            if (typeof ExportedClass === 'function' && ExportedClass.prototype) {
              try {
                const instance = new ExportedClass();
                if (instance.name && instance.properties) {
                  credentials.set(instance.name, {
                    name: instance.name,
                    displayName: instance.displayName || instance.name,
                    documentationUrl: instance.documentationUrl,
                    properties: instance.properties,
                    authenticate: instance.authenticate ? 'custom' : undefined,
                  });
                }
              } catch {
                // Skip
              }
            }
          }
        } catch {
          // Skip
        }
      }
    }
  }

  private async writeSchemas(
    nodeSchemas: Map<string, ExtractedNodeSchema>,
    workflowSchema: WorkflowSchema,
    commonTypes: Record<string, any>,
    credentialSchemas: Map<string, any>,
  ): Promise<void> {
    // Write individual node schemas
    const nodesDir = path.join(this.outputDir, 'nodes');
    const categoryMap: Record<string, string[]> = {};

    for (const [name, schema] of nodeSchemas) {
      const filename = `${name}.json`;
      const filepath = path.join(nodesDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(schema, null, 2));

      // Group by category
      const categories = schema.group || ['Other'];
      for (const category of categories) {
        if (!categoryMap[category]) {
          categoryMap[category] = [];
        }
        categoryMap[category].push(name);
      }
    }

    // Write category index files
    const byCategoryDir = path.join(nodesDir, 'by-category');
    for (const [category, nodes] of Object.entries(categoryMap)) {
      const categoryFile = path.join(byCategoryDir, `${category.toLowerCase()}.json`);
      fs.writeFileSync(categoryFile, JSON.stringify({
        category,
        nodeCount: nodes.length,
        nodes: nodes.sort(),
      }, null, 2));
    }

    // Write master node index
    const nodeIndex = {
      totalNodes: nodeSchemas.size,
      categories: Object.keys(categoryMap).sort(),
      nodes: Array.from(nodeSchemas.keys()).sort(),
      byCategory: categoryMap,
    };
    fs.writeFileSync(
      path.join(nodesDir, '_index.json'),
      JSON.stringify(nodeIndex, null, 2),
    );

    // Write workflow schema
    const workflowDir = path.join(this.outputDir, 'workflow');
    fs.writeFileSync(
      path.join(workflowDir, 'workflow-schema.json'),
      JSON.stringify(workflowSchema, null, 2),
    );
    fs.writeFileSync(
      path.join(workflowDir, 'node-instance-schema.json'),
      JSON.stringify(workflowSchema.nodeSchema, null, 2),
    );
    fs.writeFileSync(
      path.join(workflowDir, 'connection-schema.json'),
      JSON.stringify(workflowSchema.connectionSchema, null, 2),
    );

    // Write common types
    const commonDir = path.join(this.outputDir, 'common');
    fs.writeFileSync(
      path.join(commonDir, 'common-types.json'),
      JSON.stringify(commonTypes, null, 2),
    );

    // Write individual common type files
    for (const [typeName, typeSchema] of Object.entries(commonTypes)) {
      fs.writeFileSync(
        path.join(commonDir, `${typeName}.json`),
        JSON.stringify(typeSchema, null, 2),
      );
    }

    // Write credential schemas
    const credentialsDir = path.join(this.outputDir, 'credentials');
    for (const [name, schema] of credentialSchemas) {
      const filename = `${name}.json`;
      fs.writeFileSync(
        path.join(credentialsDir, filename),
        JSON.stringify(schema, null, 2),
      );
    }

    // Write credential index
    fs.writeFileSync(
      path.join(credentialsDir, '_index.json'),
      JSON.stringify({
        totalCredentials: credentialSchemas.size,
        credentials: Array.from(credentialSchemas.keys()).sort(),
      }, null, 2),
    );

    console.log(`   ✓ ${nodeSchemas.size} node schemas`);
    console.log(`   ✓ ${Object.keys(categoryMap).length} category indexes`);
    console.log(`   ✓ Workflow schema`);
    console.log(`   ✓ ${Object.keys(commonTypes).length} common types`);
    console.log(`   ✓ ${credentialSchemas.size} credential schemas`);
  }

  private generateStats(nodeSchemas: Map<string, ExtractedNodeSchema>): ExtractionStats {
    let versionedNodes = 0;
    let totalVersions = 0;

    for (const schema of nodeSchemas.values()) {
      if (schema.hasVersions) {
        versionedNodes++;
        totalVersions += schema.availableVersions?.length || 1;
      } else {
        totalVersions++;
      }
    }

    // Get n8n version
    let n8nVersion = 'unknown';
    try {
      const pkgPath = require.resolve('n8n-workflow/package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      n8nVersion = pkg.version;
    } catch {
      // Ignore
    }

    const stats: ExtractionStats = {
      totalNodes: nodeSchemas.size,
      versionedNodes,
      totalVersions,
      credentialTypes: this.credentials.size,
      extractedAt: new Date().toISOString(),
      n8nVersion,
    };

    // Write stats file
    fs.writeFileSync(
      path.join(this.outputDir, '_extraction-stats.json'),
      JSON.stringify(stats, null, 2),
    );

    return stats;
  }
}

// Main execution
async function main() {
  const outputDir = process.argv[2] || path.join(process.cwd(), 'schemas');
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  n8n Schema Extractor');
  console.log('═══════════════════════════════════════════════════════════\n');

  const extractor = new SchemaExtractor(outputDir);
  const result = await extractor.extract();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Extraction Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Nodes:       ${result.stats.totalNodes}`);
  console.log(`  Versioned:   ${result.stats.versionedNodes}`);
  console.log(`  Versions:    ${result.stats.totalVersions}`);
  console.log(`  Credentials: ${result.stats.credentialTypes}`);
  console.log(`  n8n Version: ${result.stats.n8nVersion}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
