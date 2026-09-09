-- Unit-linked requests do not need a separate common-area description.
ALTER TABLE "PestIssue" ALTER COLUMN "area" DROP NOT NULL;
