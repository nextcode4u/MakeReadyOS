import { z } from "zod";

export const turnMaterialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  quantity: z.number().finite().positive().max(100000),
  unit: z.string().trim().min(1).max(24),
  status: z.enum(["NEEDED", "NEED_TO_ORDER", "ORDERED", "ON_HAND", "USED", "CANCELLED"]),
  notes: z.string().trim().max(1000).default(""),
}).strict();
export const turnMaterialsSchema = z.array(turnMaterialSchema).max(100).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Duplicate material rows");

export function newlyRequestedMaterials(previous: z.infer<typeof turnMaterialsSchema>, next: z.infer<typeof turnMaterialsSchema>) {
  const oldStatus = new Map(previous.map(row => [row.id, row.status]));
  return next.filter(row => row.status === "NEED_TO_ORDER" && oldStatus.get(row.id) !== "NEED_TO_ORDER");
}
