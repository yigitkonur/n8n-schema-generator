#!/usr/bin/env npx ts-node
/**
 * Validation Rules Extractor
 * 
 * Extracts validation rules and constraints from n8n node definitions.
 * Focuses on what makes a node configuration valid vs invalid.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load n8n packages
const n8nWorkflow = require('n8n-workflow') as any;
const { NodeHelpers, VersionedNodeType: CjsVersionedNodeType } = n8nWorkflow;

interface ValidationRule {
  field: string;
  type: string;
  required: boolean;
  constraints: FieldConstraints;
  displayOptions?: DisplayOptions;
  dependsOn?: string[];
}

interface FieldConstraints {
  type: string;
  enumValues?: string[];
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  multipleOf?: number;
  format?: string;
  itemType?: string;
  properties?: Record<string, FieldConstraints>;
  requiredProperties?: string[];
}

interface DisplayOptions {
  show?: Record<string, unknown[]>;
  hide?: Record<string, unknown[]>;
}

interface NodeValidationSchema {
  nodeType: string;
  displayName: string;
  version: number | number[];
  defaultVersion?: number;
  category: string[];
  
  // Core validation rules
  requiredParameters: string[];
  optionalParameters: string[];
  validationRules: ValidationRule[];
  
  // Computed defaults (what n8n generates for empty params)
  computedDefaults: Record<string, unknown>;
  
  // Conditional logic
  conditionalFields: ConditionalField[];
  
  // Resource/operation combinations
  resourceOperations?: ResourceOperationMap;
  
  // Fixed collections with their valid options
  fixedCollections: FixedCollectionSchema[];
  
  // Filter conditions structure (for If/Switch)
  filterSchema?: FilterSchema;
}

interface ConditionalField {
  field: string;
  condition: DisplayOptions;
  dependsOnFields: string[];
}

interface ResourceOperationMap {
  [resource: string]: {
    operations: string[];
    fieldsPerOperation: Record<string, string[]>;
  };
}

interface FixedCollectionSchema {
  name: string;
  validOptions: string[];
  optionSchemas: Record<string, ValidationRule[]>;
}

interface FilterSchema {
  type: 'filter';
  requiredFields: string[];
  optionsSchema: {
    caseSensitive: { type: 'boolean'; default: boolean };
    leftValue: { type: 'string'; default: string };
    typeValidation: { type: 'string'; enum: string[]; default: string };
    version?: { type: 'number' };
  };
  conditionSchema: {
    leftValue: { type: 'string' };
    rightValue: { type: 'string' };
    operator: {
      type: { type: 'string'; enum: string[] };
      operation: { type: 'string' };
    };
  };
  combinator: { type: 'string'; enum: string[]; default: string };
}

interface WorkflowValidationSchema {
  structure: StructureValidation;
  nodes: NodeInstanceValidation;
  connections: ConnectionValidation;
  settings: SettingsValidation;
}

interface StructureValidation {
  requiredProperties: string[];
  optionalProperties: string[];
  propertyTypes: Record<string, string>;
}

interface NodeInstanceValidation {
  requiredFields: string[];
  fieldTypes: Record<string, FieldValidation>;
  typeFormat: {
    pattern: string;
    examples: string[];
    validPrefixes: string[];
  };
}

interface FieldValidation {
  type: string;
  required: boolean;
  constraints?: FieldConstraints;
}

interface ConnectionValidation {
  structure: {
    type: 'object';
    keyPattern: string;
    valueType: 'ConnectionOutput';
  };
  connectionOutput: {
    type: 'object';
    properties: {
      main: { type: 'array'; items: 'ConnectionArray' };
    };
  };
  connectionItem: {
    required: string[];
    properties: Record<string, { type: string }>;
  };
}

interface SettingsValidation {
  validSettings: Record<string, FieldValidation>;
  executionOrderOptions: string[];
  errorWorkflowFormat: string;
}

class ValidationRulesExtractor {
  private nodesBaseRoot: string;
  private outputDir: string;
  private nodes: Map<string, any> = new Map();

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    
    try {
      this.nodesBaseRoot = path.join(
        path.dirname(require.resolve('n8n-nodes-base/package.json')),
        'dist',
        'nodes',
      );
    } catch {
      throw new Error('Could not locate n8n-nodes-base.');
    }
  }

  async extract(): Promise<void> {
    console.log('🔍 Extracting validation rules...\n');

    this.ensureDirectories();
    await this.loadAllNodes();

    console.log(`📦 Loaded ${this.nodes.size} node types\n`);

    // Extract node validation schemas
    const nodeSchemas = this.extractNodeValidationSchemas();
    
    // Extract workflow validation schema
    const workflowSchema = this.extractWorkflowValidationSchema();

    // Extract expression validation rules
    const expressionRules = this.extractExpressionValidation();

    // Write all schemas
    await this.writeValidationSchemas(nodeSchemas, workflowSchema, expressionRules);

    console.log('\n✅ Validation rules extracted successfully!');
  }

  private ensureDirectories(): void {
    const dirs = [
      this.outputDir,
      path.join(this.outputDir, 'nodes'),
      path.join(this.outputDir, 'nodes', 'validation'),
      path.join(this.outputDir, 'workflow'),
      path.join(this.outputDir, 'expressions'),
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
              this.nodes.set(name, instance);
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

  private extractNodeValidationSchemas(): Map<string, NodeValidationSchema> {
    const schemas = new Map<string, NodeValidationSchema>();

    for (const [name, nodeInstance] of this.nodes) {
      try {
        const schema = this.extractSingleNodeValidation(name, nodeInstance);
        if (schema) {
          schemas.set(name, schema);
        }
      } catch (error: any) {
        console.warn(`   ⚠️ Failed to extract validation for ${name}: ${error.message}`);
      }
    }

    return schemas;
  }

  private extractSingleNodeValidation(name: string, nodeInstance: any): NodeValidationSchema | null {
    const isVersioned = nodeInstance instanceof CjsVersionedNodeType;

    let description: any;
    let defaultVersion: number | undefined;

    if (isVersioned) {
      const vt = nodeInstance as any;
      defaultVersion = vt.description?.defaultVersion ?? vt.getLatestVersion();
      const concrete = vt.getNodeType(defaultVersion);
      description = concrete.description;
    } else {
      description = nodeInstance.description;
    }

    if (!description) return null;

    const properties = description.properties || [];

    // Compute defaults using n8n's logic
    let computedDefaults: Record<string, unknown> = {};
    try {
      computedDefaults = NodeHelpers.getNodeParameters(
        properties,
        {},
        true,
        true,
        { typeVersion: defaultVersion ?? 1 },
        description,
      ) || {};
    } catch {
      computedDefaults = {};
    }

    // Extract validation rules for each property
    const validationRules = this.extractPropertyValidationRules(properties);
    
    // Find required vs optional
    const requiredParameters: string[] = [];
    const optionalParameters: string[] = [];
    
    for (const rule of validationRules) {
      if (rule.required && !rule.displayOptions) {
        requiredParameters.push(rule.field);
      } else {
        optionalParameters.push(rule.field);
      }
    }

    // Extract conditional fields
    const conditionalFields = this.extractConditionalFields(properties);

    // Extract resource/operation mappings
    const resourceOperations = this.extractResourceOperations(properties);

    // Extract fixed collections
    const fixedCollections = this.extractFixedCollections(properties);

    // Extract filter schema if applicable
    const filterSchema = this.extractFilterSchema(properties, name);

    return {
      nodeType: `n8n-nodes-base.${name}`,
      displayName: description.displayName,
      version: description.version,
      defaultVersion,
      category: description.group || [],
      requiredParameters,
      optionalParameters,
      validationRules,
      computedDefaults,
      conditionalFields,
      resourceOperations: Object.keys(resourceOperations).length > 0 ? resourceOperations : undefined,
      fixedCollections,
      filterSchema,
    };
  }

  private extractPropertyValidationRules(properties: any[]): ValidationRule[] {
    const rules: ValidationRule[] = [];

    for (const prop of properties) {
      if (!prop.name) continue;

      const rule = this.buildValidationRule(prop);
      rules.push(rule);
    }

    return rules;
  }

  private buildValidationRule(prop: any): ValidationRule {
    const constraints = this.buildConstraints(prop);
    const dependsOn = this.findDependencies(prop);

    return {
      field: prop.name,
      type: prop.type || 'string',
      required: prop.required === true || (prop.default === undefined && !prop.displayOptions),
      constraints,
      displayOptions: prop.displayOptions,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    };
  }

  private buildConstraints(prop: any): FieldConstraints {
    const constraints: FieldConstraints = {
      type: prop.type || 'string',
      default: prop.default,
    };

    // Extract enum values from options
    if (prop.options && Array.isArray(prop.options)) {
      if (prop.type === 'options' || prop.type === 'multiOptions') {
        constraints.enumValues = prop.options.map((o: any) => o.value);
      }
    }

    // Extract type-specific constraints
    if (prop.typeOptions) {
      if (prop.typeOptions.minValue !== undefined) {
        constraints.minValue = prop.typeOptions.minValue;
      }
      if (prop.typeOptions.maxValue !== undefined) {
        constraints.maxValue = prop.typeOptions.maxValue;
      }
      if (prop.typeOptions.minLength !== undefined) {
        constraints.minLength = prop.typeOptions.minLength;
      }
      if (prop.typeOptions.maxLength !== undefined) {
        constraints.maxLength = prop.typeOptions.maxLength;
      }
      if (prop.typeOptions.multipleOf !== undefined) {
        constraints.multipleOf = prop.typeOptions.multipleOf;
      }
    }

    // Handle collection/fixedCollection properties
    if ((prop.type === 'collection' || prop.type === 'fixedCollection') && prop.options) {
      constraints.properties = {};
      constraints.requiredProperties = [];
      
      for (const option of prop.options) {
        if (option.values && Array.isArray(option.values)) {
          const subConstraints: Record<string, FieldConstraints> = {};
          for (const subProp of option.values) {
            subConstraints[subProp.name] = this.buildConstraints(subProp);
            if (subProp.required) {
              constraints.requiredProperties!.push(`${option.name}.${subProp.name}`);
            }
          }
          constraints.properties[option.name] = {
            type: 'object',
            properties: subConstraints,
          };
        }
      }
    }

    return constraints;
  }

  private findDependencies(prop: any): string[] {
    const deps: string[] = [];

    if (prop.displayOptions) {
      if (prop.displayOptions.show) {
        deps.push(...Object.keys(prop.displayOptions.show));
      }
      if (prop.displayOptions.hide) {
        deps.push(...Object.keys(prop.displayOptions.hide));
      }
    }

    return [...new Set(deps)];
  }

  private extractConditionalFields(properties: any[]): ConditionalField[] {
    const conditionalFields: ConditionalField[] = [];

    for (const prop of properties) {
      if (prop.displayOptions) {
        const dependsOn = this.findDependencies(prop);
        conditionalFields.push({
          field: prop.name,
          condition: prop.displayOptions,
          dependsOnFields: dependsOn,
        });
      }
    }

    return conditionalFields;
  }

  private extractResourceOperations(properties: any[]): ResourceOperationMap {
    const result: ResourceOperationMap = {};

    // Find resource field
    const resourceProp = properties.find(p => p.name === 'resource');
    const operationProp = properties.find(p => p.name === 'operation');

    if (!resourceProp || !operationProp) return result;

    // Get all resources
    const resources = resourceProp.options?.map((o: any) => o.value) || [];

    for (const resource of resources) {
      // Find operations for this resource
      const operations: string[] = [];
      const fieldsPerOperation: Record<string, string[]> = {};

      if (operationProp.options) {
        for (const op of operationProp.options) {
          // Check if operation applies to this resource
          const displayOptions = op.displayOptions || operationProp.displayOptions;
          if (displayOptions?.show?.resource?.includes(resource) || !displayOptions) {
            operations.push(op.value);
            
            // Find fields for this operation
            const fieldsForOp = properties
              .filter(p => {
                const show = p.displayOptions?.show;
                return show?.resource?.includes(resource) && show?.operation?.includes(op.value);
              })
              .map(p => p.name);
            
            if (fieldsForOp.length > 0) {
              fieldsPerOperation[op.value] = fieldsForOp;
            }
          }
        }
      }

      if (operations.length > 0) {
        result[resource] = { operations, fieldsPerOperation };
      }
    }

    return result;
  }

  private extractFixedCollections(properties: any[]): FixedCollectionSchema[] {
    const collections: FixedCollectionSchema[] = [];

    for (const prop of properties) {
      if (prop.type === 'fixedCollection' && prop.options) {
        const validOptions = prop.options.map((o: any) => o.name);
        const optionSchemas: Record<string, ValidationRule[]> = {};

        for (const option of prop.options) {
          if (option.values && Array.isArray(option.values)) {
            optionSchemas[option.name] = this.extractPropertyValidationRules(option.values);
          }
        }

        collections.push({
          name: prop.name,
          validOptions,
          optionSchemas,
        });
      }
    }

    return collections;
  }

  private extractFilterSchema(properties: any[], nodeName: string): FilterSchema | undefined {
    // Check if this node uses filter type (If, Switch, etc.)
    const filterProp = properties.find(p => p.type === 'filter');
    
    if (!filterProp) return undefined;

    return {
      type: 'filter',
      requiredFields: ['options', 'conditions', 'combinator'],
      optionsSchema: {
        caseSensitive: { type: 'boolean', default: true },
        leftValue: { type: 'string', default: '' },
        typeValidation: { type: 'string', enum: ['strict', 'loose'], default: 'strict' },
        version: { type: 'number' },
      },
      conditionSchema: {
        leftValue: { type: 'string' },
        rightValue: { type: 'string' },
        operator: {
          type: { type: 'string', enum: ['string', 'number', 'boolean', 'dateTime', 'object', 'array'] },
          operation: { type: 'string' },
        },
      },
      combinator: { type: 'string', enum: ['and', 'or'], default: 'and' },
    };
  }

  private extractWorkflowValidationSchema(): WorkflowValidationSchema {
    return {
      structure: {
        requiredProperties: ['nodes', 'connections'],
        optionalProperties: ['id', 'name', 'active', 'settings', 'staticData', 'pinData', 'tags', 'meta'],
        propertyTypes: {
          id: 'string',
          name: 'string',
          active: 'boolean',
          nodes: 'array',
          connections: 'object',
          settings: 'object',
          staticData: 'object',
          pinData: 'object',
          tags: 'array',
          meta: 'object',
        },
      },
      nodes: {
        requiredFields: ['type', 'typeVersion', 'position', 'parameters'],
        fieldTypes: {
          id: { type: 'string', required: false, constraints: { type: 'string', pattern: '^[a-f0-9-]{36}$' } },
          name: { type: 'string', required: false },
          type: { type: 'string', required: true, constraints: { type: 'string', pattern: '^[\\w@/-]+\\.[\\w]+$' } },
          typeVersion: { type: 'number', required: true, constraints: { type: 'number', minValue: 1 } },
          position: { type: 'array', required: true, constraints: { type: 'array', itemType: 'number', minLength: 2, maxLength: 2 } },
          parameters: { type: 'object', required: true },
          credentials: { type: 'object', required: false },
          disabled: { type: 'boolean', required: false },
          notes: { type: 'string', required: false },
          notesInFlow: { type: 'boolean', required: false },
          retryOnFail: { type: 'boolean', required: false },
          maxTries: { type: 'number', required: false, constraints: { type: 'number', minValue: 1 } },
          waitBetweenTries: { type: 'number', required: false, constraints: { type: 'number', minValue: 0 } },
          alwaysOutputData: { type: 'boolean', required: false },
          executeOnce: { type: 'boolean', required: false },
          continueOnFail: { type: 'boolean', required: false },
          onError: { type: 'string', required: false, constraints: { type: 'string', enumValues: ['stopWorkflow', 'continueRegularOutput', 'continueErrorOutput'] } },
          webhookId: { type: 'string', required: false },
        },
        typeFormat: {
          pattern: '^[\\w@/-]+\\.[\\w]+$',
          examples: ['n8n-nodes-base.httpRequest', 'n8n-nodes-base.if', '@n8n/n8n-nodes-langchain.agent'],
          validPrefixes: ['n8n-nodes-base', 'n8n-nodes-langchain', '@n8n/n8n-nodes-langchain'],
        },
      },
      connections: {
        structure: {
          type: 'object',
          keyPattern: '^.+$',
          valueType: 'ConnectionOutput',
        },
        connectionOutput: {
          type: 'object',
          properties: {
            main: { type: 'array', items: 'ConnectionArray' },
          },
        },
        connectionItem: {
          required: ['node', 'type', 'index'],
          properties: {
            node: { type: 'string' },
            type: { type: 'string' },
            index: { type: 'number' },
          },
        },
      },
      settings: {
        validSettings: {
          saveManualExecutions: { type: 'boolean', required: false },
          saveDataErrorExecution: { type: 'string', required: false, constraints: { type: 'string', enumValues: ['all', 'none'] } },
          saveDataSuccessExecution: { type: 'string', required: false, constraints: { type: 'string', enumValues: ['all', 'none'] } },
          saveExecutionProgress: { type: 'boolean', required: false },
          executionTimeout: { type: 'number', required: false, constraints: { type: 'number', minValue: -1 } },
          errorWorkflow: { type: 'string', required: false },
          timezone: { type: 'string', required: false },
          executionOrder: { type: 'string', required: false, constraints: { type: 'string', enumValues: ['v0', 'v1'] } },
        },
        executionOrderOptions: ['v0', 'v1'],
        errorWorkflowFormat: 'workflow ID string',
      },
    };
  }

  private extractExpressionValidation(): Record<string, any> {
    return {
      expressionFormat: {
        patterns: [
          { pattern: '^={{.*}}$', description: 'Standard expression format' },
          { pattern: '^{{.*}}$', description: 'Legacy expression format' },
        ],
        validPrefixes: ['$json', '$node', '$input', '$binary', '$now', '$today', '$env', '$execution', '$workflow', '$vars', '$runIndex', '$itemIndex', '$prevNode', '$parameter'],
      },
      commonExpressions: {
        '$json': { description: 'Access current item JSON data', example: '{{ $json.fieldName }}' },
        '$json["field"]': { description: 'Access field with special characters', example: '{{ $json["field-name"] }}' },
        '$node["name"].json': { description: 'Access another node output', example: '{{ $node["HTTP Request"].json.data }}' },
        '$input.first()': { description: 'Get first input item', example: '{{ $input.first().json }}' },
        '$input.last()': { description: 'Get last input item', example: '{{ $input.last().json }}' },
        '$input.all()': { description: 'Get all input items', example: '{{ $input.all() }}' },
        '$now': { description: 'Current DateTime', example: '{{ $now.format("yyyy-MM-dd") }}' },
        '$today': { description: 'Today at midnight', example: '{{ $today }}' },
        '$env': { description: 'Environment variables', example: '{{ $env.API_KEY }}' },
        '$execution.id': { description: 'Current execution ID', example: '{{ $execution.id }}' },
        '$workflow.id': { description: 'Current workflow ID', example: '{{ $workflow.id }}' },
        '$workflow.name': { description: 'Current workflow name', example: '{{ $workflow.name }}' },
        '$itemIndex': { description: 'Current item index', example: '{{ $itemIndex }}' },
        '$runIndex': { description: 'Current run index (for loops)', example: '{{ $runIndex }}' },
      },
      builtInFunctions: {
        string: ['toUpperCase', 'toLowerCase', 'trim', 'split', 'replace', 'slice', 'includes', 'startsWith', 'endsWith'],
        array: ['first', 'last', 'filter', 'map', 'reduce', 'length', 'includes', 'join'],
        number: ['round', 'floor', 'ceil', 'abs', 'toFixed'],
        dateTime: ['format', 'plus', 'minus', 'startOf', 'endOf', 'diff', 'toISO', 'toMillis'],
        object: ['keys', 'values', 'entries', 'isEmpty', 'hasOwnProperty'],
      },
      validationRules: {
        mustBeBalanced: { description: 'Brackets must be balanced', regex: null },
        noNestedExpressions: { description: 'Expressions cannot be nested', check: 'count {{ and }} pairs' },
        validVariableAccess: { description: 'Variable paths must be valid', check: 'parse and validate path' },
      },
    };
  }

  private async writeValidationSchemas(
    nodeSchemas: Map<string, NodeValidationSchema>,
    workflowSchema: WorkflowValidationSchema,
    expressionRules: Record<string, any>,
  ): Promise<void> {
    const nodesDir = path.join(this.outputDir, 'nodes', 'validation');
    const workflowDir = path.join(this.outputDir, 'workflow');
    const expressionsDir = path.join(this.outputDir, 'expressions');

    // Write individual node validation schemas
    for (const [name, schema] of nodeSchemas) {
      fs.writeFileSync(
        path.join(nodesDir, `${name}.validation.json`),
        JSON.stringify(schema, null, 2),
      );
    }

    // Write node validation index
    const nodeIndex = {
      totalNodes: nodeSchemas.size,
      nodes: Array.from(nodeSchemas.keys()).sort(),
      nodesWithFilters: Array.from(nodeSchemas.entries())
        .filter(([_, s]) => s.filterSchema)
        .map(([n, _]) => n),
      nodesWithResourceOperations: Array.from(nodeSchemas.entries())
        .filter(([_, s]) => s.resourceOperations)
        .map(([n, _]) => n),
      nodesWithFixedCollections: Array.from(nodeSchemas.entries())
        .filter(([_, s]) => s.fixedCollections.length > 0)
        .map(([n, _]) => n),
    };
    fs.writeFileSync(
      path.join(nodesDir, '_index.json'),
      JSON.stringify(nodeIndex, null, 2),
    );

    // Write workflow validation schema
    fs.writeFileSync(
      path.join(workflowDir, 'workflow-validation.json'),
      JSON.stringify(workflowSchema, null, 2),
    );

    fs.writeFileSync(
      path.join(workflowDir, 'node-instance-validation.json'),
      JSON.stringify(workflowSchema.nodes, null, 2),
    );

    fs.writeFileSync(
      path.join(workflowDir, 'connection-validation.json'),
      JSON.stringify(workflowSchema.connections, null, 2),
    );

    fs.writeFileSync(
      path.join(workflowDir, 'settings-validation.json'),
      JSON.stringify(workflowSchema.settings, null, 2),
    );

    // Write expression validation rules
    fs.writeFileSync(
      path.join(expressionsDir, 'expression-validation.json'),
      JSON.stringify(expressionRules, null, 2),
    );

    console.log(`   ✓ ${nodeSchemas.size} node validation schemas`);
    console.log(`   ✓ Workflow validation schema`);
    console.log(`   ✓ Expression validation rules`);
  }
}

// Main execution
async function main() {
  const outputDir = process.argv[2] || path.join(process.cwd(), 'schemas');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  n8n Validation Rules Extractor');
  console.log('═══════════════════════════════════════════════════════════\n');

  const extractor = new ValidationRulesExtractor(outputDir);
  await extractor.extract();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
