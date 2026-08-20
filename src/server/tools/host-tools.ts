/**
 * Host-app tools invoked by Telos Brain via the Tool API webhooks.
 *
 * These are plain functions (not Vercel AI SDK tools). The brain schema
 * should point each tool's `api.path` at `/api/tools/{toolId}` and bind
 * `organisationId` from the entity variable.
 */
import { db } from "@db/index";
import { BudgetPeriod, profiles, memberships } from "@db/schema";
import { eq } from "drizzle-orm";
import { isBudgetPeriod } from "@/lib/finance";
import { isInsightCategory } from "@/lib/insights";
import {
  getBudgetProgress,
  listBudgets as listBudgetsForOrganisation,
  upsertBudget as upsertBudgetForOrganisation,
} from "@/server/finance/budgets";
import {
  completeInsight as completeInsightForOrganisation,
  createReadyInsight,
} from "@/server/finance/insights";
import {
  createTransactions,
  listTransactions as listTransactionsForOrganisation,
  summariseSpendByCategory,
  updateTransaction as updateTransactionForOrganisation,
  type CreateTransactionInput,
} from "@/server/finance/transactions";

export interface ToolExecutionContext {
  organisationId: string;
  userId?: string | null;
}

export type HostToolHandler = (
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
}

function asAmount(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Brain API tools have no array parameter type (BRA201). Agents emit strings
 * and the Tool Router leaves `type: string` values as strings, so a transaction
 * list usually arrives as a JSON array string rather than a real array.
 */
function parseTipList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (typeof entry !== "string" || entry.trim().length === 0) {
        throw new Error(`tips[${index}] must be a non-empty string.`);
      }
      return entry.trim();
    });
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("tips must be a non-empty JSON array.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
    } catch {
      throw new Error(
        "tips must be a JSON array of strings (Brain sends this parameter as a string)."
      );
    }
    if (Array.isArray(parsed)) {
      return parseTipList(parsed);
    }
  }

  throw new Error("tips must be a non-empty JSON array of strings.");
}

function parseTransactionList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("transactions must be a non-empty JSON array.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
    } catch {
      throw new Error(
        "transactions must be a JSON array of objects (Brain sends this parameter as a string)."
      );
    }
    if (Array.isArray(parsed)) {
      return parsed;
    }
    const wrapped = asRecord(parsed);
    if (wrapped && Array.isArray(wrapped.transactions)) {
      return wrapped.transactions;
    }
  }

  throw new Error("transactions must be a non-empty array.");
}

export async function getUsersForOrganisation(
  _parameters: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const { organisationId } = context;

  if (!organisationId) {
    throw new Error("Organisation ID is required");
  }

  return db
    .select()
    .from(profiles)
    .innerJoin(memberships, eq(profiles.id, memberships.userId))
    .where(eq(memberships.organisationId, organisationId));
}

export async function recordTransactions(
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const rawList = parseTransactionList(parameters.transactions);
  if (rawList.length === 0) {
    throw new Error("transactions must be a non-empty array.");
  }

  const inputs: CreateTransactionInput[] = rawList.map((entry, index) => {
    const row = asRecord(entry);
    if (!row) {
      throw new Error(`transactions[${index}] must be an object.`);
    }

    const occurredAt = asString(row.occurredAt);
    const description = asString(row.description);
    const amount = asAmount(row.amount);

    if (!occurredAt || !description || amount === null) {
      throw new Error(
        `transactions[${index}] requires occurredAt, description and amount.`
      );
    }

    return {
      occurredAt,
      description,
      amount,
      merchant: asOptionalString(row.merchant) ?? null,
      category: asOptionalString(row.category) ?? null,
      account: asOptionalString(row.account) ?? null,
      notes: asOptionalString(row.notes) ?? null,
      source: "chat_import",
      createdByUserId: context.userId ?? null,
    };
  });

  const result = await createTransactions(context.organisationId, inputs);

  return {
    inserted: result.inserted.length,
    skipped: result.skipped,
    importBatchId: result.importBatchId,
    transactions: result.inserted.map(transaction => ({
      id: transaction.id,
      occurredAt: transaction.occurredAt,
      description: transaction.description,
      amount: transaction.amount,
      category: transaction.category,
      merchant: transaction.merchant,
    })),
  };
}

export async function listTransactions(
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const limitValue =
    typeof parameters.limit === "number" ? parameters.limit : undefined;

  const rows = await listTransactionsForOrganisation(context.organisationId, {
    fromDate: asString(parameters.fromDate) ?? undefined,
    toDate: asString(parameters.toDate) ?? undefined,
    category: asString(parameters.category) ?? undefined,
    account: asString(parameters.account) ?? undefined,
    search: asString(parameters.search) ?? undefined,
    limit: limitValue,
  });

  return {
    count: rows.length,
    transactions: rows.map(transaction => ({
      id: transaction.id,
      occurredAt: transaction.occurredAt,
      description: transaction.description,
      merchant: transaction.merchant,
      amount: transaction.amount,
      currency: transaction.currency,
      category: transaction.category,
      account: transaction.account,
    })),
  };
}

