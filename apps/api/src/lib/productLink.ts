import { z } from "zod";

// Stored for users to open, never fetched by the server.
export const productLinkSchema = z.string().trim().max(2000).url().refine(value => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, "Use an HTTP or HTTPS product link without credentials");
