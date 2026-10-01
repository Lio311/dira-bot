CREATE TABLE "tracked_cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"he" text NOT NULL,
	"priority" integer NOT NULL,
	"yad2_code" text NOT NULL,
	"onmap" text NOT NULL,
	"homeless" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_cities_key_idx" ON "tracked_cities" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_cities_yad2_code_idx" ON "tracked_cities" USING btree ("yad2_code");