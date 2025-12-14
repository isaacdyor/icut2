// Re-export drizzle query helpers from the same drizzle-orm instance as our schema.
// Import these from `@t-example/db/drizzle` in downstream packages to avoid
// accidentally pulling a second drizzle-orm copy (which breaks TS types).
// biome-ignore lint/performance/noBarrelFile: <consistency>
export { and, eq, inArray, sql } from "drizzle-orm";
