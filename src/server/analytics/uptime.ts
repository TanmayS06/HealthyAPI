import db from "@/lib/db";
import { redis } from "@/lib/redis";

export interface AnalyticsSummary {
  monitorId: string;
  range: "24h" | "7d" | "30d";
  uptimePercentage: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  chartData: Array<{
    timestamp: string;
    avgResponseTime: number;
    uptimePercent: number;
    checks: number;
    failures: number;
  }>;
  recentChecks: Array<{
    id: string;
    checkedAt: string;
    statusCode: number | null;
    responseTimeMs: number;
    success: boolean;
    errorType: string | null;
    errorMessage: string | null;
  }>;
}

export async function getMonitorAnalytics(
  monitorId: string,
  range: "24h" | "7d" | "30d" = "24h"
): Promise<AnalyticsSummary> {
  const cacheKey = `healthyapi:analytics:${monitorId}:${range}`;

  // 1. Check Redis Cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn("Redis analytics cache read error:", err);
  }

  // 2. Compute date threshold
  const now = new Date();
  const since = new Date();
  if (range === "24h") {
    since.setHours(now.getHours() - 24);
  } else if (range === "7d") {
    since.setDate(now.getDate() - 7);
  } else {
    since.setDate(now.getDate() - 30);
  }

  // 3. Fetch check results in time range
  const results = await db.checkResult.findMany({
    where: {
      monitorId,
      checkedAt: { gte: since },
    },
    orderBy: { checkedAt: "asc" },
  });

  const totalChecks = results.length;
  let successfulChecks = 0;
  let responseTimes: number[] = [];

  for (const r of results) {
    if (r.success) successfulChecks++;
    if (r.responseTimeMs > 0) responseTimes.push(r.responseTimeMs);
  }

  const failedChecks = totalChecks - successfulChecks;
  const uptimePercentage =
    totalChecks > 0 ? Number(((successfulChecks / totalChecks) * 100).toFixed(2)) : 100;

  responseTimes.sort((a, b) => a - b);
  const avgResponseTimeMs =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((acc, v) => acc + v, 0) / responseTimes.length)
      : 0;

  const minResponseTimeMs = responseTimes.length > 0 ? responseTimes[0] : 0;
  const maxResponseTimeMs =
    responseTimes.length > 0 ? responseTimes[responseTimes.length - 1] : 0;

  const p95Index = Math.floor(responseTimes.length * 0.95);
  const p95ResponseTimeMs = responseTimes.length > 0 ? responseTimes[p95Index] || 0 : 0;

  // 4. Aggregate chart data into buckets (hourly for 24h, daily for 7d and 30d)
  const buckets: Record<
    string,
    { sumTime: number; count: number; successes: number; failures: number }
  > = {};

  for (const r of results) {
    const d = new Date(r.checkedAt);
    let key = "";
    if (range === "24h") {
      key = `${d.getHours().toString().padStart(2, "0")}:00`;
    } else {
      key = `${d.getMonth() + 1}/${d.getDate()}`;
    }

    if (!buckets[key]) {
      buckets[key] = { sumTime: 0, count: 0, successes: 0, failures: 0 };
    }

    buckets[key].count++;
    if (r.success) {
      buckets[key].successes++;
      buckets[key].sumTime += r.responseTimeMs;
    } else {
      buckets[key].failures++;
    }
  }

  const chartData = Object.entries(buckets).map(([timestamp, data]) => ({
    timestamp,
    avgResponseTime: data.successes > 0 ? Math.round(data.sumTime / data.successes) : 0,
    uptimePercent:
      data.count > 0 ? Number(((data.successes / data.count) * 100).toFixed(1)) : 100,
    checks: data.count,
    failures: data.failures,
  }));

  // 5. Fetch latest 20 checks for inspection
  const latestChecks = await db.checkResult.findMany({
    where: { monitorId },
    orderBy: { checkedAt: "desc" },
    take: 20,
  });

  const recentChecks = latestChecks.map((c) => ({
    id: c.id,
    checkedAt: c.checkedAt.toISOString(),
    statusCode: c.statusCode,
    responseTimeMs: c.responseTimeMs,
    success: c.success,
    errorType: c.errorType,
    errorMessage: c.errorMessage,
  }));

  const analyticsSummary: AnalyticsSummary = {
    monitorId,
    range,
    uptimePercentage,
    totalChecks,
    successfulChecks,
    failedChecks,
    avgResponseTimeMs,
    p95ResponseTimeMs,
    minResponseTimeMs,
    maxResponseTimeMs,
    chartData,
    recentChecks,
  };

  // 6. Cache in Redis for 30 seconds
  try {
    await redis.set(cacheKey, JSON.stringify(analyticsSummary), "EX", 30);
  } catch (err) {
    console.warn("Failed to set Redis analytics cache:", err);
  }

  return analyticsSummary;
}
