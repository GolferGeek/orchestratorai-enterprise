import { useRef, useState } from 'react';
import { FileTreeNode } from '@/hooks/useTeamFiles';
import { CreateTeamFileDto } from '@/services/flowApiService';
import { FileTreeItem } from './FileTreeItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FilePlus, FolderPlus, Upload } from 'lucide-react';

interface DocumentsSidebarProps {
  fileTree: FileTreeNode[];
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCreateFile: (dto: CreateTeamFileDto) => void;
  onRename: (fileId: string, newName: string) => void;
  onDelete: (fileId: string, name: string) => void;
}

type DialogMode = 'new-file' | 'new-folder' | null;

export function DocumentsSidebar({
  fileTree,
  selectedFileId,
  onSelectFile,
  onCreateFile,
  onRename,
  onDelete,
}: DocumentsSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [newName, setNewName] = useState('');
  const [newFileType, setNewFileType] = useState('markdown');
  const [createParentId, setCreateParentId] = useState<string | undefined>(undefined);

  const handleCreateSubmit = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (dialogMode === 'new-folder') {
      onCreateFile({
        name: trimmed,
        isFolder: true,
        parentId: createParentId,
      });
    } else {
      onCreateFile({
        name: trimmed,
        isFolder: false,
        fileType: newFileType,
        content: '',
        parentId: createParentId,
      });
    }

    setDialogMode(null);
    setNewName('');
    setCreateParentId(undefined);
  };

  const handleCreateInFolder = (parentId: string, isFolder: boolean) => {
    setCreateParentId(parentId);
    setDialogMode(isFolder ? 'new-folder' : 'new-file');
    setNewName('');
  };

  const openNewFileDialog = () => {
    setCreateParentId(undefined);
    setDialogMode('new-file');
    setNewName('');
  };

  const openNewFolderDialog = () => {
    setCreateParentId(undefined);
    setDialogMode('new-folder');
    setNewName('');
  };

  const inferFileType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (ext === 'txt') return 'plaintext';
    return 'code';
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onCreateFile({
        name: file.name,
        isFolder: false,
        content,
        fileType: inferFileType(file.name),
        parentId: createParentId,
      });
    };
    reader.readAsText(file);
    // Reset so same file can be re-uploaded
    event.target.value = '';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={openNewFileDialog}>
          <FilePlus className="w-3.5 h-3.5" />
          <span className="text-xs">File</span>
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={openNewFolderDialog}>
          <FolderPlus className="w-3.5 h-3.5" />
          <span className="text-xs">Folder</span>
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" />
          <span className="text-xs">Upload</span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".txt,.md,.markdown,.ts,.tsx,.js,.jsx,.py,.rs,.go,.json,.yaml,.yml,.toml,.css,.html,.xml,.sh,.sql,.env,.cfg,.ini,.csv"
          onChange={handleFileUpload}
        />
      </div>

      {/* File Tree */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {fileTree.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-8 px-4">
              No documents yet. Create a file or folder to get started.
            </div>
          ) : (
            fileTree.map((node) => (
              <FileTreeItem
                key={node.file.id}
                node={node}
                depth={0}
                selectedFileId={selectedFileId}
                onSelectFile={onSelectFile}
                onCreateInFolder={handleCreateInFolder}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Create Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'new-folder' ? 'New Folder' : 'New File'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSubmit()}
                placeholder={dialogMode === 'new-folder' ? 'Folder name' : 'file-name.md'}
                autoFocus
              />
            </div>
            {dialogMode === 'new-file' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="type">File Type</Label>
                <Select value={newFileType} onValueChange={setNewFileType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="markdown">Markdown</SelectItem>
                    <SelectItem value="plaintext">Plain Text</SelectItem>
                    <SelectItem value="code">Code</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubmit} disabled={!newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
