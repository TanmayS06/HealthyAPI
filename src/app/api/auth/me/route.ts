import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      webhookUrl: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user: profile });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, webhookUrl } = body;

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        webhookUrl: webhookUrl ? String(webhookUrl).trim() : null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        webhookUrl: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (err: unknown) {
    console.error("Update profile error:", err);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
