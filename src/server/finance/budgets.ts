import { withOrgContext } from "@db/index";
import { Budget, BudgetPeriod, budgets, transactions } from "@db/schema";
import {
  DEFAULT_CURRENCY,
  normaliseMoneyAmount,
  type BudgetProgress,
} from "@/lib/finance";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export type { BudgetProgress };

export interface UpsertBudgetInput {
  category: string;
  period: BudgetPeriod;
  amount: string | number;
  currency?: string;
  startsOn: string;
  endsOn?: string | null;
  notes?: string | null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addUtcDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addUtcMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function nextPeriodStart(start: string, period: BudgetPeriod): string {
  switch (period) {
    case "weekly":
      return addUtcDays(start, 7);
    case "fortnightly":
      return addUtcDays(start, 14);
    case "monthly":
      return addUtcMonths(start, 1);
    case "quarterly":
      return addUtcMonths(start, 3);
    case "yearly":
      return addUtcMonths(start, 12);
    default: {
      const exhaustive: never = period;
      return exhaustive;
    }
  }
}

export function currentPeriodWindow(
  startsOn: string,
  period: BudgetPeriod,
  today = todayIsoDate(),
  endsOn?: string | null
): { start: string; end: string } {
  let start = startsOn;
  let next = nextPeriodStart(start, period);
  let guard = 0;

  while (today >= next && guard < 600) {
    start = next;
    next = nextPeriodStart(start, period);
    guard += 1;
    if (endsOn && start > endsOn) {
      break;
    }
  }

  const inclusiveEnd = addUtcDays(next, -1);
  const cappedEnd = endsOn && endsOn < inclusiveEnd ? endsOn : inclusiveEnd;
  return { start, end: cappedEnd };
}

export async function listBudgets(organisationId: string): Promise<Budget[]> {
  return withOrgContext(organisationId, tx =>
    tx
      .select()
      .from(budgets)
      .where(eq(budgets.organisationId, organisationId))
      .orderBy(budgets.category, budgets.startsOn)
  );
}

export async function upsertBudget(
  organisationId: string,
  input: UpsertBudgetInput
): Promise<Budget> {
  const category = input.category.trim();
  if (!category) {
    throw new Error("category is required.");
  }
  if (!isIsoDate(input.startsOn)) {
    throw new Error(`startsOn must be YYYY-MM-DD (got "${input.startsOn}").`);
  }
  if (input.endsOn && !isIsoDate(input.endsOn)) {
    throw new Error(`endsOn must be YYYY-MM-DD (got "${input.endsOn}").`);
  }

  const values = {
    organisationId,
    category,
    period: input.period,
    amount: normaliseMoneyAmount(input.amount),
    currency: input.currency?.trim() || DEFAULT_CURRENCY,
    startsOn: input.startsOn,
    endsOn: input.endsOn ? input.endsOn : null,
    notes: input.notes?.trim() || null,
    updatedAt: new Date(),
  };

  return withOrgContext(organisationId, async tx => {
    const [row] = await tx
      .insert(budgets)
      .values(values)
      .onConflictDoUpdate({
        target: [
          budgets.organisationId,
          budgets.category,
          budgets.period,
          budgets.startsOn,
        ],
        set: {
          amount: values.amount,
          currency: values.currency,
          endsOn: values.endsOn,
          notes: values.notes,
          updatedAt: values.updatedAt,
        },
      })
      .returning();

    if (!row) {
      throw new Error("Budget was not saved.");
    }

    return row;
  });
}

export async function updateBudget(
  organisationId: string,
  budgetId: string,
  input: Partial<UpsertBudgetInput>
): Promise<Budget | null> {
  return withOrgContext(organisationId, async tx => {
    const [existing] = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.organisationId, organisationId)))
      .limit(1);

    if (!existing) {
      return null;
    }

    const startsOn = input.startsOn ?? existing.startsOn;
    const endsOn =
      input.endsOn !== undefined ? input.endsOn : existing.endsOn;
    if (!isIsoDate(startsOn)) {
      throw new Error(`startsOn must be YYYY-MM-DD (got "${startsOn}").`);
    }
    if (endsOn && !isIsoDate(endsOn)) {
      throw new Error(`endsOn must be YYYY-MM-DD (got "${endsOn}").`);
    }

    const [updated] = await tx
      .update(budgets)
      .set({
        category: input.category?.trim() || existing.category,
        period: input.period ?? existing.period,
        amount:
          input.amount !== undefined
            ? normaliseMoneyAmount(input.amount)
            : existing.amount,
        currency: input.currency?.trim() || existing.currency,
        startsOn,
        endsOn: endsOn ?? null,
        notes:
          input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(budgets.id, budgetId), eq(budgets.organisationId, organisationId)))
      .returning();

    return updated ?? null;
  });
}

export async function deleteBudget(
  organisationId: string,
  budgetId: string
): Promise<boolean> {
  return withOrgContext(organisationId, async tx => {
    const deleted = await tx
      .delete(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.organisationId, organisationId)))
      .returning({ id: budgets.id });

    return deleted.length > 0;
  });
}

export async function getBudgetProgress(
  organisationId: string
): Promise<BudgetProgress[]> {
  return withOrgContext(organisationId, async tx => {
    const orgBudgets = await tx
      .select()
      .from(budgets)
      .where(eq(budgets.organisationId, organisationId))
      .orderBy(budgets.category, budgets.startsOn);
    const today = todayIsoDate();

    const progress: BudgetProgress[] = [];

    for (const budget of orgBudgets) {
      const window = currentPeriodWindow(
        budget.startsOn,
        budget.period,
        today,
        budget.endsOn
      );

      const [spend] = await tx
        .select({
          spent: sql<string>`coalesce(sum(case when ${transactions.amount}::numeric < 0 then -${transactions.amount}::numeric else 0 end), 0)::text`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.organisationId, organisationId),
            eq(transactions.category, budget.category),
            gte(transactions.occurredAt, window.start),
            lte(transactions.occurredAt, window.end)
          )
        );

      const spent = spend?.spent ?? "0.00";
      const budgetAmount = Number.parseFloat(budget.amount);
      const spentAmount = Number.parseFloat(spent);
      const remaining = (budgetAmount - spentAmount).toFixed(2);
      const percentUsed =
        budgetAmount > 0 ? Math.round((spentAmount / budgetAmount) * 100) : 0;

      progress.push({
        ...budget,
        periodStart: window.start,
        periodEnd: window.end,
        spent,
        remaining,
        percentUsed,
      });
    }

    return progress;
  });
}
