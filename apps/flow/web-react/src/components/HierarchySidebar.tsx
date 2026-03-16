import { useState, useEffect } from "react";
import type React from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  FolderKanban,
  Rocket,
  Check,
  X,
  PanelLeftClose,
  PanelLeft,
  Square,
  GripVertical,
} from "lucide-react";
import { useHierarchy, Effort, Goal, Project } from "@/hooks/useHierarchy";
import {
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface HierarchySidebarProps {
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  teamId?: string | null;
  assignedTaskIds?: Set<string>;
}

// Draggable Task Component
function DraggableTask({
  task,
  isAssigned = false,
}: {
  task: { id: string; title: string; project_id: string };
  isAssigned?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `hierarchy-task-${task.id}`, // Prefix to avoid conflicts
    data: {
      type: 'hierarchy-task',
      task,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start py-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="mr-2 mt-0.5 cursor-grab shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <Square className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
      <span className="flex-1 break-words whitespace-normal leading-5">
        {task.title}
      </span>
      <span className="ml-2 mt-0.5 w-4 shrink-0 flex justify-center">
        {isAssigned ? (
          <ArrowRight className="h-4 w-4 text-primary" />
        ) : (
          <span className="h-4 w-4" />
        )}
      </span>
    </div>
  );
}

export function HierarchySidebar({
  selectedProjectId,
  onSelectProject,
  collapsed = false,
  onToggleCollapse,
  teamId,
  assignedTaskIds,
}: HierarchySidebarProps) {
  const {
    efforts,
    goals,
    projects,
    tasks,
    loading,
    addEffort,
    updateEffort,
    deleteEffort,
    addGoal,
    updateGoal,
    deleteGoal,
    addProject,
    updateProject,
    deleteProject,
    addTask,
  } = useHierarchy(teamId);
  
  const [expandedEfforts, setExpandedEfforts] = useState<Set<string>>(
    new Set(),
  );
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );
  const [initialized, setInitialized] = useState(false);

  // Auto-expand first effort on initial load
  useEffect(() => {
    if (!loading && efforts.length > 0 && !initialized) {
      const firstEffort = efforts[0];
      setExpandedEfforts(new Set([firstEffort.id]));
      setInitialized(true);
    }
  }, [loading, efforts, initialized]);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [addingTo, setAddingTo] = useState<{
    type: "effort" | "project";
    parentId?: string;
  } | null>(null);
  const [newItemName, setNewItemName] = useState("");

  // Entire hierarchy panel is a drop target for "remove from sprint"
  const { setNodeRef: setHierarchyDropRef, isOver: isHierarchyDropOver } =
    useDroppable({
      id: "hierarchy-control",
      data: {
        type: "hierarchy",
      },
    });

  const toggleEffort = (id: string) => {
    setExpandedEfforts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStartEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingValue(currentName);
  };

  const handleSaveEdit = async (type: "effort" | "project") => {
    if (!editingId || !editingValue.trim()) return;

    if (type === "effort") await updateEffort(editingId, editingValue.trim());
    else await updateProject(editingId, editingValue.trim());

    setEditingId(null);
    setEditingValue("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingValue("");
  };

  const handleAdd = async () => {
    if (!addingTo || !newItemName.trim()) return;

    if (addingTo.type === "effort") {
      const { data } = await addEffort(newItemName.trim());
      if (data) setExpandedEfforts((prev) => new Set([...prev, data.id]));
    } else if (addingTo.type === "project" && addingTo.parentId) {
      await addProject(addingTo.parentId, newItemName.trim());
    } else if (addingTo.type === "task" && addingTo.parentId) {
      await addTask(addingTo.parentId, newItemName.trim());
    }

    setAddingTo(null);
    setNewItemName("");
  };

  const handleDelete = async (type: "effort" | "project", id: string) => {
    if (type === "effort") await deleteEffort(id);
    else {
      await deleteProject(id);
      if (selectedProjectId === id) onSelectProject(null);
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          "border-r border-border bg-card p-4 transition-all",
          collapsed ? "w-12" : "w-96",
        )}
      >
        <div className="animate-pulse text-muted-foreground text-sm">
          Loading...
        </div>
      </div>
    );
  }

  // Show message if no teamId provided
  if (!teamId) {
    return (
      <div
        className={cn(
          "border-r border-border bg-card p-4 transition-all",
          collapsed ? "w-12" : "w-96",
        )}
      >
        <div className="text-muted-foreground text-sm text-center py-4">
          <p className="font-medium mb-2">No team selected</p>
          <p className="text-xs">Please select a team to view the hierarchy</p>
        </div>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="w-12 border-r border-border bg-card flex flex-col h-full">
        <div className="p-2 border-b border-border flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onToggleCollapse}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
      <div
        ref={setHierarchyDropRef}
        className={cn(
          "w-96 border-r border-border bg-card flex flex-col h-full transition-colors",
          isHierarchyDropOver && "bg-primary/5 ring-2 ring-primary/40"
        )}
      >
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Hierarchy</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setAddingTo({ type: "effort" })}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onToggleCollapse}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Add new effort input */}
          {addingTo?.type === "effort" && !addingTo.parentId && (
            <div className="flex items-center gap-1 mb-2 pl-2">
              <Input
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Effort name..."
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") setAddingTo(null);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleAdd}
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setAddingTo(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {efforts.map((effort) => (
            <div key={effort.id} className="mb-1">
              {/* Effort row */}
              <div className="flex items-center group">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => toggleEffort(effort.id)}
                >
                  {expandedEfforts.has(effort.id) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>

                {editingId === effort.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      className="h-6 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit("effort");
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleSaveEdit("effort")}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleCancelEdit}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Rocket className="h-3 w-3 mr-1.5 text-accent shrink-0" />
                    <span className="text-sm truncate flex-1">
                      {effort.name}
                    </span>
                    <div className="hidden group-hover:flex items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          setAddingTo({ type: "project", parentId: effort.id })
                        }
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleStartEdit(effort.id, effort.name)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleDelete("effort", effort.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* Projects directly under effort (no goals layer) */}
              {expandedEfforts.has(effort.id) && (
                <div className="ml-4 border-l border-border pl-2">
                  {/* Add project input */}
                  {addingTo?.type === "project" &&
                    addingTo.parentId === effort.id && (
                      <div className="flex items-center gap-1 my-1">
                        <Input
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          placeholder="Project name..."
                          className="h-6 text-xs"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAdd();
                            if (e.key === "Escape") setAddingTo(null);
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={handleAdd}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setAddingTo(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                  {projects
                    .filter((p) => p.effort_id === effort.id)
                    .map((project) => {
                      const projectTasks = tasks.filter((t) => t.project_id === project.id);
                      const isProjectExpanded = expandedProjects.has(project.id);
                      
                      return (
                          <div key={project.id}>
                            <div className="flex items-center group py-0.5">
                            {/* Expand/collapse button for projects */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => toggleProject(project.id)}
                            >
                              {isProjectExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </Button>

                            {editingId === project.id ? (
                              <div className="flex items-center gap-1 flex-1 ml-2">
                                <Input
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  className="h-6 text-xs"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleSaveEdit("project");
                                    if (e.key === "Escape") handleCancelEdit();
                                  }}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleSaveEdit("project")}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={handleCancelEdit}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                className={cn(
                                  "flex items-center flex-1 px-2 py-1 rounded text-sm hover:bg-secondary/50 transition-colors",
                                  selectedProjectId === project.id &&
                                    "bg-primary/10 text-primary font-medium",
                                )}
                                onClick={() => onSelectProject(project.id)}
                              >
                                <FolderKanban className="h-3 w-3 mr-1.5 shrink-0" />
                                <span className="truncate">{project.name}</span>
                                {projectTasks.length > 0 && (
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    ({projectTasks.length})
                                  </span>
                                )}
                              </button>
                            )}
                            {editingId !== project.id && (
                              <div className="hidden group-hover:flex items-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    setAddingTo({ type: "task", parentId: project.id })
                                  }
                                  title="Add task"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    handleStartEdit(project.id, project.name)
                                  }
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive"
                                  onClick={() =>
                                    handleDelete("project", project.id)
                                  }
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                          
                          {/* Add task input */}
                          {addingTo?.type === "task" &&
                            addingTo.parentId === project.id && (
                              <div className="flex items-center gap-1 my-1 ml-8">
                                <Input
                                  value={newItemName}
                                  onChange={(e) => setNewItemName(e.target.value)}
                                  placeholder="Task title..."
                                  className="h-6 text-xs"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleAdd();
                                    if (e.key === "Escape") setAddingTo(null);
                                  }}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={handleAdd}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => setAddingTo(null)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}

                          {/* Tasks under project */}
                          {isProjectExpanded && (
                            <div className="ml-8 border-l border-border pl-2">
                              {projectTasks.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-1">
                                  No tasks
                                </div>
                              ) : (
                                projectTasks
                                  .sort((a, b) => a.order_index - b.order_index)
                                  .map((task) => (
                                    <DraggableTask
                                      key={task.id}
                                      task={task}
                                      isAssigned={assignedTaskIds?.has(task.id)}
                                    />
                                  ))
                              )}
                            </div>
                          )}
                          </div>
                      );
                    })}

                  {projects.filter((p) => p.effort_id === effort.id).length ===
                    0 &&
                    addingTo?.parentId !== effort.id && (
                      <div className="text-xs text-muted-foreground py-1">
                        No projects
                      </div>
                    )}
                </div>
              )}
            </div>
          ))}

          {efforts.length === 0 && !addingTo && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No efforts yet. Click + to add one.
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Show all tasks button */}
      <div className="p-2 border-t border-border">
        <Button
          variant={selectedProjectId === null ? "default" : "outline"}
          size="sm"
          className="w-full"
          onClick={() => onSelectProject(null)}
        >
          Show All Tasks
        </Button>
      </div>

      </div>
  );
}
