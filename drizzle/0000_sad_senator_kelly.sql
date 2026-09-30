CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"city" text NOT NULL,
	"priority" integer NOT NULL,
	"neighborhood" text,
	"street" text,
	"property_type" text,
	"rooms" real,
	"sqm" integer,
	"floor" integer,
	"price" integer,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fingerprint" text,
	"duplicate_of" integer,
	"is_agency" boolean,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_external_idx" ON "listings" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "listings_fingerprint_idx" ON "listings" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "listings_first_seen_idx" ON "listings" USING btree ("first_seen_at");