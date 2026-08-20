import { db, withOrgContext } from "@db/index";
import {
  insights,
  organisations,
  transactions,
  type Insight,
  type InsightCategory,
} from "@db/schema";
import { and, count, desc, eq, gte, isNotNull } from "drizzle-orm";
import { INSIGHT_CATEGORY_LABELS } from "@/lib/insights";
import {
  createBrainUnitOfWork,
  isBrainConfigured,
  runWorkflowAsync,
} from "@/server/brain/client";
import { ensureBrainEntityForOrganisation } from "@/server/brain/entities";

const INSIGHT_WORKFLOW_CODE = "WF-FINANCE-INSIGHT";
const DAILY_INSIGHT_WORKFLOW_CODE = "WF-FINANCE-DAILY";
const INSIGHT_UNIT_OF_WORK_TYPE = "insight";

export async function listInsights(organisationId: string): Promise<Insight[]> {
  return withOrgContext(organisationId, tx =>
    tx
      .select()
      .from(insights)
      .where(eq(insights.organisationId, organisationId))
      .orderBy(desc(insights.createdAt))
  );
}

export async function organisationHasTransactions(
  organisationId: string
): Promise<boolean> {
  return withOrgContext(organisationId, async tx => {
    const [row] = await tx
      .select({ value: count() })
      .from(transactions)
      .where(eq(transactions.organisationId, organisationId));

    return (row?.value ?? 0) > 0;
  });
}

export async function queueInsights(
  organisationId: string,
  categories: InsightCategory[]
): Promise<Insight[]> {
  if (!isBrainConfigured()) {
    throw new Error("Brain is not configured. Set BRAIN_URL and BRAIN_API_KEY.");
  }

  const entityId = await ensureBrainEntityForOrganisation(organisationId);
  if (!entityId) {
    throw new Error("Brain is not configured. Set BRAIN_URL and BRAIN_API_KEY.");
  }

  const created: Insight[] = [];

  for (const category of categories) {
    const row = await withOrgContext(organisationId, async tx => {
      const [inserted] = await tx
        .insert(insights)
        .values({
          organisationId,
          category,
          status: "analysing",
          title: "",
          tips: [],
        })
        .returning();
      return inserted;
    });

    if (!row) {
      throw new Error("Insight was not saved.");
    }

    try {
      let unitOfWorkId: string | undefined;
      try {
        const unitOfWork = await createBrainUnitOfWork({
          entityId,
          unitOfWorkTypeCode: INSIGHT_UNIT_OF_WORK_TYPE,
          title: `${INSIGHT_CATEGORY_LABELS[category]} insight`,
          variables: [{ key: "insightId", value: row.id }],
        });
        unitOfWorkId = unitOfWork.id;
      } catch (unitOfWorkError) {
        console.error(
          "Insight unit of work was not created; queueing the run without it:",
          unitOfWorkError
        );
      }

      const run = await runWorkflowAsync(INSIGHT_WORKFLOW_CODE, {
        entityId,
        unitOfWorkId,
        inputMessage: `Analyse the organisation's transactions and produce a ${INSIGHT_CATEGORY_LABELS[category]} insight.`,
        variables: {
          insightId: row.id,
          category,
        },
      });

      const updated = await withOrgContext(organisationId, async tx => {
        const [saved] = await tx
          .update(insights)
          .set({
            brainUnitOfWorkId: unitOfWorkId ?? null,
            brainRunId: run.runId,
            updatedAt: new Date(),
          })
          .where(eq(insights.id, row.id))
          .returning();
        return saved;
      });

      created.push(updated ?? row);
    } catch (error) {
      console.error("Failed to start insight analysis:", error);
      const detail =
        error instanceof Error && error.message
          ? error.message
          : "Could not analyse this category.";
      const failed = await withOrgContext(organisationId, async tx => {
        const [saved] = await tx
          .update(insights)
          .set({
            status: "failed",
            title: detail,
            updatedAt: new Date(),
          })
          .where(eq(insights.id, row.id))
          .returning();
        return saved;
      });

      created.push(
        failed ?? {
          ...row,
          status: "failed",
          title: detail,
        }
      );
    }
  }

  const analysingCount = created.filter(
    insight => insight.status === "analysing"
  ).length;
  if (analysingCount === 0) {
    const firstFailure = created.find(insight => insight.title)?.title;
    throw new Error(
      firstFailure ||
        "Could not start Brain analysis. Deploy the local brain schema so WF-FINANCE-INSIGHT exists."
    );
  }

  return created;
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ("code" in current && (current as { code: unknown }).code === "23505") {
      return true;
    }
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}

