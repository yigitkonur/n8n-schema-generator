#!/bin/bash
# Schema Extraction Runner
# Run this script to extract all n8n schemas

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${1:-$PROJECT_ROOT/schemas}"

echo "Building extraction scripts..."
cd "$PROJECT_ROOT"

# Compile scripts
npx tsc -p scripts/tsconfig.json

echo ""
echo "Running schema extraction..."
node --experimental-specifier-resolution=node dist/scripts/extract-schemas.js "$OUTPUT_DIR"

echo ""
echo "Running validation rules extraction..."
node --experimental-specifier-resolution=node dist/scripts/extract-validation-rules.js "$OUTPUT_DIR"

echo ""
echo "Done! Schemas written to: $OUTPUT_DIR"
