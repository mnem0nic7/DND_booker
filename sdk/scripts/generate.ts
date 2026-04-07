import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as V1 from '../../shared/src/api/v1.ts';

type ApiV1RouteContract = V1.ApiV1RouteContract;
const { ProblemSchema, V1_ROUTE_CONTRACTS } = V1;

function toOpenApiSchema(schema: ApiV1RouteContract['responseSchema']) {
  if (!schema) return undefined;
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

function toSuccessResponse(route: ApiV1RouteContract) {
  if (route.axiosResponseType === 'blob') {
    return {
      description: 'Success',
      content: {
        'application/octet-stream': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    };
  }

  if (route.responseSchema) {
    return {
      description: 'Success',
      content: {
        'application/json': {
          schema: toOpenApiSchema(route.responseSchema),
        },
      },
    };
  }

  return { description: 'Success' };
}

function getObjectShape(schema: ApiV1RouteContract['paramsSchema']) {
  if (!schema || typeof schema !== 'object' || !('shape' in schema)) return {};
  return (schema as { shape: Record<string, unknown> }).shape;
}

function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of V1_ROUTE_CONTRACTS) {
    const pathItem = paths[route.path] ?? {};
    const parameters = Object.entries(getObjectShape(route.paramsSchema)).map(([name, paramSchema]) => ({
      name,
      in: route.path.includes(`{${name}}`) ? 'path' : 'query',
      required: route.path.includes(`{${name}}`),
      schema: toOpenApiSchema(paramSchema as ApiV1RouteContract['responseSchema']),
    }));

    const operation: Record<string, unknown> = {
      operationId: route.operationId,
      summary: route.summary,
      tags: [route.tag],
      responses: {
        [route.operationId.startsWith('create') || route.operationId === 'register' ? '201' : '200']: toSuccessResponse(route),
        default: {
          description: 'Error',
          content: {
            'application/json': {
              schema: toOpenApiSchema(ProblemSchema),
            },
          },
        },
      },
    };

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    if (route.requestBodySchema) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: toOpenApiSchema(route.requestBodySchema),
          },
        },
      };
    }

    pathItem[route.method] = operation;
    paths[route.path] = pathItem;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'DND Booker API',
      version: '1.0.0-alpha',
    },
    paths,
  };
}

function getTypeImports() {
  const names = new Set<string>(['Problem']);
  const globalTypes = new Set(['Blob']);
  for (const route of V1_ROUTE_CONTRACTS) {
    for (const source of [route.paramsTypeName, route.requestTypeName, route.responseTypeName]) {
      if (!source) continue;
      for (const match of source.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) {
        if (!globalTypes.has(match[0])) {
          names.add(match[0]);
        }
      }
    }
  }
  return [...names].sort();
}

function buildClientSource() {
  const imports = getTypeImports().join(',\n  ');
  const routesByTag = new Map<string, ApiV1RouteContract[]>();

  for (const route of V1_ROUTE_CONTRACTS) {
    const bucket = routesByTag.get(route.tag) ?? [];
    bucket.push(route);
    routesByTag.set(route.tag, bucket);
  }

  const interfaceSections = [...routesByTag.entries()].map(([tag, routes]) => {
    const methods = routes.map((route) => {
      const parts: string[] = [];
      if (route.paramsTypeName) parts.push(`params: ${route.paramsTypeName}`);
      if (route.requestTypeName) parts.push(`body: ${route.requestTypeName}`);
      parts.push('config?: AxiosRequestConfig');
      return `    ${route.operationId}(${parts.join(', ')}): Promise<${route.responseTypeName ?? 'void'}>;`;
    }).join('\n');

    return `  ${tag}: {\n${methods}\n  };`;
  }).join('\n');

  const implementationSections = [...routesByTag.entries()].map(([tag, routes]) => {
    const methods = routes.map((route) => {
      const hasParams = Boolean(route.paramsTypeName);
      const hasBody = Boolean(route.requestTypeName);
      const clientPath = route.path.replace(/^\/api/, '') || '/';
      const pathExpr = hasParams
        ? `buildPath('${clientPath}', params as Record<string, string | number | undefined>)`
        : `'${clientPath}'`;
      const responseType = route.responseTypeName ?? 'void';
      const configExpr = route.axiosResponseType
        ? `{ ...(config ?? {}), responseType: '${route.axiosResponseType}' }`
        : 'config';
      const methodCall = route.method === 'get'
        ? `axios.get<${responseType}>(${pathExpr}, ${configExpr})`
        : hasBody
          ? `axios.${route.method}<${responseType}>(${pathExpr}, body, ${configExpr})`
          : `axios.${route.method}<${responseType}>(${pathExpr}, undefined, ${configExpr})`;
      const args: string[] = [];
      if (hasParams) args.push('params');
      if (hasBody) args.push('body');
      args.push('config');

      return [
        `      async ${route.operationId}(${args.map((arg) => {
          if (arg === 'params') return `params: ${route.paramsTypeName}`;
          if (arg === 'body') return `body: ${route.requestTypeName}`;
          return 'config?: AxiosRequestConfig';
        }).join(', ')}) {`,
        `        const { data } = await ${methodCall};`,
        '        return data;',
        '      },',
      ].join('\n');
    }).join('\n');

    return `    ${tag}: {\n${methods}\n    },`;
  }).join('\n');

  return `import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import type {
  ${imports}
} from '@dnd-booker/shared';

function buildPath(template: string, params?: Record<string, string | number | undefined>) {
  if (!params) return template;
  return Object.entries(params).reduce((path, [key, value]) => path.replace(\`{\${key}}\`, encodeURIComponent(String(value))), template);
}

export interface V1Client {
${interfaceSections}
}

export function createV1Client(axios: AxiosInstance): V1Client {
  return {
${implementationSections}
  };
}

export type { Problem };
`;
}

async function main() {
  const openApiPath = resolve(process.cwd(), 'openapi', 'v1.json');
  const clientPath = resolve(process.cwd(), 'src', 'generated', 'v1.ts');
  await mkdir(resolve(process.cwd(), 'openapi'), { recursive: true });
  await mkdir(resolve(process.cwd(), 'src', 'generated'), { recursive: true });
  await writeFile(openApiPath, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`, 'utf8');
  await writeFile(clientPath, buildClientSource(), 'utf8');
}

await main();
