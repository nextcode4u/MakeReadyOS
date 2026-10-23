import { z } from "zod";

// PATCH omission must not invoke create-time defaults (Zod 4 partial() does).
export function patchSchema<T extends Record<string, z.ZodType>, C extends z.core.$ZodObjectConfig>(schema: z.ZodObject<T, C>) {
  const shape = Object.fromEntries(Object.entries(schema.shape).map(([key, field]) => [
    key, field.nonoptional().optional(),
  ])) as { [K in keyof T]: z.ZodOptional<z.ZodNonOptional<T[K]>> };
  return schema.extend(shape);
}