export async function updateTransaction(
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const transactionId = asString(parameters.transactionId);
  if (!transactionId) {
    throw new Error("transactionId is required.");
  }

  const updated = await updateTransactionForOrganisation(
    context.organisationId,
    transactionId,
    {
      occurredAt: asString(parameters.occurredAt) ?? undefined,
      description: asString(parameters.description) ?? undefined,
      amount: asAmount(parameters.amount) ?? undefined,
      merchant: asOptionalString(parameters.merchant),
      category: asOptionalString(parameters.category),
      account: asOptionalString(parameters.account),
      notes: asOptionalString(parameters.notes),
    }
  );

  if (!updated) {
    throw new Error("Transaction not found.");
  }

  return {
    id: updated.id,
    occurredAt: updated.occurredAt,
    description: updated.description,
    amount: updated.amount,
    category: updated.category,
    merchant: updated.merchant,
  };
}

export async function listBudgets(
  _parameters: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const rows = await listBudgetsForOrganisation(context.organisationId);
  return {
    count: rows.length,
    budgets: rows.map(budget => ({
      id: budget.id,
      category: budget.category,
      period: budget.period,
      amount: budget.amount,
      currency: budget.currency,
      startsOn: budget.startsOn,
      endsOn: budget.endsOn,
    })),
  };
}

export async function upsertBudget(
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const category = asString(parameters.category);
  const periodValue = asString(parameters.period);
  const amount = asAmount(parameters.amount);
  const startsOn = asString(parameters.startsOn);

  if (!category || !periodValue || amount === null || !startsOn) {
    throw new Error("category, period, amount and startsOn are required.");
  }
  if (!isBudgetPeriod(periodValue)) {
    throw new Error(`Invalid budget period "${periodValue}".`);
  }

  const period: BudgetPeriod = periodValue;
  const budget = await upsertBudgetForOrganisation(context.organisationId, {
    category,
    period,
    amount,
    startsOn,
    endsOn: asOptionalString(parameters.endsOn) ?? null,
    notes: asOptionalString(parameters.notes) ?? null,
    currency: asString(parameters.currency) ?? undefined,
  });

  return {
    id: budget.id,
    category: budget.category,
    period: budget.period,
    amount: budget.amount,
    startsOn: budget.startsOn,
    endsOn: budget.endsOn,
  };
}

export async function getSpendSummary(
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const fromDate = asString(parameters.fromDate) ?? undefined;
  const toDate = asString(parameters.toDate) ?? undefined;

  const [byCategory, budgetProgress] = await Promise.all([
    summariseSpendByCategory(context.organisationId, { fromDate, toDate }),
    getBudgetProgress(context.organisationId),
  ]);

  return {
    byCategory,
    budgets: budgetProgress.map(budget => ({
      category: budget.category,
      period: budget.period,
      amount: budget.amount,
      spent: budget.spent,
      remaining: budget.remaining,
      percentUsed: budget.percentUsed,
      periodStart: budget.periodStart,
      periodEnd: budget.periodEnd,
    })),
  };
}

export async function upsertInsight(
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const insightId = asString(parameters.insightId);
  const title = asString(parameters.title);
  if (!insightId || !title) {
    throw new Error("insightId and title are required.");
  }

  const tips = parseTipList(parameters.tips);
  const insight = await completeInsightForOrganisation(
    context.organisationId,
    insightId,
    { title, tips }
  );

  return {
    id: insight.id,
    category: insight.category,
    status: insight.status,
    title: insight.title,
    tips: insight.tips,
  };
}

export async function createInsight(
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
) {
  const category = asString(parameters.category);
  const title = asString(parameters.title);
  if (!category || !title) {
    throw new Error("category and title are required.");
  }
  if (!isInsightCategory(category)) {
    throw new Error(
      "category must be one of spending_trends, budget_alerts, anomalies, budgeting_spending, saving_emergency, debt_credit, or investing_growth."
    );
  }

  const tips = parseTipList(parameters.tips);
  const { insight, alreadyRecorded } = await createReadyInsight(
    context.organisationId,
    { category, title, tips }
  );

  const label = `${insight.title} (${insight.status})`;
  return {
    category: insight.category,
    status: insight.status,
    title: insight.title,
    alreadyRecorded,
    message: alreadyRecorded
      ? `Insight already recorded today: ${label}.`
      : `Insight created: ${label}.`,
  };
}

/** Registry of tools exposed at `/api/tools/{toolId}`. */
export const hostTools: Record<string, HostToolHandler> = {
  getUsers: getUsersForOrganisation,
  recordTransactions,
  listTransactions,
  updateTransaction,
  listBudgets,
  upsertBudget,
  getSpendSummary,
  upsertInsight,
  createInsight,
};
