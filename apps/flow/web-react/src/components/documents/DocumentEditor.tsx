import { useEffect, useRef } from 'react';
import { TeamFileResponse } from '@/services/flowApiService';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, FileText } from 'lucide-react';

interface DocumentEditorProps {
  file: TeamFileResponse | null;
  content: string;
  onContentChange: (content: string) => void;
  onSave: () => void;
  isDirty: boolean;
  saving: boolean;
}

export function DocumentEditor({
  file,
  content,
  onContentChange,
  onSave,
  isDirty,
  saving,
}: DocumentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !saving) {
          onSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, saving, onSave]);

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <FileText className="w-12 h-12 opacity-30" />
        <p className="text-sm">Select a file to edit</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">{file.name}</span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {file.fileType}
          </Badge>
          <span className="text-xs text-muted-foreground shrink-0">
            {saving ? 'Saving...' : isDirty ? 'Unsaved changes' : 'Saved'}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={!isDirty || saving}
          className="gap-1.5 shrink-0"
        >
          <Save className="w-3.5 h-3.5" />
          Save
        </Button>
      </div>

      {/* Editor */}
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        className="flex-1 resize-none rounded-none border-0 font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
        placeholder="Start typing..."
      />
    </div>
  );
}
