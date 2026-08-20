ALTER TYPE "public"."insight_categories" ADD VALUE IF NOT EXISTS 'spending_trends';--> statement-breakpoint
ALTER TYPE "public"."insight_categories" ADD VALUE IF NOT EXISTS 'budget_alerts';--> statement-breakpoint
ALTER TYPE "public"."insight_categories" ADD VALUE IF NOT EXISTS 'anomalies';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_insights_org_category_ready_day" ON "insights" USING btree ("organisation_id","category",(("created_at" AT TIME ZONE 'UTC')::date)) WHERE "insights"."status" = 'ready';
