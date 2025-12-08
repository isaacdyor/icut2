import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openApiToBruno } from "@usebruno/converters";

const OPENAPI_URL = "http://localhost:3000/openapi.json";
const OUTPUT_DIR = join(import.meta.dirname, "../apps/server/bruno");
const BASE_URL_PATTERN = /^\//;
const PATH_PARAM_PATTERN = /:(\w+)/g;

type BrunoRequest = {
  uid: string;
  name: string;
  type: string;
  request: {
    url: string;
    method: string;
    headers: Array<{ name: string; value: string; enabled: boolean }>;
    params: Array<{ name: string; value: string; enabled: boolean }>;
    body: {
      mode: string;
      json: string | null;
    };
  };
  seq: number;
};

type BrunoCollection = {
  name: string;
  version: string;
  items: BrunoRequest[];
  environments: Array<{
    name: string;
    variables: Array<{ name: string; value: string; enabled: boolean }>;
  }>;
};

function getFolderFromUrl(url: string): string {
  const path = url.replace("{{baseUrl}}", "").replace(BASE_URL_PATTERN, "");
  if (!path) {
    return "";
  }

  // Convert :param to {param} for Bruno folder naming
  return path.replace(PATH_PARAM_PATTERN, "{$1}");
}

function generateBruFile(item: BrunoRequest): string {
  const lines: string[] = [];

  lines.push("meta {");
  lines.push(`  name: ${item.name}`);
  lines.push("  type: http");
  lines.push(`  seq: ${item.seq}`);
  lines.push("}");
  lines.push("");

  lines.push(`${item.request.method.toLowerCase()} {`);
  lines.push(`  url: ${item.request.url}`);
  lines.push(`  body: ${item.request.body.mode}`);
  lines.push("  auth: inherit");
  lines.push("}");

  if (item.request.body.mode === "json" && item.request.body.json) {
    lines.push("");
    lines.push("body:json {");
    // Indent JSON content properly (add 2 spaces to each line)
    const jsonLines = item.request.body.json.split("\n");
    for (const jsonLine of jsonLines) {
      lines.push(`  ${jsonLine}`);
    }
    lines.push("}");
  }

  lines.push("");
  return lines.join("\n");
}

function generateBrunoJson(collection: BrunoCollection): string {
  return JSON.stringify(
    {
      version: "1",
      name: collection.name,
      type: "collection",
      ignore: ["node_modules", ".git"],
    },
    null,
    2
  );
}

function generateEnvironmentFile(
  env: BrunoCollection["environments"][0]
): string {
  const lines: string[] = ["vars {"];

  for (const variable of env.variables) {
    if (variable.enabled) {
      lines.push(`  ${variable.name}: ${variable.value}`);
    }
  }

  lines.push("}");
  return lines.join("\n");
}

async function generateBrunoCollection() {
  try {
    const response = await fetch(OPENAPI_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
    }

    const openApiSpec = await response.json();
    const collection = openApiToBruno(openApiSpec) as BrunoCollection;

    // Clean and recreate output directory
    await rm(OUTPUT_DIR, { recursive: true, force: true });
    await mkdir(OUTPUT_DIR, { recursive: true });

    // Write bruno.json
    await writeFile(
      join(OUTPUT_DIR, "bruno.json"),
      generateBrunoJson(collection)
    );

    // Write collection.bru
    const collectionBru = `meta {
  name: ${collection.name}
}

auth {
  mode: none
}
`;
    await writeFile(join(OUTPUT_DIR, "collection.bru"), collectionBru);

    // Write each request as a .bru file in appropriate folder
    for (const item of collection.items) {
      if (item.type === "http-request") {
        const folderPath = getFolderFromUrl(item.request.url);
        const targetDir = folderPath
          ? join(OUTPUT_DIR, folderPath)
          : OUTPUT_DIR;

        await mkdir(targetDir, { recursive: true });

        const bruContent = generateBruFile(item);
        await writeFile(join(targetDir, `${item.name}.bru`), bruContent);
      }
    }

    // Write environments
    if (collection.environments?.length > 0) {
      const envDir = join(OUTPUT_DIR, "environments");
      await mkdir(envDir, { recursive: true });

      for (const env of collection.environments) {
        const envContent = generateEnvironmentFile(env);
        await writeFile(join(envDir, `${env.name}.bru`), envContent);
      }
    }

    console.log(`Bruno collection generated at: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error("Error generating Bruno collection:", error);
    process.exit(1);
  }
}

generateBrunoCollection();
