import { z } from "zod";

export function schemaToOpenApi(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io: "input",
    unrepresentable: "any",
    override: ({ zodSchema, jsonSchema }) => {
      // Dates arrive as ISO strings over HTTP, not JavaScript Date objects.
      if (zodSchema instanceof z.ZodDate) {
        jsonSchema.type = "string";
        jsonSchema.format = "date-time";
      }
    },
  });
}
