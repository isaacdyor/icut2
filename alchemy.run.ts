import alchemy from "alchemy";
import { R2Bucket, Vite, Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "./apps/web/.env" });
config({ path: "./apps/server/.env" });

const app = await alchemy("t-example");

export const assetsBucket = await R2Bucket("assets", {
  devDomain: true,
  cors: [
    {
      allowed: {
        origins: ["*"],
        methods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
        headers: ["content-type"],
      },
      maxAgeSeconds: 3600,
    },
  ],
});

export const web = await Vite("web", {
  cwd: "apps/web",
  assets: "dist",
  bindings: {
    VITE_SERVER_URL: process.env.VITE_SERVER_URL || "",
  },
  dev: {
    command: "bun run dev",
  },
});

export const server = await Worker("server", {
  cwd: "apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  bindings: {
    DATABASE_URL: alchemy.secret(process.env.DATABASE_URL),
    CORS_ORIGIN: process.env.CORS_ORIGIN || "",
    BETTER_AUTH_SECRET: alchemy.secret(process.env.BETTER_AUTH_SECRET),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "",
    ASSETS_BUCKET: assetsBucket,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || "",
    R2_ACCESS_KEY_ID: alchemy.secret(process.env.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: alchemy.secret(process.env.R2_SECRET_ACCESS_KEY),
    R2_PUBLIC_URL: assetsBucket.devDomain || "",
  },
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
