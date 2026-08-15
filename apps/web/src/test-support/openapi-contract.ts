import { fileURLToPath } from "node:url";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020 from "ajv/dist/2020.js";

/**
 * Validates real route-handler responses against `apps/web/openapi.yaml`
 * (HQ-53) — the contract suite's whole point. Dereferences the spec once
 * (all `$ref`s resolved to shared object references, so Ajv's per-schema
 * compilation cache works across repeated calls to the same named schema)
 * and matches a request's method + concrete URL path against the spec's
 * `{param}`-templated path keys.
 */

interface OpenApiOperationsByMethodAndPath {
  method: string;
  template: string;
  regex: RegExp;
  responses: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

let compiledOperations: OpenApiOperationsByMethodAndPath[] | null = null;

async function getOperations(): Promise<OpenApiOperationsByMethodAndPath[]> {
  if (compiledOperations) return compiledOperations;

  const specPath = fileURLToPath(new URL("../../openapi.yaml", import.meta.url));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (await SwaggerParser.dereference(specPath)) as any;

  const operations: OpenApiOperationsByMethodAndPath[] = [];
  for (const [template, pathItem] of Object.entries<Record<string, unknown>>(api.paths ?? {})) {
    const regex = new RegExp(`^${template.replace(/\{[^}]+\}/g, "([^/]+)")}$`);
    for (const method of ["get", "post", "patch", "put", "delete"]) {
      const operation = pathItem[method] as { responses?: OpenApiOperationsByMethodAndPath["responses"] } | undefined;
      if (!operation) continue;
      operations.push({ method: method.toUpperCase(), template, regex, responses: operation.responses ?? {} });
    }
  }

  compiledOperations = operations;
  return operations;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });

/**
 * Asserts that `status`+`body` is a documented response for `method`+`urlPath`
 * in openapi.yaml, and that `body` validates against that response's schema.
 * Throws with a diagnostic message (not a vitest `expect`) so failures read
 * the same regardless of which test file calls this.
 */
export async function assertResponseMatchesSpec(
  method: string,
  urlPath: string,
  status: number,
  body: unknown,
): Promise<void> {
  const pathOnly = urlPath.split("?")[0]!;
  const operations = await getOperations();
  const operation = operations.find((op) => op.method === method.toUpperCase() && op.regex.test(pathOnly));
  if (!operation) {
    throw new Error(`openapi-contract: no operation documented for ${method} ${urlPath}`);
  }

  const response = operation.responses[String(status)];
  if (!response) {
    const documented = Object.keys(operation.responses).join(", ");
    throw new Error(
      `openapi-contract: ${method} ${operation.template} has no documented response for status ${status} ` +
        `(documented: ${documented})`,
    );
  }

  const schema = response.content?.["application/json"]?.schema;
  if (!schema) return;

  const validate = ajv.compile(schema);
  if (!validate(body)) {
    throw new Error(
      `openapi-contract: ${method} ${operation.template} ${status} response doesn't match its schema:\n` +
        `${JSON.stringify(validate.errors, null, 2)}\nBody: ${JSON.stringify(body, null, 2)}`,
    );
  }
}
