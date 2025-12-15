import {
  createInsertSchema as baseCreateInsertSchema,
  createUpdateSchema as baseCreateUpdateSchema,
} from "drizzle-zod";
import type { z } from "zod";

// biome-ignore lint/performance/noBarrelFile: <consistency>
export { createSelectSchema } from "drizzle-zod";

type ServerOmitKeys = "id" | "userId" | "createdAt" | "updatedAt";

export const createInsertSchema = <
  T extends Parameters<typeof baseCreateInsertSchema>[0],
>(
  table: T
) => {
  const schema = baseCreateInsertSchema(table);
  type Shape = (typeof schema)["shape"];
  type OmittedShape = Omit<Shape, ServerOmitKeys>;
  const shape = schema.shape;
  const keysToOmit = (["id", "userId", "createdAt", "updatedAt"] as const)
    .filter((key) => key in shape)
    .reduce<Record<string, true>>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
  return schema.omit(
    keysToOmit as { [K in keyof Shape]?: true }
  ) as z.ZodObject<OmittedShape>;
};

export const createUpdateSchema = <
  T extends Parameters<typeof baseCreateUpdateSchema>[0],
>(
  table: T
) => {
  const schema = baseCreateUpdateSchema(table);
  type Shape = (typeof schema)["shape"];
  type OmittedShape = Omit<Shape, ServerOmitKeys>;
  const shape = schema.shape;
  const keysToOmit = (["id", "userId", "createdAt", "updatedAt"] as const)
    .filter((key) => key in shape)
    .reduce<Record<string, true>>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
  return schema.omit(
    keysToOmit as { [K in keyof Shape]?: true }
  ) as z.ZodObject<OmittedShape>;
};
