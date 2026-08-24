"use server";

import { revalidatePath } from "next/cache";
import { getPrismaClient } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { DEMO_ORG_ID } from "@/lib/constants";

const prisma = getPrismaClient();

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated.");
  }
  return session.user.id;
}

async function writeAuditLog(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, string | number | boolean | null>,
) {
  await prisma.auditLog.create({
    data: { organizationId: DEMO_ORG_ID, actorUserId, action, entityType, entityId, metadata },
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function markNotificationRead(notificationId: string) {
  const userId = await requireUserId();
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const userId = await requireUserId();
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Notification preferences (Settings)
// ---------------------------------------------------------------------------

const NOTIFICATION_PREFERENCE_KEYS = [
  "notifyDealChanges",
  "notifyRiskAlerts",
  "notifyTaskReminders",
  "notifyDailyDigest",
] as const;

export async function updateNotificationPreferences(formData: FormData) {
  const userId = await requireUserId();

  const data = Object.fromEntries(
    NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, formData.get(key) === "on"]),
  );

  await prisma.organizationMember.updateMany({
    where: { userId },
    data,
  });

  await writeAuditLog(userId, "Updated notification preferences", "OrganizationMember", userId, data);

  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Deal stage (Pipeline drag-and-drop)
// ---------------------------------------------------------------------------

export async function updateDealStage(dealId: string, newStageKey: string) {
  const userId = await requireUserId();

  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { currentStage: true, workflow: { include: { stages: true } } },
  });
  const newStage = deal.workflow.stages.find((s) => s.key === newStageKey);
  if (!newStage) throw new Error(`Unknown stage "${newStageKey}" for this deal's workflow.`);
  if (newStage.id === deal.currentStageId) return;

  const previousLabel = deal.currentStage.label;

  await prisma.$transaction([
    prisma.deal.update({
      where: { id: dealId },
      data: {
        previousStageId: deal.currentStageId,
        currentStageId: newStage.id,
        lastActivityAt: new Date(),
      },
    }),
    prisma.dealEvent.create({
      data: {
        dealId,
        type: "STAGE_CHANGE",
        previousValue: previousLabel,
        newValue: newStage.label,
        note: `Stage manually updated to ${newStage.label}.`,
      },
    }),
  ]);

  await writeAuditLog(userId, "Deal stage changed", "Deal", dealId, {
    from: previousLabel,
    to: newStage.label,
  });

  revalidatePath("/pipeline");
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Task status (Task board drag-and-drop)
// ---------------------------------------------------------------------------

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED", "DISMISSED"] as const;
type TaskStatusValue = (typeof TASK_STATUSES)[number];

export async function updateTaskStatus(taskId: string, newStatus: TaskStatusValue) {
  const userId = await requireUserId();
  if (!TASK_STATUSES.includes(newStatus)) throw new Error(`Unknown task status "${newStatus}".`);

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === newStatus) return;

  await prisma.task.update({ where: { id: taskId }, data: { status: newStatus } });

  await writeAuditLog(
    userId,
    newStatus === "COMPLETED" ? "Task completed" : "Task status changed",
    "Task",
    taskId,
    { from: task.status, to: newStatus },
  );

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (task.dealId) revalidatePath(`/deals/${task.dealId}`);
}

// ---------------------------------------------------------------------------
// Intelligence Feed review actions
// ---------------------------------------------------------------------------

export async function reviewIntelligenceEvent(
  eventId: string,
  status: "REVIEWED" | "DISMISSED",
) {
  const userId = await requireUserId();
  await prisma.intelligenceEvent.update({
    where: { id: eventId },
    data: { reviewStatus: status },
  });
  await writeAuditLog(
    userId,
    status === "DISMISSED" ? "Dismissed AI suggestion" : "Accepted AI suggestion",
    "IntelligenceEvent",
    eventId,
  );
  revalidatePath("/intelligence");
  revalidatePath("/dashboard");
}
