import { useState, useCallback } from 'react';
import { useTeamFiles } from '@/hooks/useTeamFiles';
import { CreateTeamFileDto } from '@/services/flowApiService';
import { DocumentsSidebar } from './DocumentsSidebar';
import { DocumentEditor } from './DocumentEditor';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DocumentsTabProps {
  teamId?: string | null;
}

export function DocumentsTab({ teamId }: DocumentsTabProps) {
  const { fileTree, loading, createFile, updateFile, deleteFile, loadFileContent } = useTeamFiles(teamId);

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ id: string; name: string; fileType: string } | null>(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleSelectFile = useCallback(async (fileId: string) => {
    // Load file content from API
    const file = await loadFileContent(fileId);
    setSelectedFileId(fileId);
    setSelectedFile({ id: file.id, name: file.name, fileType: file.fileType });
    setContent(file.content || '');
    setSavedContent(file.content || '');
    setIsDirty(false);
  }, [loadFileContent]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setIsDirty(newContent !== savedContent);
  }, [savedContent]);

  const handleSave = useCallback(async () => {
    if (!selectedFileId || !isDirty) return;
    setSaving(true);
    await updateFile(selectedFileId, { content });
    setSavedContent(content);
    setIsDirty(false);
    setSaving(false);
  }, [selectedFileId, isDirty, content, updateFile]);

  const handleCreateFile = useCallback(async (dto: CreateTeamFileDto) => {
    const created = await createFile(dto);
    // If we created a file (not folder), select it
    if (created && !dto.isFolder) {
      setSelectedFileId(created.id);
      setSelectedFile({ id: created.id, name: created.name, fileType: created.fileType });
      setContent(created.content || '');
      setSavedContent(created.content || '');
      setIsDirty(false);
    }
  }, [createFile]);

  const handleRename = useCallback(async (fileId: string, newName: string) => {
    await updateFile(fileId, { name: newName });
    // Update selected file name if it's the one being renamed
    if (selectedFile && selectedFile.id === fileId) {
      setSelectedFile({ ...selectedFile, name: newName });
    }
  }, [updateFile, selectedFile]);

  const handleDeleteRequest = useCallback((fileId: string, name: string) => {
    setDeleteTarget({ id: fileId, name });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    // If deleting the selected file, deselect
    if (selectedFileId === deleteTarget.id) {
      setSelectedFileId(null);
      setSelectedFile(null);
      setContent('');
      setSavedContent('');
      setIsDirty(false);
    }
    await deleteFile(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, selectedFileId, deleteFile]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">Loading documents...</div>
      </div>
    );
  }

  // Build a simple file response object for the editor from selected state
  const editorFile = selectedFile ? {
    id: selectedFile.id,
    teamId: teamId || '',
    parentId: null,
    name: selectedFile.name,
    isFolder: false,
    content,
    fileType: selectedFile.fileType,
    sizeBytes: 0,
    createdByUserId: null,
    createdAt: '',
    updatedAt: '',
  } : null;

  return (
    <>
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
          <DocumentsSidebar
            fileTree={fileTree}
            selectedFileId={selectedFileId}
            onSelectFile={handleSelectFile}
            onCreateFile={handleCreateFile}
            onRename={handleRename}
            onDelete={handleDeleteRequest}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75}>
          <DocumentEditor
            file={editorFile}
            content={content}
            onContentChange={handleContentChange}
            onSave={handleSave}
            isDirty={isDirty}
            saving={saving}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this item and all of its contents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
