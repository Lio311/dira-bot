CREATE TABLE "subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"min_priority" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirm_sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_email_idx" ON "subscribers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_token_idx" ON "subscribers" USING btree ("token");