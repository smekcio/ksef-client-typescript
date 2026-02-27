#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const defaultOpenApiPath = path.resolve(packageRoot, "..", "ksef-docs", "open-api.json");
const defaultOutputPath = path.resolve(packageRoot, "src", "types", "openapi.generated.ts");

function printUsage() {
  console.log(
    "Usage: node scripts/generate-openapi-models.mjs [--openapi <path>] [--output <path>]",
  );
  console.log("");
  console.log("Defaults:");
  console.log(`  --openapi ${defaultOpenApiPath}`);
  console.log(`  --output  ${defaultOutputPath}`);
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg.startsWith("--openapi=")) {
      args.openapi = arg.slice("--openapi=".length);
      continue;
    }

    if (arg === "--openapi") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --openapi");
      }
      args.openapi = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --output");
      }
      args.output = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function resolvePath(baseDir, value) {
  if (!value) {
    return null;
  }

  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

function isValidIdentifier(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value);
}

function formatPropertyKey(value) {
  return isValidIdentifier(value) ? value : JSON.stringify(value);
}

function formatLiteral(value) {
  return JSON.stringify(value);
}

function sortByStableString(values) {
  return [...values].sort((left, right) => {
    const leftValue = JSON.stringify(left);
    const rightValue = JSON.stringify(right);
    return leftValue.localeCompare(rightValue, "en");
  });
}

function formatTsType(type) {
  return type.includes("\n") ? `(\n${indentLines(type, 2)}\n)` : type;
}

function indentLines(value, size) {
  const prefix = " ".repeat(size);
  return value
    .split("\n")
    .map((line) => (line.length ? `${prefix}${line}` : line))
    .join("\n");
}

function hasSchemaShape(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    Object.hasOwn(value, "$ref") ||
    Object.hasOwn(value, "type") ||
    Object.hasOwn(value, "properties") ||
    Object.hasOwn(value, "items") ||
    Object.hasOwn(value, "additionalProperties") ||
    Object.hasOwn(value, "enum") ||
    Object.hasOwn(value, "const") ||
    Object.hasOwn(value, "allOf") ||
    Object.hasOwn(value, "anyOf") ||
    Object.hasOwn(value, "oneOf")
  );
}

function parseRefName(ref) {
  const match = /^#\/components\/schemas\/([A-Za-z0-9_$]+)$/u.exec(ref);
  if (!match) {
    throw new Error(`Unsupported $ref: ${ref}`);
  }
  return match[1];
}

function renderType(schema) {
  if (!schema || typeof schema !== "object") {
    return "unknown";
  }

  const baseType = renderBaseType(schema);
  if (schema.nullable) {
    return `${formatTsType(baseType)} | null`;
  }
  return baseType;
}

function renderBaseType(schema) {
  if (schema.$ref) {
    return parseRefName(schema.$ref);
  }

  if (Array.isArray(schema.enum)) {
    const enumValues = sortByStableString(schema.enum);
    if (!enumValues.length) {
      return "never";
    }
    return enumValues.map((value) => formatLiteral(value)).join(" | ");
  }

  if (Object.hasOwn(schema, "const")) {
    return formatLiteral(schema.const);
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const intersections = schema.allOf.map((item) => formatTsType(renderType(item)));
    const schemaWithoutAllOf = { ...schema };
    delete schemaWithoutAllOf.allOf;
    if (hasSchemaShape(schemaWithoutAllOf)) {
      intersections.push(formatTsType(renderBaseType(schemaWithoutAllOf)));
    }
    return intersections.join(" & ");
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return schema.oneOf.map((item) => formatTsType(renderType(item))).join(" | ");
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return schema.anyOf.map((item) => formatTsType(renderType(item))).join(" | ");
  }

  if (schema.type === "array") {
    const itemType = formatTsType(renderType(schema.items));
    return `Array<${itemType}>`;
  }

  if (schema.type === "object" || schema.properties || schema.required) {
    return renderObjectType(schema);
  }

  if (schema.type === "string") {
    return "string";
  }

  if (schema.type === "integer" || schema.type === "number") {
    return "number";
  }

  if (schema.type === "boolean") {
    return "boolean";
  }

  return "unknown";
}

function renderObjectType(schema) {
  const properties = Object.entries(schema.properties ?? {}).sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  );
  const required = new Set(schema.required ?? []);
  const additionalProperties = schema.additionalProperties;

  if (!properties.length) {
    if (additionalProperties === true) {
      return "Record<string, unknown>";
    }
    if (additionalProperties && typeof additionalProperties === "object") {
      return `Record<string, ${renderType(additionalProperties)}>`;
    }
    return "Record<string, never>";
  }

  const lines = properties.map(([propertyName, propertySchema]) => {
    const optional = required.has(propertyName) ? "" : "?";
    return `${formatPropertyKey(propertyName)}${optional}: ${renderType(propertySchema)};`;
  });

  if (additionalProperties === true) {
    lines.push("[key: string]: unknown;");
  } else if (additionalProperties && typeof additionalProperties === "object") {
    lines.push(`[key: string]: ${renderType(additionalProperties)};`);
  }

  return `{\n${indentLines(lines.join("\n"), 2)}\n}`;
}

function generateTypesContent(spec) {
  const schemaEntries = Object.entries(spec.components?.schemas ?? {}).sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  );

  if (!schemaEntries.length) {
    throw new Error("OpenAPI spec does not contain components.schemas definitions.");
  }

  const openApiVersion = spec.openapi ?? "unknown";

  const lines = [
    "// This file is auto-generated by scripts/generate-openapi-models.mjs.",
    "// Do not edit manually.",
    "",
    `export const OPENAPI_SPEC_VERSION = ${JSON.stringify(String(openApiVersion))} as const;`,
    `export const OPENAPI_SCHEMA_COUNT = ${schemaEntries.length} as const;`,
    "",
  ];

  for (const [name, schema] of schemaEntries) {
    const renderedType = renderType(schema);
    lines.push(`export type ${name} = ${renderedType};`);
    lines.push("");
  }

  lines.push("export interface OpenApiGeneratedSchemaMap {");
  for (const [name] of schemaEntries) {
    lines.push(`  ${name}: ${name};`);
  }
  lines.push("}");
  lines.push("");
  lines.push("export type OpenApiGeneratedSchemaName = keyof OpenApiGeneratedSchemaMap;");
  lines.push("");

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const cwd = process.cwd();
  const openApiPath = resolvePath(cwd, args.openapi) ?? defaultOpenApiPath;
  const outputPath = resolvePath(cwd, args.output) ?? defaultOutputPath;

  if (!fs.existsSync(openApiPath)) {
    throw new Error(`OpenAPI file not found: ${openApiPath}`);
  }

  const raw = fs.readFileSync(openApiPath, "utf8");
  const spec = JSON.parse(raw);
  const generated = generateTypesContent(spec);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${generated}\n`, "utf8");

  const relativePath = path.relative(cwd, outputPath) || outputPath;
  console.log(`Generated OpenAPI models: ${relativePath}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
