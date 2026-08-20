import { withOrgContext } from "@db/index";
import {
  Transaction,
  TransactionSource,
  transactions,
} from "@db/schema";
import {
  computeDedupeKey,
  DEFAULT_CURRENCY,
  normaliseMoneyAmount,
  type CategorySpendRow,
} from "@/lib/finance";

export type { CategorySpendRow };
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

export interface ListTransactionsFilters {
  fromDate?: string;
  toDate?: string;
  category?: string;
  account?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateTransactionInput {
  occurredAt: string;
  description: string;
  amount: string | number;
  merchant?: string | null;
  category?: string | null;
  account?: string | null;
  notes?: string | null;
  currency?: string;
  source?: TransactionSource;
  importBatchId?: string | null;
  createdByUserId?: string | null;
}

export interface UpdateTransactionInput {
  occurredAt?: string;
  description?: string;
  amount?: string | number;
  merchant?: string | null;
  category?: string | null;
  account?: string | null;
  notes?: string | null;
  currency?: string;
}

export interface CreateTransactionsResult {
  inserted: Transaction[];
  skipped: number;
  importBatchId: string;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function listTransactions(
  organisationId: string,
  filters: ListTransactionsFilters = {}
): Promise<Transaction[]> {
  const conditions = [eq(transactions.organisationId, organisationId)];

  if (filters.fromDate) {
    conditions.push(gte(transactions.occurredAt, filters.fromDate));
  }
  if (filters.toDate) {
    conditions.push(lte(transactions.occurredAt, filters.toDate));
  }
  if (filters.category) {
    conditions.push(eq(transactions.category, filters.category));
  }
  if (filters.account) {
    conditions.push(eq(transactions.account, filters.account));
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(ilike(transactions.description, term), ilike(transactions.merchant, term))!
    );
  }

  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 500) : 500;
  const offset = filters.offset && filters.offset > 0 ? filters.offset : 0;

  return withOrgContext(organisationId, tx =>
    tx
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
      .limit(limit)
      .offset(offset)
  );
}

export async function createTransactions(
  organisationId: string,
  inputs: CreateTransactionInput[]
): Promise<CreateTransactionsResult> {
  if (inputs.length === 0) {
    throw new Error("At least one transaction is required.");
  }

  const importBatchId = inputs[0]?.importBatchId ?? crypto.randomUUID();

  const rows = inputs.map(input => {
    if (!isIsoDate(input.occurredAt)) {
      throw new Error(`occurredAt must be YYYY-MM-DD (got "${input.occurredAt}").`);
    }
    const description = input.description.trim();
    if (!description) {
      throw new Error("description is required.");
    }
    const amount = normaliseMoneyAmount(input.amount);
    return {
      organisationId,
      occurredAt: input.occurredAt,
      description,
      merchant: input.merchant?.trim() || null,
      amount,
      currency: input.currency?.trim() || DEFAULT_CURRENCY,
      category: input.category?.trim() || null,
      account: input.account?.trim() || null,
      source: input.source ?? "manual",
      notes: input.notes?.trim() || null,
      dedupeKey: computeDedupeKey(input.occurredAt, amount, description),
      importBatchId,
      createdByUserId: input.createdByUserId ?? null,
    };
  });

  return withOrgContext(organisationId, async tx => {
    const inserted = await tx
      .insert(transactions)
      .values(rows)
      .onConflictDoNothing({
        target: [transactions.organisationId, transactions.dedupeKey],
      })
      .returning();

    return {
      inserted,
      skipped: rows.length - inserted.length,
      importBatchId,
    };
  });
}

export async function updateTransaction(
  organisationId: string,
  transactionId: string,
  input: UpdateTransactionInput
): Promise<Transaction | null> {
  return withOrgContext(organisationId, async tx => {
    const [existing] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.organisationId, organisationId)
        )
      )
      .limit(1);

    if (!existing) {
      return null;
    }

    const occurredAt = input.occurredAt ?? existing.occurredAt;
    const description = input.description?.trim() ?? existing.description;
    const amount = input.amount !== undefined
      ? normaliseMoneyAmount(input.amount)
      : existing.amount;

    if (!isIsoDate(occurredAt)) {
      throw new Error(`occurredAt must be YYYY-MM-DD (got "${occurredAt}").`);
    }
    if (!description) {
      throw new Error("description is required.");
    }

    const [updated] = await tx
      .update(transactions)
      .set({
        occurredAt,
        description,
        amount,
        merchant:
          input.merchant !== undefined
            ? input.merchant?.trim() || null
            : existing.merchant,
        category:
          input.category !== undefined
            ? input.category?.trim() || null
            : existing.category,
        account:
          input.account !== undefined
            ? input.account?.trim() || null
            : existing.account,
        notes:
          input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        currency: input.currency?.trim() || existing.currency,
        dedupeKey: computeDedupeKey(occurredAt, amount, description),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.organisationId, organisationId)
        )
      )
      .returning();

    return updated ?? null;
  });
}

export async function deleteTransaction(
  organisationId: string,
  transactionId: string
): Promise<boolean> {
  return withOrgContext(organisationId, async tx => {
    const deleted = await tx
      .delete(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.organisationId, organisationId)
        )
      )
      .returning({ id: transactions.id });

    return deleted.length > 0;
  });
}

export async function summariseSpendByCategory(
  organisationId: string,
  filters: Pick<ListTransactionsFilters, "fromDate" | "toDate"> = {}
): Promise<CategorySpendRow[]> {
  const conditions = [eq(transactions.organisationId, organisationId)];

  if (filters.fromDate) {
    conditions.push(gte(transactions.occurredAt, filters.fromDate));
  }
  if (filters.toDate) {
    conditions.push(lte(transactions.occurredAt, filters.toDate));
  }

  return withOrgContext(organisationId, tx =>
    tx
      .select({
        category: sql<string>`coalesce(${transactions.category}, 'Uncategorised')`,
        total: sql<string>`coalesce(sum(${transactions.amount}), 0)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(and(...conditions))
      .groupBy(sql`coalesce(${transactions.category}, 'Uncategorised')`)
  );
}
