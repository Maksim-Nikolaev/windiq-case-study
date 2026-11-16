CREATE TYPE "public"."ingest_run_kind" AS ENUM('backfill', 'poll', 'reconcile', 'master_data');--> statement-breakpoint
CREATE TYPE "public"."ingest_run_outcome" AS ENUM('ok', 'failed');--> statement-breakpoint
CREATE TYPE "public"."master_data_kind" AS ENUM('mast', 'turbine', 'site');--> statement-breakpoint
CREATE TYPE "public"."measurement_status" AS ENUM('valid', 'missing', 'invalid');--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingest_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "ingest_run_kind" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"outcome" "ingest_run_outcome" NOT NULL,
	"error_message" text,
	"rows_received" integer NOT NULL,
	"rows_new" integer NOT NULL,
	"rows_corrected" integer NOT NULL,
	"rows_rejected" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"feed_position" timestamp with time zone,
	"last_poll_success_at" timestamp with time zone,
	"last_reconcile_at" timestamp with time zone,
	"last_master_data_sync_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "master_data_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "master_data_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "master_data_kind" NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"accepted" boolean NOT NULL,
	"reject_reason" text,
	"upstream_version" integer,
	"upstream_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_revisions" (
	"measured_at" timestamp with time zone NOT NULL,
	"version" integer NOT NULL,
	"upstream_updated_at" timestamp with time zone NOT NULL,
	"raw_value" text,
	"raw_unit" text NOT NULL,
	"wind_speed_ms" double precision,
	"status" "measurement_status" NOT NULL,
	"reject_reason" text,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "measurement_revisions_measured_at_version_upstream_updated_at_pk" PRIMARY KEY("measured_at","version","upstream_updated_at")
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"measured_at" timestamp with time zone PRIMARY KEY NOT NULL,
	"raw_value" text,
	"raw_unit" text NOT NULL,
	"wind_speed_ms" double precision,
	"wind_direction_deg" integer,
	"status" "measurement_status" NOT NULL,
	"reject_reason" text,
	"version" integer NOT NULL,
	"upstream_updated_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rejected_rows" (
	"payload_hash" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yield_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "yield_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"computed_at" timestamp with time zone NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"expected_hours" integer NOT NULL,
	"valid_hours" integer NOT NULL,
	"gross_mwh" double precision NOT NULL,
	"net_mwh" double precision NOT NULL,
	"p50_mwh" double precision NOT NULL,
	"p90_mwh" double precision NOT NULL,
	"gross_at_full_coverage_mwh" double precision NOT NULL,
	"loss_factor" double precision NOT NULL,
	"mean_hub_wind_speed_ms" double precision NOT NULL,
	"capacity_factor" double precision NOT NULL,
	"full_load_hours" double precision NOT NULL,
	"mast_version_id" integer NOT NULL,
	"turbine_version_id" integer NOT NULL,
	"site_version_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "yield_results" ADD CONSTRAINT "yield_results_mast_version_id_master_data_versions_id_fk" FOREIGN KEY ("mast_version_id") REFERENCES "public"."master_data_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_results" ADD CONSTRAINT "yield_results_turbine_version_id_master_data_versions_id_fk" FOREIGN KEY ("turbine_version_id") REFERENCES "public"."master_data_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_results" ADD CONSTRAINT "yield_results_site_version_id_master_data_versions_id_fk" FOREIGN KEY ("site_version_id") REFERENCES "public"."master_data_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_runs_started_at_idx" ON "ingest_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "master_data_versions_kind_idx" ON "master_data_versions" USING btree ("kind","id");--> statement-breakpoint
CREATE INDEX "measurements_status_idx" ON "measurements" USING btree ("status","measured_at");--> statement-breakpoint
CREATE INDEX "yield_results_computed_at_idx" ON "yield_results" USING btree ("computed_at");