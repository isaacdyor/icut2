import { env } from "cloudflare:workers";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { schema } from "./schema/app";

const sql = neon(env.DATABASE_URL || "");
export const db = drizzle(sql, { schema });
