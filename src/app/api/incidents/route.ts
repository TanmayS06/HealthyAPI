import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");

  const whereClause: {
    monitor: { userId: string };
    status?: string;
  } = {
    monitor: { userId: user.id },
  };

  if (statusParam && ["OPEN", "RESOLVED", "ACKNOWLEDGED"].includes(statusParam.toUpperCase())) {
    whereClause.status = statusParam.toUpperCase();
  }

  const incidents = await db.incident.findMany({
    where: whereClause,
    include: {
      monitor: {
        select: { id: true, name: true, url: true },
      },
      notifications: {
        take: 5,
        orderBy: { sentAt: "desc" },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ incidents });
}
