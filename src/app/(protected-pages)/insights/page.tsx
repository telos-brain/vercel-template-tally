"use client";

import { useMemo, useState } from "react";
import type { Insight, InsightCategory } from "@db/schema";
import Modal from "@/components/Modal";
import Button from "@/components/buttons/Button";
import InsightQueueForm from "@/components/finance/InsightQueueForm";
import BaseCard from "@/components/ui/BaseCard";
import { Icon } from "@/components/ui/Icon";
import {
  useDismissInsight,
  useInsights,
  useQueueInsights,
} from "@/hooks/useInsights";
import { usePageLayout } from "@/hooks/usePageLayout";
import { useTransactions } from "@/hooks/useTransactions";
import { getAppName } from "@/lib/app";
import {
  INSIGHT_CATEGORY_LABELS,
  summariseInsightTips,
} from "@/lib/insights";
import { formatRelativeTime } from "@/lib/chat";

const DISMISS_HINT = "Dismissing deletes the insight.";

function insightCreatedLabel(value: Date | string): string {
  return formatRelativeTime(value);
}

function InsightCard({
  insight,
  onOpen,
  onDismiss,
  isDismissing,
}: {
  insight: Insight;
  onOpen: () => void;
  onDismiss: () => void;
  isDismissing: boolean;
}) {
  const categoryLabel = INSIGHT_CATEGORY_LABELS[insight.category];
  const summaryTips = summariseInsightTips(insight.tips);
  const remainingCount = Math.max(insight.tips.length - summaryTips.length, 0);

  return (
    <BaseCard className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onOpen}
        >
          <h2 className="text-lg font-semibold text-gray-900">{categoryLabel}</h2>
          {insight.status === "ready" && insight.title && (
            <p className="mt-1 text-sm text-gray-500">{insight.title}</p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            {insightCreatedLabel(insight.createdAt)}
          </p>
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
          onClick={onDismiss}
          disabled={isDismissing}
          title={DISMISS_HINT}
          aria-label={DISMISS_HINT}
        >
          <Icon icon="trash" className="h-3.5 w-3.5" />
        </button>
      </div>

      <button type="button" className="w-full text-left" onClick={onOpen}>
        {insight.status === "analysing" && (
          <p className="text-sm text-gray-500">Analysing...</p>
        )}

        {insight.status === "failed" && (
          <p className="line-clamp-2 text-sm text-red-600">
            {insight.title || "Could not analyse this category."}
          </p>
        )}

        {insight.status === "ready" && summaryTips.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            {summaryTips.map(tip => (
              <li key={tip} className="line-clamp-2">
                {tip}
              </li>
            ))}
          </ul>
        )}

        {insight.status === "ready" && remainingCount > 0 && (
          <p className="mt-2 text-sm text-blue-600">
            View {remainingCount} more
          </p>
        )}
      </button>
    </BaseCard>
  );
}

export default function InsightsPage() {
  usePageLayout(useMemo(() => ({ breadcrumbs: [{ label: "Insights" }] }), []));

  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [viewing, setViewing] = useState<Insight | null>(null);
  const insightsQuery = useInsights();
  const transactionsQuery = useTransactions();
  const queueInsights = useQueueInsights();
  const dismissInsight = useDismissInsight();

  const insightRows = insightsQuery.data?.insights ?? [];
  const viewingInsight = viewing
    ? insightRows.find(insight => insight.id === viewing.id) ?? viewing
    : null;
  const hasTransactions = (transactionsQuery.data?.length ?? 0) > 0;
  const isLoading = insightsQuery.isLoading || transactionsQuery.isLoading;
  const appName = getAppName();

  const handleQueue = async (categories: InsightCategory[]) => {
    try {
      await queueInsights.mutateAsync(categories);
      setIsQueueOpen(false);
    } catch {
      // Toast is handled by the mutation
    }
  };

  const handleDismiss = async (insight: Insight) => {
    try {
      await dismissInsight.mutateAsync(insight.id);
      if (viewing?.id === insight.id) {
        setViewing(null);
      }
    } catch {
      // Toast is handled by the mutation
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
          <p className="text-gray-600">
            Short, actionable advice from {appName} based on your transactions.
          </p>
        </div>
        {insightRows.length > 0 && (
          <Button onClick={() => setIsQueueOpen(true)}>
            <Icon icon="plus" className="mr-2 h-4 w-4" />
            Add new insight
          </Button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-gray-500">Loading insights…</p>
      )}

      {!isLoading && insightRows.length === 0 && !hasTransactions && (
        <BaseCard>
          <p className="text-gray-600">
            No new insights. Add transactions via the chat, for {appName} to
            analyse.
          </p>
        </BaseCard>
      )}

      {!isLoading && insightRows.length === 0 && hasTransactions && (
        <BaseCard className="flex flex-col items-center py-12 text-center">
          <Icon icon="userTie" className="mb-4 h-12 w-12 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Add insights</h2>
          <p className="mt-1 max-w-md text-sm text-gray-600">
            Queue a Brain job to analyse your transactions. You can watch the
            run in your local Brain UI.
          </p>
          <Button className="mt-6" onClick={() => setIsQueueOpen(true)}>
            Queue up an insight
          </Button>
        </BaseCard>
      )}

      {insightRows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {insightRows.map(insight => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onOpen={() => setViewing(insight)}
              onDismiss={() => {
                void handleDismiss(insight);
              }}
              isDismissing={dismissInsight.isPending}
            />
          ))}
        </div>
      )}

      {isQueueOpen && (
        <Modal
          title="What insight categories would you like?"
          onClose={() => setIsQueueOpen(false)}
        >
          <InsightQueueForm
            onSubmit={categories => {
              void handleQueue(categories);
            }}
            onCancel={() => setIsQueueOpen(false)}
            isSubmitting={queueInsights.isPending}
          />
        </Modal>
      )}

      {viewingInsight && (
        <Modal
          title={INSIGHT_CATEGORY_LABELS[viewingInsight.category]}
          maxWidth="lg"
          onClose={() => setViewing(null)}
        >
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <p className="mb-4 text-xs text-gray-400">
              {insightCreatedLabel(viewingInsight.createdAt)}
            </p>
            {viewingInsight.status === "ready" && viewingInsight.title && (
              <p className="mb-4 text-sm text-gray-600">{viewingInsight.title}</p>
            )}
            {viewingInsight.status === "analysing" && (
              <p className="text-sm text-gray-500">Analysing...</p>
            )}
            {viewingInsight.status === "failed" && (
              <p className="text-sm text-red-600">
                {viewingInsight.title || "Could not analyse this category."}
              </p>
            )}
            {viewingInsight.status === "ready" && viewingInsight.tips.length > 0 && (
              <ul className="list-disc space-y-3 pl-5 text-sm text-gray-700">
                {viewingInsight.tips.map(tip => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="dangerSoft"
              title={DISMISS_HINT}
              aria-label={DISMISS_HINT}
              onClick={() => {
                void handleDismiss(viewingInsight);
              }}
              disabled={dismissInsight.isPending}
            >
              Dismiss
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setViewing(null)}
            >
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
