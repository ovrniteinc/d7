import { AssigneeAvatars } from "../AssigneePicker";
import { MonoBadge, StatusDot } from "../ui";
import { STATUS_LABELS, PRIORITY_DOTS } from "../../lib/constants";
import { fmtDate } from "../../lib/format";
import type { Task, Project, Profile, Priority, TaskStatus } from "../../lib/types";

interface TaskTableViewProps {
  tasks: Task[];
  projectMap: Record<string, Project>;
  userMap: Record<string, Profile>;
  commentCounts: Record<string, number>;
  onOpen: (id: string) => void;
}

export default function TaskTableView({
  tasks,
  projectMap,
  userMap,
  commentCounts,
  onOpen,
}: TaskTableViewProps) {
  return (
    <div className="glass overflow-hidden rounded-2xl flex-1 min-h-0">
      <div className="overflow-auto h-full">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="sticky top-0 z-10 bg-[rgba(18,18,22,0.95)] backdrop-blur">
            <tr className="text-left eyebrow border-b border-white/8">
              <th className="py-3 px-4">Title</th>
              <th className="py-3 px-4">Project</th>
              <th className="py-3 px-4">Assignees</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Due</th>
              <th className="py-3 px-4">Progress</th>
              <th className="py-3 px-4 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const project = projectMap[task.project_id];
              const assignees = task.assignee_ids.map((id) => userMap[id]).filter(Boolean);
              const shade = project?.color || "graphite";
              return (
                <tr
                  key={task.id}
                  onClick={() => onOpen(task.id)}
                  className="table-row cursor-pointer hover:bg-white/4 transition"
                >
                  <td className="py-3 px-4">
                    <span className="text-white/90 font-medium">{task.title}</span>
                  </td>
                  <td className="py-3 px-4">
                    {project ? <MonoBadge shade={shade}>{project.name}</MonoBadge> : "—"}
                  </td>
                  <td className="py-3 px-4">
                    <AssigneeAvatars assignees={assignees} size={22} />
                  </td>
                  <td className="py-3 px-4">
                    <span className="chip inline-flex items-center gap-1.5">
                      <StatusDot variant={task.status === "done" ? "bright" : "dim"} />
                      {STATUS_LABELS[task.status as TaskStatus]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 capitalize">
                      <span className="dot" style={{ background: PRIORITY_DOTS[task.priority as Priority] }} />
                      {task.priority}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-white/50 text-xs">
                    {task.due_date ? fmtDate(task.due_date) : "—"}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <div className="progress-track flex-1">
                        <div className="progress-fill" style={{ width: `${task.progress ?? 0}%` }} />
                      </div>
                      <span className="text-[10px] text-white/40 mono w-8">{task.progress ?? 0}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-white/30 text-xs">
                    {commentCounts[task.id] ? commentCounts[task.id] : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!tasks.length && (
          <p className="text-center text-sm text-white/30 py-12">No tasks match your filters.</p>
        )}
      </div>
    </div>
  );
}
