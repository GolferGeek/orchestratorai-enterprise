import { ref, onMounted } from 'vue';
import { flowApiService } from '@/services/flow-api.service';
import type { JourneyTemplateResponse } from '@/types/flow';

export function useJourneyTemplates() {
  const templates = ref<JourneyTemplateResponse[]>([]);
  const loading = ref(true);

  async function fetchTemplates(): Promise<void> {
    loading.value = true;
    try {
      templates.value = await flowApiService.getJourneyTemplates();
    } finally {
      loading.value = false;
    }
  }

  async function getBySlug(slug: string): Promise<JourneyTemplateResponse> {
    return flowApiService.getJourneyTemplateBySlug(slug);
  }

  onMounted(() => {
    fetchTemplates();
  });

  return {
    templates,
    loading,
    fetchTemplates,
    getBySlug,
  };
}
