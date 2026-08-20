import {
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const rolesEnum = pgEnum("roles", ["admin", "member", "super_admin"]);

const inviteStatusEnum = pgEnum("invite_statuses", [
  "pending",
  "accepted",
  "expired",
]);

const budgetPeriodEnum = pgEnum("budget_periods", [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "yearly",
]);

const transactionSourceEnum = pgEnum("transaction_sources", [
  "chat_import",
  "manual",
  "api",
]);

const chatMessageRoleEnum = pgEnum("chat_message_roles", ["user", "assistant"]);

const insightCategoryEnum = pgEnum("insight_categories", [
  "budgeting_spending",
  "saving_emergency",
  "debt_credit",
  "investing_growth",
]);

const insightStatusEnum = pgEnum("insight_statuses", [
  "analysing",
  "ready",
  "failed",
]);

// Export the enum objects
export {
  budgetPeriodEnum,
  chatMessageRoleEnum,
  insightCategoryEnum,
  insightStatusEnum,
  inviteStatusEnum,
  rolesEnum,
  transactionSourceEnum,
};

// Create convenient enum-like objects for dot notation access
export const InviteStatus = {
  Pending: "pending" as const,
  Accepted: "accepted" as const,
  Expired: "expired" as const,
} as const;

export const Role = {
  Admin: "admin" as const,
  Member: "member" as const,
  SuperAdmin: "super_admin" as const,
} as const;

export const BudgetPeriod = {
  Weekly: "weekly" as const,
  Fortnightly: "fortnightly" as const,
  Monthly: "monthly" as const,
  Quarterly: "quarterly" as const,
  Yearly: "yearly" as const,
} as const;

export const TransactionSource = {
  ChatImport: "chat_import" as const,
  Manual: "manual" as const,
  Api: "api" as const,
} as const;

export const ChatMessageRole = {
  User: "user" as const,
  Assistant: "assistant" as const,
} as const;

export const InsightCategory = {
  BudgetingSpending: "budgeting_spending" as const,
  SavingEmergency: "saving_emergency" as const,
  DebtCredit: "debt_credit" as const,
  InvestingGrowth: "investing_growth" as const,
} as const;

export const InsightStatus = {
  Analysing: "analysing" as const,
  Ready: "ready" as const,
  Failed: "failed" as const,
} as const;

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  brainEntityId: uuid("brain_entity_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  currentOrganisationId: uuid("current_organisation_id").references(
    () => organisations.id
  ),
  profileImageId: uuid("profile_image_id").references(() => files.id),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  role: rolesEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  storagePath: text("storage_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const inviteTokens = pgTable("invite_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => profiles.id),
  role: rolesEnum("role").notNull().default("member"),
  token: text("token").notNull().unique(),
  status: inviteStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    occurredAt: date("occurred_at", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    merchant: text("merchant"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("NZD"),
    category: text("category"),
    account: text("account"),
    source: transactionSourceEnum("source").notNull().default("manual"),
    notes: text("notes"),
    dedupeKey: text("dedupe_key").notNull(),
    importBatchId: uuid("import_batch_id"),
    createdByUserId: uuid("created_by_user_id").references(() => profiles.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  table => [
    unique("transactions_org_dedupe_unique").on(
      table.organisationId,
      table.dedupeKey
    ),
  ]
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    category: text("category").notNull(),
    period: budgetPeriodEnum("period").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("NZD"),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  table => [
    unique("budgets_org_category_period_start_unique").on(
      table.organisationId,
      table.category,
      table.period,
      table.startsOn
    ),
  ]
);

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => profiles.id),
  title: text("title").notNull().default("New chat"),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
});

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id),
    category: insightCategoryEnum("category").notNull(),
    status: insightStatusEnum("status").notNull().default("analysing"),
    title: text("title").notNull().default(""),
    tips: jsonb("tips").$type<string[]>().notNull().default([]),
    brainUnitOfWorkId: text("brain_unit_of_work_id"),
    brainRunId: text("brain_run_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  table => [index("idx_insights_org_status").on(table.organisationId, table.status)]
);

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  role: chatMessageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Essential type exports
export type Profile = typeof profiles.$inferSelect;
export type Organisation = typeof organisations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Role = (typeof rolesEnum.enumValues)[number];
export type InviteStatus = (typeof inviteStatusEnum.enumValues)[number];
export type File = typeof files.$inferSelect;
export type InviteToken = typeof inviteTokens.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type BudgetPeriod = (typeof budgetPeriodEnum.enumValues)[number];
export type TransactionSource = (typeof transactionSourceEnum.enumValues)[number];
export type ChatMessageRole = (typeof chatMessageRoleEnum.enumValues)[number];
export type Insight = typeof insights.$inferSelect;
export type NewInsight = typeof insights.$inferInsert;
export type InsightCategory = (typeof insightCategoryEnum.enumValues)[number];
export type InsightStatus = (typeof insightStatusEnum.enumValues)[number];
// Type for joined data with related entities
export type MembershipWithUser = {
  membership: Membership;
  profile: Profile;
};

export type InviteWithDetails = {
  invite: InviteToken;
  invitedBy: Profile;
};
