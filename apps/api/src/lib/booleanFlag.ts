import { z } from "zod";

// Boolean coercion treats every nonempty query string, including "false", as true.
export const booleanFlag = z.union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");
