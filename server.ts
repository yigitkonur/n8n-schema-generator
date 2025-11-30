#!/usr/bin/env node
/**
 * n8n Schema Validation API
 * 
 * A minimal, free API for validating n8n workflows and node configurations.
 * Built for developers using LLMs to generate n8n workflows.
 * 
 * Usage: npx ts-node server.ts [port]
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// When compiled, we're in dist/, so go up one level
const SCHEMAS_DIR = path.join(__dirname, '..', 'schemas');
const PORT = parseInt(process.env.PORT || process.argv[2] || '3000');

// ─────────────────────────────────────────────────────────────────────────────
// Schema Cache
// ─────────────────────────────────────────────────────────────────────────────

interface SchemaCache {
  nodes: Map<string, any>;
  validations: Map<string, any>;
  nodeIndex: any;
  validationIndex: any;
  workflow: any;
  common: any;
  credentials: Map<string, any>;
  meta: any;
}

function loadSchemas(): SchemaCache {
  const cache: SchemaCache = {
    nodes: new Map(),
    validations: new Map(),
    nodeIndex: null,
    validationIndex: null,
    workflow: null,
    common: null,
    credentials: new Map(),
    meta: null,
  };

  // Load node schemas
  const nodesDir = path.join(SCHEMAS_DIR, 'nodes');
  for (const file of fs.readdirSync(nodesDir)) {
    if (file.endsWith('.json') && !file.startsWith('_')) {
      const name = file.replace('.json', '');
      cache.nodes.set(name, JSON.parse(fs.readFileSync(path.join(nodesDir, file), 'utf8')));
    }
  }

  // Load validation schemas
  const validationDir = path.join(SCHEMAS_DIR, 'nodes', 'validation');
  if (fs.existsSync(validationDir)) {
    for (const file of fs.readdirSync(validationDir)) {
      if (file.endsWith('.json') && !file.startsWith('_')) {
        const name = file.replace('.json', '');
        cache.validations.set(name, JSON.parse(fs.readFileSync(path.join(validationDir, file), 'utf8')));
      }
    }
  }

  // Load indexes and meta
  cache.nodeIndex = JSON.parse(fs.readFileSync(path.join(nodesDir, '_index.json'), 'utf8'));
  cache.validationIndex = JSON.parse(fs.readFileSync(path.join(validationDir, '_index.json'), 'utf8'));
  cache.workflow = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'workflow', 'workflow.json'), 'utf8'));
  cache.common = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'common', 'types.json'), 'utf8'));
  cache.meta = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, '_meta.json'), 'utf8'));

  // Load credentials
  const credDir = path.join(SCHEMAS_DIR, 'credentials');
  if (fs.existsSync(credDir)) {
    for (const file of fs.readdirSync(credDir)) {
      if (file.endsWith('.json') && !file.startsWith('_')) {
        const name = file.replace('.json', '');
        cache.credentials.set(name, JSON.parse(fs.readFileSync(path.join(credDir, file), 'utf8')));
      }
    }
  }

  return cache;
}

const schemas = loadSchemas();

// ─────────────────────────────────────────────────────────────────────────────
// Validation Engine
// ─────────────────────────────────────────────────────────────────────────────

interface ValidationError {
  path: string;
  message: string;
  expected?: any;
  received?: any;
  hint?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  schema?: any;
}

function validateNode(nodeConfig: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Extract node type
  let nodeType = nodeConfig.type || '';
  const shortType = nodeType.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', '');

  // Check if node type exists
  const schema = schemas.nodes.get(shortType);
  const validation = schemas.validations.get(shortType);

  if (!schema) {
    errors.push({
      path: 'type',
      message: `Unknown node type: ${nodeType}`,
      hint: `Available nodes: ${Array.from(schemas.nodes.keys()).slice(0, 10).join(', ')}...`,
    });
    return { valid: false, errors, warnings };
  }

  // Validate required fields
  const requiredFields = ['type', 'typeVersion', 'position', 'parameters'];
  for (const field of requiredFields) {
    if (nodeConfig[field] === undefined) {
      errors.push({
        path: field,
        message: `Missing required field: ${field}`,
        expected: field === 'position' ? '[x, y]' : field === 'parameters' ? '{}' : 'value',
      });
    }
  }

  // Validate typeVersion
  if (nodeConfig.typeVersion !== undefined) {
    const validVersions = schema.availableVersions || [schema.version].flat();
    if (!validVersions.includes(nodeConfig.typeVersion)) {
      errors.push({
        path: 'typeVersion',
        message: `Invalid typeVersion: ${nodeConfig.typeVersion}`,
        expected: validVersions,
        received: nodeConfig.typeVersion,
        hint: `Use ${schema.defaultVersion || validVersions[validVersions.length - 1]} (latest)`,
      });
    }
  }

  // Validate position
  if (nodeConfig.position !== undefined) {
    if (!Array.isArray(nodeConfig.position) || nodeConfig.position.length !== 2) {
      errors.push({
        path: 'position',
        message: 'Position must be [x, y] array',
        expected: [0, 0],
        received: nodeConfig.position,
      });
    }
  }

  // Validate parameters
  if (nodeConfig.parameters && validation) {
    validateParameters(nodeConfig.parameters, validation, schema, errors, warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schema: errors.length > 0 ? { defaults: schema.defaults, properties: schema.properties } : undefined,
  };
}

function validateParameters(
  params: any,
  validation: any,
  schema: any,
  errors: ValidationError[],
  warnings: string[]
): void {
  // Check for unknown parameters
  const knownFields = new Set(validation.rules.map((r: any) => r.field));
  for (const key of Object.keys(params)) {
    if (!knownFields.has(key)) {
      warnings.push(`Unknown parameter: ${key}`);
    }
  }

  // Validate each rule
  for (const rule of validation.rules) {
    const value = params[rule.field];

    // Check enum values
    if (rule.enumValues && value !== undefined) {
      if (!rule.enumValues.includes(value)) {
        errors.push({
          path: `parameters.${rule.field}`,
          message: `Invalid value for ${rule.field}`,
          expected: rule.enumValues,
          received: value,
          hint: `Valid options: ${rule.enumValues.join(', ')}`,
        });
      }
    }

    // Check filter type structure
    if (rule.type === 'filter' && value !== undefined) {
      validateFilterValue(value, `parameters.${rule.field}`, errors);
    }

    // Check fixedCollection structure
    if (rule.type === 'fixedCollection' && value !== undefined) {
      validateFixedCollection(value, rule.field, schema, errors);
    }
  }
}

function validateFilterValue(value: any, path: string, errors: ValidationError[]): void {
  if (typeof value !== 'object' || value === null) {
    errors.push({
      path,
      message: 'Filter must be an object',
      expected: { options: {}, conditions: [], combinator: 'and' },
      received: value,
    });
    return;
  }

  // Check required filter fields
  if (!value.options || typeof value.options !== 'object') {
    errors.push({
      path: `${path}.options`,
      message: 'Filter missing required "options" object',
      expected: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      hint: 'This is a common LLM mistake - options must be inside the filter object',
    });
  }

  if (!Array.isArray(value.conditions)) {
    errors.push({
      path: `${path}.conditions`,
      message: 'Filter missing required "conditions" array',
      expected: [],
    });
  }

  if (!value.combinator) {
    errors.push({
      path: `${path}.combinator`,
      message: 'Filter missing required "combinator"',
      expected: ['and', 'or'],
      hint: 'Add combinator: "and" or "or"',
    });
  } else if (!['and', 'or'].includes(value.combinator)) {
    errors.push({
      path: `${path}.combinator`,
      message: `Invalid combinator: ${value.combinator}`,
      expected: ['and', 'or'],
    });
  }
}

function validateFixedCollection(value: any, field: string, schema: any, errors: ValidationError[]): void {
  if (typeof value !== 'object' || value === null) return;

  // Get valid option names from schema
  const prop = schema.properties.find((p: any) => p.name === field);
  if (!prop?.options) return;

  const validOptions = prop.options.map((o: any) => o.name);
  for (const key of Object.keys(value)) {
    if (!validOptions.includes(key)) {
      errors.push({
        path: `parameters.${field}.${key}`,
        message: `Invalid fixedCollection option: ${key}`,
        expected: validOptions,
        hint: `Valid options for ${field}: ${validOptions.join(', ')}`,
      });
    }
  }
}

function validateWorkflow(workflow: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
    errors.push({
      path: 'nodes',
      message: 'Workflow must have a "nodes" array',
      expected: [],
    });
  }

  if (!workflow.connections || typeof workflow.connections !== 'object') {
    errors.push({
      path: 'connections',
      message: 'Workflow must have a "connections" object',
      expected: {},
    });
  }

  // Validate each node
  if (Array.isArray(workflow.nodes)) {
    for (let i = 0; i < workflow.nodes.length; i++) {
      const node = workflow.nodes[i];
      const nodeResult = validateNode(node);
      
      for (const err of nodeResult.errors) {
        errors.push({
          ...err,
          path: `nodes[${i}].${err.path}`,
        });
      }
      warnings.push(...nodeResult.warnings.map(w => `nodes[${i}]: ${w}`));
    }

    // Check for duplicate names
    const names = workflow.nodes.map((n: any) => n.name).filter(Boolean);
    const duplicates = names.filter((n: string, i: number) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
      errors.push({
        path: 'nodes',
        message: `Duplicate node names: ${[...new Set(duplicates)].join(', ')}`,
        hint: 'Each node must have a unique name',
      });
    }

    // Validate connections reference existing nodes
    if (workflow.connections) {
      const nodeNames = new Set(names);
      for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
        if (!nodeNames.has(sourceName)) {
          errors.push({
            path: `connections.${sourceName}`,
            message: `Connection references non-existent node: ${sourceName}`,
          });
        }
        // Check targets
        if (outputs && typeof outputs === 'object') {
          for (const [outputType, outputConnections] of Object.entries(outputs as any)) {
            if (Array.isArray(outputConnections)) {
              for (const conns of outputConnections) {
                if (Array.isArray(conns)) {
                  for (const conn of conns) {
                    if (conn.node && !nodeNames.has(conn.node)) {
                      errors.push({
                        path: `connections.${sourceName}.${outputType}`,
                        message: `Connection targets non-existent node: ${conn.node}`,
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Server
// ─────────────────────────────────────────────────────────────────────────────

type Handler = (req: http.IncomingMessage, body: string, params: Record<string, string>) => any;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [];

function route(method: string, path: string, handler: Handler): void {
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  routes.push({ method, pattern, handler });
}

function json(data: any, status = 200): { status: number; body: string; headers: Record<string, string> } {
  return {
    status,
    body: JSON.stringify(data, null, 2),
    headers: { 'Content-Type': 'application/json' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// Health & Info
route('GET', '/', () => json({
  name: 'n8n Schema API',
  version: '1.0.0',
  n8n: schemas.meta.n8nVersion,
  nodes: schemas.nodes.size,
  updated: schemas.meta.extractedAt,
  endpoints: {
    'GET /': 'This info',
    'GET /nodes': 'List all nodes',
    'GET /nodes/:name': 'Get node schema',
    'GET /nodes/:name/defaults': 'Get computed defaults',
    'GET /nodes/:name/validation': 'Get validation rules',
    'GET /search?q=': 'Search nodes',
    'POST /validate/node': 'Validate node config',
    'POST /validate/workflow': 'Validate workflow',
    'GET /workflow': 'Workflow JSON schema',
    'GET /types': 'Common types (FilterValue, etc)',
  },
}));

// List nodes
route('GET', '/nodes', (req) => {
  const url = new URL(req.url || '', `http://localhost`);
  const category = url.searchParams.get('category');
  
  if (category) {
    const nodes = schemas.nodeIndex.byCategory[category] || [];
    return json({ category, count: nodes.length, nodes });
  }
  
  return json({
    total: schemas.nodeIndex.totalNodes,
    categories: schemas.nodeIndex.categories,
    nodes: schemas.nodeIndex.nodes,
  });
});

// Search nodes
route('GET', '/search', (req) => {
  const url = new URL(req.url || '', `http://localhost`);
  const q = (url.searchParams.get('q') || '').toLowerCase();
  
  if (!q) return json({ error: 'Missing ?q= parameter' }, 400);
  
  const results: Array<{ name: string; displayName: string; description: string; group: string[] }> = [];
  
  for (const [name, schema] of schemas.nodes) {
    if (
      name.toLowerCase().includes(q) ||
      schema.displayName?.toLowerCase().includes(q) ||
      schema.description?.toLowerCase().includes(q)
    ) {
      results.push({
        name,
        displayName: schema.displayName,
        description: schema.description,
        group: schema.group,
      });
    }
  }
  
  return json({ query: q, count: results.length, results: results.slice(0, 50) });
});

// Get node schema
route('GET', '/nodes/:name', (_, __, params) => {
  const schema = schemas.nodes.get(params.name);
  if (!schema) {
    return json({ error: `Node not found: ${params.name}` }, 404);
  }
  return json(schema);
});

// Get node defaults
route('GET', '/nodes/:name/defaults', (_, __, params) => {
  const schema = schemas.nodes.get(params.name);
  if (!schema) {
    return json({ error: `Node not found: ${params.name}` }, 404);
  }
  return json({
    name: params.name,
    type: `n8n-nodes-base.${params.name}`,
    typeVersion: schema.defaultVersion || schema.version,
    defaults: schema.defaults,
  });
});

// Get node validation rules
route('GET', '/nodes/:name/validation', (_, __, params) => {
  const validation = schemas.validations.get(params.name);
  if (!validation) {
    return json({ error: `Validation not found: ${params.name}` }, 404);
  }
  return json(validation);
});

// Validate node
route('POST', '/validate/node', (_, body) => {
  try {
    const node = JSON.parse(body);
    return json(validateNode(node));
  } catch (e: any) {
    return json({ error: 'Invalid JSON', details: e.message }, 400);
  }
});

// Validate workflow
route('POST', '/validate/workflow', (_, body) => {
  try {
    const workflow = JSON.parse(body);
    return json(validateWorkflow(workflow));
  } catch (e: any) {
    return json({ error: 'Invalid JSON', details: e.message }, 400);
  }
});

// Workflow schema
route('GET', '/workflow', () => json(schemas.workflow));

// Common types
route('GET', '/types', () => json(schemas.common));

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const start = Date.now();
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const url = new URL(req.url || '', `http://localhost`);
    const method = req.method || 'GET';
    
    // Find matching route
    for (const route of routes) {
      if (route.method !== method) continue;
      const match = url.pathname.match(route.pattern);
      if (!match) continue;
      
      try {
        const result = route.handler(req, body, match.groups || {});
        res.writeHead(result.status, result.headers);
        res.end(result.body);
        
        const ms = Date.now() - start;
        const icon = result.status < 400 ? '✓' : '✗';
        console.log(`${icon} ${method} ${url.pathname} ${result.status} ${ms}ms`);
        return;
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal error', details: e.message }));
        console.log(`✗ ${method} ${url.pathname} 500 ${e.message}`);
        return;
      }
    }
    
    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: url.pathname }));
    console.log(`✗ ${method} ${url.pathname} 404`);
  });
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   n8n Schema API                          ║
╠═══════════════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT.toString().padEnd(28)}║
║  Nodes:      ${schemas.nodes.size.toString().padEnd(42)}║
║  n8n:        ${schemas.meta.n8nVersion.padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝

Endpoints:
  GET  /                    API info
  GET  /nodes               List all nodes
  GET  /nodes/:name         Get node schema
  GET  /nodes/:name/defaults  Get computed defaults
  GET  /search?q=           Search nodes
  POST /validate/node       Validate node config
  POST /validate/workflow   Validate workflow
  GET  /workflow            Workflow schema
  GET  /types               Common types

Ready for requests...
`);
});
