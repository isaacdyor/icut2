import {
  createInsertSchema as baseCreateInsertSchema,
  createUpdateSchema as baseCreateUpdateSchema,
} from "drizzle-zod";
import type { z } from "zod";

// biome-ignore lint/performance/noBarrelFile: <consistency>
export { createSelectSchema } from "drizzle-zod";

type ServerOmitKeys = "id" | "userId" | "createdAt" | "updatedAt";
type OmitMask<T> = { [K in keyof T]?: true };

const omitServerFields = <T extends z.ZodRawShape>(
  zodSchema: z.ZodObject<T>
): z.ZodObject<Omit<T, ServerOmitKeys>> => {
  const shape = zodSchema.shape;
  const keysToOmit = (["id", "userId", "createdAt", "updatedAt"] as const)
    .filter((key) => key in shape)
    .reduce<Record<string, true>>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
  return zodSchema.omit(keysToOmit as OmitMask<T>) as z.ZodObject<
    Omit<T, ServerOmitKeys>
  >;
};

export const createInsertSchema: (
  ...args: Parameters<typeof baseCreateInsertSchema>
) => z.ZodObject<Omit<z.ZodRawShape, ServerOmitKeys>> = (...args) =>
  omitServerFields(baseCreateInsertSchema(...args));

export const createUpdateSchema: (
  ...args: Parameters<typeof baseCreateUpdateSchema>
) => z.ZodObject<Omit<z.ZodRawShape, ServerOmitKeys>> = (...args) =>
  omitServerFields(baseCreateUpdateSchema(...args));
