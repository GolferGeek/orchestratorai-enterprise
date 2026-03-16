import { useState, useEffect, useCallback } from 'react';
import { flowApiService } from '@/services/flowApiService';

export interface JourneyTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  template_data: {
    efforts: Array<{
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      estimated_days?: number;
      projects: Array<{
        name: string;
        description?: string;
        tasks: Array<{
          title: string;
          description?: string;
          documentation_url?: string;
          is_milestone?: boolean;
        }>;
      }>;
    }>;
  };
  is_active: boolean;
  created_at: string;
}

// Map API response to JourneyTemplate interface
function mapTemplateResponse(api: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  templateData: JourneyTemplate['template_data'];
  isActive: boolean;
  createdAt: string;
}): JourneyTemplate {
  return {
    id: api.id,
    slug: api.slug,
    name: api.name,
    description: api.description,
    icon: api.icon,
    template_data: api.templateData,
    is_active: api.isActive,
    created_at: api.createdAt,
  };
}

export function useJourneyTemplates() {
  const [templates, setTemplates] = useState<JourneyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await flowApiService.getJourneyTemplates();
      setTemplates(data.map(mapTemplateResponse));
      setError(null);
    } catch (err) {
      console.error('Error fetching journey templates:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  }, []);

  const getTemplateBySlug = useCallback(async (slug: string) => {
    try {
      const data = await flowApiService.getJourneyTemplateBySlug(slug);
      return mapTemplateResponse(data);
    } catch (err) {
      console.error('Error fetching template:', err);
      throw err;
    }
  }, []);

  // Apply a template to create efforts/projects/tasks for a team
  const applyTemplate = useCallback(async (
    templateSlug: string,
    teamId: string
  ) => {
    const template = await getTemplateBySlug(templateSlug);

    if (!template?.template_data?.efforts) {
      throw new Error('Invalid template data');
    }

    // Create efforts, projects, and tasks from template using API
    for (let effortIndex = 0; effortIndex < template.template_data.efforts.length; effortIndex++) {
      const effortTemplate = template.template_data.efforts[effortIndex];

      // Create effort via API
      const effort = await flowApiService.createEffort(teamId, {
        name: effortTemplate.name,
        description: effortTemplate.description || undefined,
        icon: effortTemplate.icon || undefined,
        color: effortTemplate.color || undefined,
        estimatedDays: effortTemplate.estimated_days || undefined,
        orderIndex: effortIndex,
        status: 'not_started',
      });

      // Create projects for this effort
      for (let projectIndex = 0; projectIndex < (effortTemplate.projects || []).length; projectIndex++) {
        const projectTemplate = effortTemplate.projects[projectIndex];

        const project = await flowApiService.createProject(teamId, {
          effortId: effort.id,
          name: projectTemplate.name,
          description: projectTemplate.description || undefined,
          orderIndex: projectIndex,
          status: 'not_started',
        });

        // Create tasks for this project
        for (let taskIndex = 0; taskIndex < (projectTemplate.tasks || []).length; taskIndex++) {
          const taskTemplate = projectTemplate.tasks[taskIndex];

          await flowApiService.createTask(teamId, {
            projectId: project.id,
            title: taskTemplate.title,
            description: taskTemplate.description || undefined,
            documentationUrl: taskTemplate.documentation_url || undefined,
            isMilestone: taskTemplate.is_milestone || false,
            orderIndex: taskIndex,
            status: 'pending',
          });
        }
      }
    }

    return true;
  }, [getTemplateBySlug]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    getTemplateBySlug,
    applyTemplate,
  };
}
