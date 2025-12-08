import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openApiToBruno } from "@usebruno/converters";

const OPENAPI_URL = "http://localhost:3000/openapi.json";
const OUTPUT_DIR = join(import.meta.dirname, "../apps/server/bruno");
const PARAM_PATTERN = /:(\w+)/g;
const START_WITH_SLASH_PATTERN = /^\//;

type BrunoCollection = {
  name: string;
  items: Array<{
    name: string;
    type: string;
    seq: number;
    request: {
      url: string;
      method: string;
      body: { mode: string; json: string | null };
    };
  }>;
  environments: Array<{
    name: string;
    variables: Array<{ name: string; value: string; enabled: boolean }>;
  }>;
};

async function main() {
  const response = await fetch(OPENAPI_URL);
  const spec = await response.json();
  const collection = openApiToBruno(spec) as BrunoCollection;

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  // bruno.json
  await writeFile(
    join(OUTPUT_DIR, "bruno.json"),
    JSON.stringify(
      { version: "1", name: collection.name, type: "collection" },
      null,
      2
    )
  );

  // collection.bru
  await writeFile(
    join(OUTPUT_DIR, "collection.bru"),
    `meta {\n  name: ${collection.name}\n}\n\nauth {\n  mode: none\n}\n`
  );

  // requests
  for (const item of collection.items) {
    if (item.type !== "http-request") {
      continue;
    }

    const folder = item.request.url
      .replace("{{baseUrl}}", "")
      .replace(START_WITH_SLASH_PATTERN, "")
      .replace(PARAM_PATTERN, "{$1}");

    const dir = folder ? join(OUTPUT_DIR, folder) : OUTPUT_DIR;
    await mkdir(dir, { recursive: true });

    let content = `meta {\n  name: ${item.name}\n  type: http\n  seq: ${item.seq}\n}\n\n`;
    content += `${item.request.method.toLowerCase()} {\n  url: ${item.request.url}\n  body: ${item.request.body.mode}\n  auth: inherit\n}\n`;

    if (item.request.body.mode === "json" && item.request.body.json) {
      const json = item.request.body.json
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n");
      content += `\nbody:json {\n${json}\n}\n`;
    }

    await writeFile(join(dir, `${item.name}.bru`), content);
  }

  // environments
  for (const env of collection.environments ?? []) {
    const envDir = join(OUTPUT_DIR, "environments");
    await mkdir(envDir, { recursive: true });
    const vars = env.variables
      .filter((v) => v.enabled)
      .map((v) => `  ${v.name}: ${v.value}`)
      .join("\n");
    await writeFile(join(envDir, `${env.name}.bru`), `vars {\n${vars}\n}\n`);
  }

  console.log(`Bruno collection generated at: ${OUTPUT_DIR}`);
}

main();
