DO $$ BEGIN
 CREATE TYPE "public"."budget_periods" AS ENUM('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."chat_message_roles" AS ENUM('user', 'assistant');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."insight_categories" AS ENUM('budgeting_spending', 'saving_emergency', 'debt_credit', 'investing_growth');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."insight_statuses" AS ENUM('analysing', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."transaction_sources" AS ENUM('chat_import', 'manual', 'api');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"category" text NOT NULL,
	"period" "budget_periods" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'NZD' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_org_category_period_start_unique" UNIQUE("organisation_id","category","period","starts_on")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "chat_message_roles" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"category" "insight_categories" NOT NULL,
	"status" "insight_statuses" DEFAULT 'analysing' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"tips" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brain_unit_of_work_id" text,
	"brain_run_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"occurred_at" date NOT NULL,
	"description" text NOT NULL,
	"merchant" text,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'NZD' NOT NULL,
	"category" text,
	"account" text,
	"source" "transaction_sources" DEFAULT 'manual' NOT NULL,
	"notes" text,
	"dedupe_key" text NOT NULL,
	"import_batch_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_org_dedupe_unique" UNIQUE("organisation_id","dedupe_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_created_by_user_id_profiles_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "insights" ADD CONSTRAINT "insights_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_user_id_profiles_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "insights_org_status_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_insights_org_status" ON "insights" USING btree ("organisation_id","status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budgets" ADD CONSTRAINT "budgets_org_category_period_start_unique" UNIQUE("organisation_id","category","period","starts_on");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_org_dedupe_unique" UNIQUE("organisation_id","dedupe_key");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budgets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "budgets_select" ON "budgets";--> statement-breakpoint
CREATE POLICY "budgets_select" ON "budgets" FOR SELECT USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "budgets_insert" ON "budgets";--> statement-breakpoint
CREATE POLICY "budgets_insert" ON "budgets" FOR INSERT WITH CHECK (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "budgets_update" ON "budgets";--> statement-breakpoint
CREATE POLICY "budgets_update" ON "budgets" FOR UPDATE USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "budgets_delete" ON "budgets";--> statement-breakpoint
CREATE POLICY "budgets_delete" ON "budgets" FOR DELETE USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "transactions_select" ON "transactions";--> statement-breakpoint
CREATE POLICY "transactions_select" ON "transactions" FOR SELECT USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "transactions_insert" ON "transactions";--> statement-breakpoint
CREATE POLICY "transactions_insert" ON "transactions" FOR INSERT WITH CHECK (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "transactions_update" ON "transactions";--> statement-breakpoint
CREATE POLICY "transactions_update" ON "transactions" FOR UPDATE USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "transactions_delete" ON "transactions";--> statement-breakpoint
CREATE POLICY "transactions_delete" ON "transactions" FOR DELETE USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "chat_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "chat_sessions_select" ON "chat_sessions";--> statement-breakpoint
CREATE POLICY "chat_sessions_select" ON "chat_sessions" FOR SELECT USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "chat_sessions_insert" ON "chat_sessions";--> statement-breakpoint
CREATE POLICY "chat_sessions_insert" ON "chat_sessions" FOR INSERT WITH CHECK (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "chat_sessions_update" ON "chat_sessions";--> statement-breakpoint
CREATE POLICY "chat_sessions_update" ON "chat_sessions" FOR UPDATE USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "chat_sessions_delete" ON "chat_sessions";--> statement-breakpoint
CREATE POLICY "chat_sessions_delete" ON "chat_sessions" FOR DELETE USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "insights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "insights" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "insights_select" ON "insights";--> statement-breakpoint
CREATE POLICY "insights_select" ON "insights" FOR SELECT USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "insights_insert" ON "insights";--> statement-breakpoint
CREATE POLICY "insights_insert" ON "insights" FOR INSERT WITH CHECK (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "insights_update" ON "insights";--> statement-breakpoint
CREATE POLICY "insights_update" ON "insights" FOR UPDATE USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS "insights_delete" ON "insights";--> statement-breakpoint
CREATE POLICY "insights_delete" ON "insights" FOR DELETE USING (organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "chat_messages_select" ON "chat_messages";--> statement-breakpoint
CREATE POLICY "chat_messages_select" ON "chat_messages" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "chat_sessions"
    WHERE "chat_sessions".id = "chat_messages".session_id
    AND "chat_sessions".organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid
  )
);--> statement-breakpoint
DROP POLICY IF EXISTS "chat_messages_insert" ON "chat_messages";--> statement-breakpoint
CREATE POLICY "chat_messages_insert" ON "chat_messages" FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM "chat_sessions"
    WHERE "chat_sessions".id = "chat_messages".session_id
    AND "chat_sessions".organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid
  )
);--> statement-breakpoint
DROP POLICY IF EXISTS "chat_messages_update" ON "chat_messages";--> statement-breakpoint
CREATE POLICY "chat_messages_update" ON "chat_messages" FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM "chat_sessions"
    WHERE "chat_sessions".id = "chat_messages".session_id
    AND "chat_sessions".organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid
  )
);--> statement-breakpoint
DROP POLICY IF EXISTS "chat_messages_delete" ON "chat_messages";--> statement-breakpoint
CREATE POLICY "chat_messages_delete" ON "chat_messages" FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM "chat_sessions"
    WHERE "chat_sessions".id = "chat_messages".session_id
    AND "chat_sessions".organisation_id = NULLIF(current_setting('app.org_id', true), '')::uuid
  )
);
