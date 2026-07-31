import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { statusPageSchema } from "@/lib/validation";

export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pages = await db.statusPage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ pages });
}

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = statusPageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { title, description, slug, isPublished, selectedMonitorIds } = parsed.data;

    // Check slug uniqueness
    const existing = await db.statusPage.findUnique({
      where: { slug },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A status page with this slug already exists. Please choose another slug." },
        { status: 409 }
      );
    }

    // Verify all selectedMonitorIds belong to the current user
    if (selectedMonitorIds.length > 0) {
      const userMonitors = await db.monitor.findMany({
        where: {
          id: { in: selectedMonitorIds },
          userId: user.id,
        },
        select: { id: true },
      });

      const allowedIds = userMonitors.map((m) => m.id);
      const invalidIds = selectedMonitorIds.filter((id) => !allowedIds.includes(id));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: "Some selected monitors do not belong to your account" },
          { status: 403 }
        );
      }
    }

    const page = await db.statusPage.create({
      data: {
        userId: user.id,
        title,
        description,
        slug,
        isPublished,
        selectedMonitorIds,
      },
    });

    return NextResponse.json({ page }, { status: 201 });
  } catch (err: unknown) {
    console.error("Create status page error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
