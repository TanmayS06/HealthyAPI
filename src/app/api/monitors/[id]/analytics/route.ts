import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assertMonitorOwner } from "@/lib/permissions";
import { getMonitorAnalytics } from "@/server/analytics/uptime";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await assertMonitorOwner(id, user.id);

    const { searchParams } = new URL(req.url);
    const rangeParam = searchParams.get("range") || "24h";
    const range = ["24h", "7d", "30d"].includes(rangeParam)
      ? (rangeParam as "24h" | "7d" | "30d")
      : "24h";

    const analytics = await getMonitorAnalytics(id, range);

    return NextResponse.json({ analytics });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message || "Internal server error" }, { status: 500 });
  }
}
