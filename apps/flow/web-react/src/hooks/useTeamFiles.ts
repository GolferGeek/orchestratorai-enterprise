import { useState, useEffect, useCallback, useMemo } from 'react';
import { flowApiService, TeamFileResponse, CreateTeamFileDto, UpdateTeamFileDto } from '@/services/flowApiService';

export interface FileTreeNode {
  file: TeamFileResponse;
  children: FileTreeNode[];
}

function buildTree(files: TeamFileResponse[]): FileTreeNode[] {
  const map = new Map<string, FileTreeNode>();
  const roots: FileTreeNode[] = [];

  // Create nodes
  files.forEach(f => map.set(f.id, { file: f, children: [] }));

  // Build relationships
  files.forEach(f => {
    const node = map.get(f.id)!;
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort: folders first, then alphabetical
  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.file.isFolder !== b.file.isFolder) return a.file.isFolder ? -1 : 1;
      return a.file.name.localeCompare(b.file.name);
    });
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

export function useTeamFiles(teamId?: string | null) {
  const [files, setFiles] = useState<TeamFileResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch files
  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    const fetchFiles = async () => {
      try {
        const data = await flowApiService.getTeamFiles(teamId);
        setFiles(data);
      } catch (error) {
        console.error('Error fetching team files:', error);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchFiles, 5000);
    return () => clearInterval(interval);
  }, [teamId]);

  // Build tree from flat list
  const fileTree = useMemo(() => buildTree(files), [files]);

  const createFile = useCallback(async (dto: CreateTeamFileDto): Promise<TeamFileResponse | null> => {
    if (!teamId) return null;
    const created = await flowApiService.createTeamFile(teamId, dto);
    setFiles(prev => [...prev, created]);
    return created;
  }, [teamId]);

  const updateFile = useCallback(async (fileId: string, dto: UpdateTeamFileDto): Promise<TeamFileResponse | null> => {
    if (!teamId) return null;
    const updated = await flowApiService.updateTeamFile(teamId, fileId, dto);
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ...updated } : f));
    return updated;
  }, [teamId]);

  const deleteFile = useCallback(async (fileId: string): Promise<void> => {
    if (!teamId) return;
    // Optimistic: remove from state (including children since cascade)
    const idsToRemove = new Set<string>();
    const collectChildren = (parentId: string) => {
      idsToRemove.add(parentId);
      files.filter(f => f.parentId === parentId).forEach(f => collectChildren(f.id));
    };
    collectChildren(fileId);

    setFiles(prev => prev.filter(f => !idsToRemove.has(f.id)));
    await flowApiService.deleteTeamFile(teamId, fileId);
  }, [teamId, files]);

  const loadFileContent = useCallback(async (fileId: string): Promise<TeamFileResponse> => {
    if (!teamId) throw new Error('No team selected');
    return flowApiService.getTeamFile(teamId, fileId);
  }, [teamId]);

  return { files, fileTree, loading, createFile, updateFile, deleteFile, loadFileContent };
}
