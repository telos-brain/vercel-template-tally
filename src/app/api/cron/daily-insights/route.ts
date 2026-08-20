import { NextRequest, NextResponse } from "next/server";
import { startDailyInsightRuns } from "@/server/finance/insights";

interface DailyInsightsCronResponse {
  success: boolean;
  data?: {
    started: number;
    skipped: number;
    failed: number;
  };
  error?: string;
}

function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

function isAuthorizedCron(request: NextRequest): boolean {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (isVercelRuntime()) {
    return Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);
  }

  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return true;
  }

  const brainKey = process.env.BRAIN_API_KEY;
  return Boolean(brainKey && authorization === `Bearer ${brainKey}`);
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorised." } satisfies DailyInsightsCronResponse,
        { status: 401 }
      );
    }

    const data = await startDailyInsightRuns();
    return NextResponse.json({
      success: true,
      data,
    } satisfies DailyInsightsCronResponse);
  } catch (error) {
    console.error("Error in GET /api/cron/daily-insights:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message } satisfies DailyInsightsCronResponse,
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