export async function createReadyInsight(
  organisationId: string,
  input: { category: InsightCategory; title: string; tips: string[] }
): Promise<{ insight: Insight; alreadyRecorded: boolean }> {
  const hasTransactions = await organisationHasTransactions(organisationId);
  if (!hasTransactions) {
    throw new Error("Add transactions before creating an insight.");
  }

  const title = input.title.trim();
  const tips = input.tips.map(tip => tip.trim()).filter(tip => tip.length > 0);

  if (!title) {
    throw new Error("title is required.");
  }
  if (tips.length === 0) {
    throw new Error("tips must include at least one sentence.");
  }

  return withOrgContext(organisationId, async tx => {
    const [existing] = await tx
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.organisationId, organisationId),
          eq(insights.category, input.category),
          eq(insights.status, "ready"),
          gte(insights.createdAt, startOfUtcDay())
        )
      )
      .limit(1);

    if (existing) {
      return { insight: existing, alreadyRecorded: true };
    }

    try {
      const [inserted] = await tx
        .insert(insights)
        .values({
          organisationId,
          category: input.category,
          status: "ready",
          title,
          tips,
        })
        .returning();

      if (!inserted) {
        throw new Error("Insight was not saved.");
      }

      return { insight: inserted, alreadyRecorded: false };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const [duplicate] = await tx
        .select()
        .from(insights)
        .where(
          and(
            eq(insights.organisationId, organisationId),
            eq(insights.category, input.category),
            eq(insights.status, "ready"),
            gte(insights.createdAt, startOfUtcDay())
          )
        )
        .limit(1);

      if (!duplicate) {
        throw error;
      }

      return { insight: duplicate, alreadyRecorded: true };
    }
  });
}

export async function startDailyInsightRuns(): Promise<{
  started: number;
  skipped: number;
  failed: number;
}> {
  if (!isBrainConfigured()) {
    throw new Error("Brain is not configured. Set BRAIN_URL and BRAIN_API_KEY.");
  }

  const orgs = await db
    .select({
      id: organisations.id,
      brainEntityId: organisations.brainEntityId,
    })
    .from(organisations)
    .where(isNotNull(organisations.brainEntityId));

  let started = 0;
  let skipped = 0;
  let failed = 0;

  for (const org of orgs) {
    if (!org.brainEntityId) {
      skipped += 1;
      continue;
    }

    const hasTransactions = await organisationHasTransactions(org.id);
    if (!hasTransactions) {
      skipped += 1;
      continue;
    }

    try {
      await runWorkflowAsync(DAILY_INSIGHT_WORKFLOW_CODE, {
        entityId: org.brainEntityId,
        inputMessage:
          "Create today's personal-finance insight cards from the organisation's transactions.",
      });
      started += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `Failed to start daily insights for organisation ${org.id}:`,
        error
      );
    }
  }

  return { started, skipped, failed };
}

export async function completeInsight(
  organisationId: string,
  insightId: string,
  input: { title: string; tips: string[] }
): Promise<Insight> {
  const title = input.title.trim();
  const tips = input.tips.map(tip => tip.trim()).filter(tip => tip.length > 0);

  if (!title) {
    throw new Error("title is required.");
  }
  if (tips.length === 0) {
    throw new Error("tips must include at least one sentence.");
  }

  return withOrgContext(organisationId, async tx => {
    const [updated] = await tx
      .update(insights)
      .set({
        status: "ready",
        title,
        tips,
        updatedAt: new Date(),
      })
      .where(
        and(eq(insights.id, insightId), eq(insights.organisationId, organisationId))
      )
      .returning();

    if (!updated) {
      throw new Error("Insight not found.");
    }

    return updated;
  });
}

export async function dismissInsight(
  organisationId: string,
  insightId: string
): Promise<boolean> {
  return withOrgContext(organisationId, async tx => {
    const deleted = await tx
      .delete(insights)
      .where(
        and(eq(insights.id, insightId), eq(insights.organisationId, organisationId))
      )
      .returning({ id: insights.id });

    return deleted.length > 0;
  });
}
