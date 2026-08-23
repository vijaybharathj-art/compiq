import { PageHeader } from "@/components/shared/page-header";
import { TaskBoard } from "@/components/tasks/task-board";
import { taskRepository } from "@/lib/data";

export default async function TasksPage() {
  const tasks = await taskRepository.list();

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Work generated from deal activity and email intelligence, tracked to completion."
      />
      <div className="pt-4">
        <TaskBoard tasks={tasks} />
      </div>
    </div>
  );
}
