"use server";

import { signIn, signOut } from "./config";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";

export async function loginAsBanker(formData: FormData) {
  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) {
    throw new Error("Select an account to continue.");
  }
  const callbackUrl = (formData.get("callbackUrl") as string | null) || "/dashboard";

  const prisma = getPrismaClient();
  await prisma.auditLog.create({
    data: {
      organizationId: DEMO_ORG_ID,
      actorUserId: userId,
      action: "User login",
      entityType: "User",
      entityId: userId,
      metadata: { method: "demo-credentials" },
    },
  });

  await signIn("demo", { userId, redirectTo: callbackUrl });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
