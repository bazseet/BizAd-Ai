ALTER TABLE "users" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credits_remaining" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credits_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credits_reset_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id");