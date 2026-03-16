import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Upload,
  Trash2,
  FileText,
  MessageSquare,
  Loader2,
  File,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  Document,
} from './notebook-api';

interface DocumentManagerProps {
  collection: { id: string; name: string };
  onBack: () => void;
  onOpenChat: () => void;
}

export function DocumentManager({
  collection,
  onBack,
  onOpenChat,
}: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listDocuments(collection.id);
      setDocuments(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load documents',
      );
    } finally {
      setLoading(false);
    }
  }, [collection.id]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      setUploading(true);
      setUploadMessage(null);
      setError(null);

      for (const file of Array.from(files)) {
        const result = await uploadDocument(collection.id, file);
        setUploadMessage(
          `${result.filename}: ${result.message}`,
        );
      }

      await loadDocuments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to upload document',
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await deleteDocument(collection.id, docId);
      await loadDocuments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete document',
      );
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{collection.name}</h2>
            <p className="text-sm text-muted-foreground">
              {documents.length} documents
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-2"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload
          </Button>
          <Button onClick={onOpenChat} className="gap-2" disabled={documents.length === 0}>
            <MessageSquare className="w-4 h-4" />
            Ask AI
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.docx"
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      {uploadMessage && (
        <div className="mb-4 p-3 bg-primary/10 text-primary rounded-md text-sm">
          {uploadMessage}
        </div>
      )}

      {/* Content */}
      <div
        className="flex-1 overflow-auto"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <Card className="border-dashed border-2 text-center py-12">
            <CardContent>
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">
                No documents yet. Upload PDF, TXT, MD, or DOCX files.
              </p>
              <p className="text-xs text-muted-foreground">
                Drag and drop files here or click Upload
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50"
              >
                <File className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.filename}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{doc.fileType.toUpperCase()}</span>
                    <span>{formatFileSize(doc.fileSize)}</span>
                    <span>{doc.chunkCount} chunks</span>
                    <span>{doc.status}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                  onClick={() => handleDelete(doc.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
