DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'insight_categories'
      AND e.enumlabel = 'spending_trends'
  ) THEN
    ALTER TYPE "public"."insight_categories" RENAME TO "insight_categories_old";
    CREATE TYPE "public"."insight_categories" AS ENUM (
      'budgeting_spending',
      'saving_emergency',
      'debt_credit',
      'investing_growth',
      'spending_trends',
      'budget_alerts',
      'anomalies'
    );
    ALTER TABLE "insights"
      ALTER COLUMN "category" TYPE "public"."insight_categories"
      USING "category"::text::"public"."insight_categories";
    DROP TYPE "public"."insight_categories_old";
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_insights_org_category_ready_day" ON "insights" USING btree ("organisation_id","category",(("created_at" AT TIME ZONE 'UTC')::date)) WHERE "insights"."status" = 'ready';
