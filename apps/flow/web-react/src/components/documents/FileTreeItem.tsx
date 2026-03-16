import { useState, useRef, useEffect } from 'react';
import { FileTreeNode } from '@/hooks/useTeamFiles';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FolderClosed,
  FileText,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCreateInFolder: (parentId: string, isFolder: boolean) => void;
  onRename: (fileId: string, newName: string) => void;
  onDelete: (fileId: string, name: string) => void;
}

export function FileTreeItem({
  node,
  depth,
  selectedFileId,
  onSelectFile,
  onCreateInFolder,
  onRename,
  onDelete,
}: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.file.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.file.name) {
      onRename(node.file.id, trimmed);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setRenameValue(node.file.name);
      setIsRenaming(false);
    }
  };

  const handleClick = () => {
    if (node.file.isFolder) {
      setIsOpen(!isOpen);
    } else {
      onSelectFile(node.file.id);
    }
  };

  const isSelected = !node.file.isFolder && node.file.id === selectedFileId;

  const itemContent = (
    <div
      className={cn(
        'flex items-center gap-1.5 py-1 px-2 rounded-sm cursor-pointer text-sm hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent text-accent-foreground',
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={handleClick}
    >
      {node.file.isFolder ? (
        <>
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          )}
          {isOpen ? (
            <FolderOpen className="w-4 h-4 shrink-0 text-amber-500" />
          ) : (
            <FolderClosed className="w-4 h-4 shrink-0 text-amber-500" />
          )}
        </>
      ) : (
        <>
          <span className="w-3.5 shrink-0" />
          <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
        </>
      )}

      {isRenaming ? (
        <Input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={handleRenameKeyDown}
          className="h-5 text-sm py-0 px-1"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate">{node.file.name}</span>
      )}
    </div>
  );

  const contextMenuItems = (
    <ContextMenuContent>
      {node.file.isFolder && (
        <>
          <ContextMenuItem onClick={() => onCreateInFolder(node.file.id, false)}>
            <FilePlus className="w-4 h-4 mr-2" />
            New File
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCreateInFolder(node.file.id, true)}>
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </ContextMenuItem>
        </>
      )}
      <ContextMenuItem onClick={() => {
        setRenameValue(node.file.name);
        setIsRenaming(true);
      }}>
        <Pencil className="w-4 h-4 mr-2" />
        Rename
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => onDelete(node.file.id, node.file.name)}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );

  if (node.file.isFolder) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <CollapsibleTrigger asChild>
              {itemContent}
            </CollapsibleTrigger>
          </ContextMenuTrigger>
          {contextMenuItems}
        </ContextMenu>
        <CollapsibleContent>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.file.id}
              node={child}
              depth={depth + 1}
              selectedFileId={selectedFileId}
              onSelectFile={onSelectFile}
              onCreateInFolder={onCreateInFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {itemContent}
      </ContextMenuTrigger>
      {contextMenuItems}
    </ContextMenu>
  );
}
