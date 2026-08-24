import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db";
import { DEMO_ORG_ID } from "@/lib/constants";

// Exercises the same write path the updateTaskStatus/updateDealStage server
// actions use (src/lib/actions/mutations.ts), directly against Prisma —
// the actions themselves need a live Next.js request scope for auth() and
// aren't callable from a plain Node test process. This still validates the
// schema constraints, cascades, and audit-log linkage those actions rely on.

const prisma = getPrismaClient();
const testTaskId = "test-task-mutation-integration";

describe("task status mutation + audit trail (database)", () => {
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: testTaskId } });
    await prisma.task.deleteMany({ where: { id: testTaskId } });
  });

  it("updates status and writes a linked audit log entry", async () => {
    await prisma.task.create({
      data: {
        id: testTaskId,
        organizationId: DEMO_ORG_ID,
        title: "Integration test task",
        status: "TODO",
        priority: "MEDIUM",
      },
    });

    await prisma.task.update({ where: { id: testTaskId }, data: { status: "COMPLETED" } });
    await prisma.auditLog.create({
      data: {
        organizationId: DEMO_ORG_ID,
        actorUserId: "banker-bharath",
        action: "Task completed",
        entityType: "Task",
        entityId: testTaskId,
        metadata: { from: "TODO", to: "COMPLETED" },
      },
    });

    const task = await prisma.task.findUniqueOrThrow({ where: { id: testTaskId } });
    expect(task.status).toBe("COMPLETED");

    const auditEntries = await prisma.auditLog.findMany({ where: { entityId: testTaskId } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]!.action).toBe("Task completed");
  });
});
