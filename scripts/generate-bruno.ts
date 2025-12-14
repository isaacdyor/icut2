import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openApiToBruno } from "@usebruno/converters";

const OPENAPI_URL = "http://localhost:3000/openapi.json";
const OUTPUT_DIR = join(import.meta.dirname, "../apps/server/bruno");
const PARAM_PATTERN = /:(\w+)/g;
const START_WITH_SLASH_PATTERN = /^\//;

function getRequestFolder(url: string): string {
  return url
    .replace("{{baseUrl}}", "")
    .replace(START_WITH_SLASH_PATTERN, "")
    .replace(PARAM_PATTERN, "{$1}");
}

function buildBruContent(item: BrunoItem): string {
  const { name, seq, request } = item;
  if (!request) {
    return "";
  }

  let content = `meta {\n  name: ${name}\n  type: http\n  seq: ${seq}\n}\n\n`;
  content += `${request.method.toLowerCase()} {\n  url: ${request.url}\n  body: ${request.body.mode}\n  auth: inherit\n}\n`;

  if (request.body.mode === "json" && request.body.json) {
    const json = request.body.json
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
    content += `\nbody:json {\n${json}\n}\n`;
  }

  // Add headers for Origin and Cookie to all requests
  content += `
headers {
  Origin: http://localhost:3001
  Cookie: {{authCookie}}
}
`;

  // Add post-response script to sign-in endpoints to save auth cookie
  if (name === "signInEmail" || name === "signUpWithEmailAndPassword") {
    content += `
script:post-response {
  const setCookie = res.getHeader('set-cookie');
  if (setCookie) {
    const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
    const authCookie = cookieArray.find(c => c.startsWith('better-auth.'));
    if (authCookie) {
      const cookieValue = authCookie.split(';')[0];
      bru.setEnvVar("authCookie", cookieValue);
    }
  }
}
`;
  }

  return content;
}

type BrunoItem = {
  name: string;
  type: string;
  seq: number;
  items?: BrunoItem[];
  request?: {
    url: string;
    method: string;
    body: { mode: string; json: string | null };
  };
};

type BrunoCollection = {
  name: string;
  items: BrunoItem[];
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
    `meta {\n  name: ${collection.name}\n}\n\nauth {\n  mode: none\n}\n
script:pre-request {
  req.setHeader("Origin", "http://localhost:3001");
  const authCookie = bru.getEnvVar("authCookie");
  if (authCookie) {
    req.setHeader("Cookie", authCookie);
  }
}
`
  );

  // requests
  async function processItems(items: BrunoItem[]) {
    for (const item of items) {
      if (item.type === "folder" && item.items) {
        await processItems(item.items);
        continue;
      }

      if (item.type !== "http-request" || !item.request) {
        continue;
      }

      const folder = getRequestFolder(item.request.url);
      const dir = folder ? join(OUTPUT_DIR, folder) : OUTPUT_DIR;
      await mkdir(dir, { recursive: true });

      const content = buildBruContent(item);
      await writeFile(join(dir, `${item.name}.bru`), content);
    }
  }

  await processItems(collection.items);

  // environments
  for (const env of collection.environments ?? []) {
    const envDir = join(OUTPUT_DIR, "environments");
    await mkdir(envDir, { recursive: true });
    const vars = env.variables
      .filter((v) => v.enabled)
      .map((v) => `  ${v.name}: ${v.value}`)
      .join("\n");
    await writeFile(
      join(envDir, `${env.name}.bru`),
      `vars {\n${vars}\n}\n\nvars:secret [\n  authCookie\n]\n`
    );
  }

  console.log(`Bruno collection generated at: ${OUTPUT_DIR}`);
}

main();
