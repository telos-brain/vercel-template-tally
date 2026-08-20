import type { InsightCategory } from "@db/schema";

export const INSIGHT_CATEGORIES = [
  "budgeting_spending",
  "saving_emergency",
  "debt_credit",
  "investing_growth",
  "spending_trends",
  "budget_alerts",
  "anomalies",
] as const;

export const INSIGHT_CATEGORY_LABELS: Record<InsightCategory, string> = {
  budgeting_spending: "Budgeting and Spending",
  saving_emergency: "Saving and Emergency Funds",
  debt_credit: "Debt and Credit",
  investing_growth: "Investing and Growth",
  spending_trends: "Spending breakdown and trends",
  budget_alerts: "Budget and goal alerts",
  anomalies: "Anomalies and optimisation",
};

export function isInsightCategory(value: string): value is InsightCategory {
  return (INSIGHT_CATEGORIES as readonly string[]).includes(value);
}

export const INSIGHT_CARD_SUMMARY_LIMIT = 2;

export function summariseInsightTips(
  tips: string[],
  limit = INSIGHT_CARD_SUMMARY_LIMIT
): string[] {
  return tips.filter(tip => tip.trim().length > 0).slice(0, limit);
}
