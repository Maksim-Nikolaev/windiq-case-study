ALTER TABLE "yield_results" ADD COLUMN "measured_gross_mwh" double precision;--> statement-breakpoint
UPDATE "yield_results" SET "measured_gross_mwh" = "gross_mwh";--> statement-breakpoint
ALTER TABLE "yield_results" ALTER COLUMN "measured_gross_mwh" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "yield_results" ADD COLUMN "interpolated_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "yield_results" ALTER COLUMN "interpolated_hours" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "yield_results" ADD COLUMN "month_mean_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "yield_results" ALTER COLUMN "month_mean_hours" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "yield_results" DROP COLUMN "gross_at_full_coverage_mwh";
