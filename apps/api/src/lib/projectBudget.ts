import { z } from "zod";

const money = z.number().int().min(0).max(1000000000);
export const projectQuoteInput = z.object({
  expectedVersion: z.number().int().min(0),
  scope: z.string().trim().min(1).max(180),
  companyName: z.string().trim().min(1).max(180),
  reference: z.string().trim().max(120).nullable().default(null),
  amountCents: money.nullable().default(null),
  status: z.enum(["Requested", "Received", "Included", "Declined", "Superseded"]).default("Received"),
  dueDate: z.coerce.date().nullable().default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
});
export const projectCostInput = z.object({
  expectedVersion: z.number().int().min(0),
  description: z.string().trim().min(1).max(180),
  category: z.enum(["Labor", "Materials", "Equipment", "Other"]),
  quantity: z.number().finite().positive().max(100000),
  unitCostCents: money,
  actualCostCents: money.nullable().default(null),
  isArchived: z.boolean().default(false),
}).refine(value => value.quantity * value.unitCostCents <= 1000000000, "Line estimate must not exceed $10,000,000");

export function projectBudgetSummary(quotes: Array<{ status: string; amountCents: number | null }>, lines: Array<{ isArchived: boolean; quantity: number; unitCostCents: number; actualCostCents: number | null }>) {
  const included = quotes.filter(quote => quote.status === "Included");
  const active = lines.filter(line => !line.isArchived);
  const vendorEstimateCents = included.reduce((total, quote) => total + (quote.amountCents ?? 0), 0);
  const inHouseEstimateCents = active.reduce((total, line) => total + Math.round(line.quantity * line.unitCostCents), 0);
  return { vendorEstimateCents, inHouseEstimateCents, plannedCents: vendorEstimateCents + inHouseEstimateCents,
    unknownIncludedQuotes: included.filter(quote => quote.amountCents === null).length,
    recordedInHouseActualCents: active.reduce((total, line) => total + (line.actualCostCents ?? 0), 0),
    unrecordedActualLines: active.filter(line => line.actualCostCents === null).length };
}
