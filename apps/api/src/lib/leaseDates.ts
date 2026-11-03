import { z } from "zod";

export const leaseDateSchema = z.string().date().transform(value => new Date(`${value}T00:00:00.000Z`));
export const importedLeaseDateSchema = z.preprocess(
  value => value === null || (typeof value === "string" && !value.trim()) ? undefined : value,
  leaseDateSchema.optional(),
);

type LeaseDates = { currentResidentLeaseStartDate?: Date | null; currentResidentLeaseEndDate?: Date | null };
export function leaseDatesOrdered(value: LeaseDates) {
  return !value.currentResidentLeaseStartDate || !value.currentResidentLeaseEndDate
    || value.currentResidentLeaseStartDate <= value.currentResidentLeaseEndDate;
}
export const leaseOrderError = { message: "Lease end date must be on or after lease start date", path: ["currentResidentLeaseEndDate"] };

export function validateMergedLeaseDates(current: LeaseDates, patch: LeaseDates) {
  const merged = {
    currentResidentLeaseStartDate: patch.currentResidentLeaseStartDate === undefined ? current.currentResidentLeaseStartDate : patch.currentResidentLeaseStartDate,
    currentResidentLeaseEndDate: patch.currentResidentLeaseEndDate === undefined ? current.currentResidentLeaseEndDate : patch.currentResidentLeaseEndDate,
  };
  if (!leaseDatesOrdered(merged)) throw Object.assign(new Error(leaseOrderError.message), { statusCode: 400 });
}
