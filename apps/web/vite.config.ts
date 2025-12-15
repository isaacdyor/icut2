import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function getProxyTarget(reqUrl: string | undefined): string | null {
  const requestUrl = new URL(reqUrl ?? "", "http://localhost");
  return requestUrl.searchParams.get("url");
}

function isAllowedProxyMethod(method: string | undefined): boolean {
  const m = method ?? "GET";
  return m === "GET" || m === "HEAD";
}

function setProxyHeaders(
  upstream: Response,
  res: { statusCode: number; setHeader: (name: string, value: string) => void }
): void {
  res.statusCode = upstream.status;
  upstream.headers.forEach((value: string, key: string) => {
    if (key.toLowerCase() === "transfer-encoding") {
      return;
    }
    res.setHeader(key, value);
  });

  res.setHeader("access-control-allow-origin", "*");
  res.setHeader(
    "access-control-expose-headers",
    "content-length,content-type,accept-ranges,content-range"
  );
  // Prevent the browser from caching partially-streamed responses in dev.
  res.setHeader("cache-control", "no-store");
}

async function handleMediaProxyRequest(
  req: {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    on: (event: "close", listener: () => void) => void;
  },
  res: {
    statusCode: number;
    headersSent: boolean;
    writableEnded: boolean;
    setHeader: (name: string, value: string) => void;
    end: (chunk?: string) => void;
    write: (chunk: Buffer) => boolean;
    once: (event: "drain", listener: () => void) => void;
  }
): Promise<void> {
  const target = getProxyTarget(req.url);
  if (!target) {
    res.statusCode = 400;
    res.end("Missing `url` query param");
    return;
  }

  if (!isAllowedProxyMethod(req.method)) {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  const upstream = await fetch(target, {
    headers: {
      accept:
        typeof req.headers.accept === "string" ? req.headers.accept : "*/*",
    },
    signal: abortController.signal,
  });

  setProxyHeaders(upstream, res);

  if ((req.method ?? "GET") === "HEAD") {
    res.end();
    return;
  }

  // Buffer whole response to guarantee completion (dev-only endpoint).
  const body = await upstream.arrayBuffer();
  if (!res.writableEnded) {
    res.end(Buffer.from(body));
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({}),
    react(),
    {
      name: "media-proxy",
      configureServer(server) {
        server.middlewares.use("/__media_proxy", (req, res) => {
          handleMediaProxyRequest(req, res).catch((error) => {
            server.config.logger.error(
              `media-proxy error: ${error instanceof Error ? error.message : String(error)}`
            );
            if (!res.headersSent) {
              res.statusCode = 502;
              res.setHeader("content-type", "text/plain; charset=utf-8");
            }
            if (!res.writableEnded) {
              res.end("Media proxy error");
            }
          });
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
