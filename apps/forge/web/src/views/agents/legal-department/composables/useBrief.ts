import { ref } from 'vue';

export interface BriefData {
  title: string;
  video: string;
  markdown: string;
}

export function useBrief(agentSlug: string, capabilitySlug: string) {
  const loading = ref(false);
  const error = ref('');
  const title = ref('');
  const video = ref('');
  const markdown = ref('');

  async function fetchBrief() {
    loading.value = true;
    error.value = '';
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(
        `/agents/${agentSlug}/brief/${capabilitySlug}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        error.value = res.status === 404 ? 'Brief not found.' : 'Failed to load brief.';
        return;
      }
      const data = await res.json();
      title.value = data.title ?? '';
      video.value = data.video ?? '';
      markdown.value = data.markdown ?? '';
    } catch {
      error.value = 'Failed to load brief.';
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, title, video, markdown, fetchBrief };
}
