import { boolean, InferType, object, string } from "yup";
import { BUDGET_PERIODS } from "@/lib/finance";

export const ProfileSchema = object({
  firstName: string().required("First name is required"),
  lastName: string().required("Last name is required"),
  email: string()
    .required("Email is required")
    .matches(
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      "Please enter a valid email address"
    ),
});

export type ProfileFormValues = InferType<typeof ProfileSchema>;

export const TransactionSchema = object({
  occurredAt: string().required("Date is required"),
  description: string().required("Description is required"),
  amount: string()
    .required("Amount is required")
    .test("is-number", "Amount must be a number", value =>
      value ? Number.isFinite(Number.parseFloat(value)) : false
    ),
  merchant: string().default(""),
  category: string().default(""),
  account: string().default(""),
  notes: string().default(""),
});

export type TransactionFormValues = InferType<typeof TransactionSchema>;

export const BudgetSchema = object({
  category: string().required("Category is required"),
  period: string()
    .required("Period is required")
    .oneOf([...BUDGET_PERIODS], "Select a valid period"),
  amount: string()
    .required("Amount is required")
    .test("is-positive", "Amount must be greater than zero", value =>
      value ? Number.parseFloat(value) > 0 : false
    ),
  startsOn: string().required("Start date is required"),
  endsOn: string().default(""),
  notes: string().default(""),
});

export type BudgetFormValues = InferType<typeof BudgetSchema>;

export const InsightQueueSchema = object({
  budgetingSpending: boolean().default(false),
  savingEmergency: boolean().default(false),
  debtCredit: boolean().default(false),
  investingGrowth: boolean().default(false),
  spendingTrends: boolean().default(false),
  budgetAlerts: boolean().default(false),
  anomalies: boolean().default(false),
}).test("at-least-one-category", "Select at least one category", function (value) {
  const selected =
    value.budgetingSpending ||
    value.savingEmergency ||
    value.debtCredit ||
    value.investingGrowth ||
    value.spendingTrends ||
    value.budgetAlerts ||
    value.anomalies;
  return selected
    ? true
    : this.createError({
        path: "budgetingSpending",
        message: "Select at least one category",
      });
});

export type InsightQueueFormValues = InferType<typeof InsightQueueSchema>;
