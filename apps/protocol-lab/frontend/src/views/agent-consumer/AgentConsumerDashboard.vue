<script setup lang="ts">
import { ref, computed } from 'vue';
import { marked } from 'marked';

const targetUrl = ref('http://localhost:6403/llms.txt');
const responseText = ref('');
const responseContentType = ref('');
const responseStatus = ref<number | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const history = ref<string[]>([]);

const format = computed(() => {
  const ct = responseContentType.value;
  if (ct.includes('text/markdown')) return 'markdown';
  if (ct.includes('application/json')) return 'json';
  if (ct.includes('text/html')) return 'html';
  if (ct.includes('text/plain')) return 'markdown'; // treat plain text as markdown
  return 'unknown';
});

const formatLabel = computed(() => {
  switch (format.value) {
    case 'markdown': return 'MARKDOWN';
    case 'json': return 'JSON';
    case 'html': return 'HTML';
    default: return responseContentType.value;
  }
});

const formatColor = computed(() => {
  switch (format.value) {
    case 'markdown': return 'bg-green-900 text-green-300';
    case 'json': return 'bg-blue-900 text-blue-300';
    case 'html': return 'bg-yellow-900 text-yellow-300';
    default: return 'bg-gray-700 text-gray-300';
  }
});

// Proxy URLs through Vite dev server
function proxyUrl(url: string): string {
  return url
    .replace('http://localhost:6403', '/research-hub')
    .replace('http://localhost:6404', '/market-pulse')
    .replace('http://localhost:6405', '/content-forge')
    .replace('http://localhost:6406', '/agent-consumer')
    .replace('http://localhost:6402', '/protocol-api');
}

// Resolve relative paths against current URL origin
function resolveUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) {
    try {
      const base = new URL(targetUrl.value);
      return `${base.origin}${url}`;
    } catch {
      return url;
    }
  }
  return url;
}

async function navigate(url: string) {
  const resolved = resolveUrl(url);
  loading.value = true;
  error.value = null;
  responseText.value = '';
  responseContentType.value = '';
  responseStatus.value = null;
  targetUrl.value = resolved;

  if (history.value[0] !== resolved) {
    history.value.unshift(resolved);
    if (history.value.length > 20) history.value.pop();
  }

  try {
    const res = await fetch(proxyUrl(resolved), {
      headers: {
        'Accept': 'text/markdown, application/json;q=0.9, text/html;q=0.8',
      },
    });

    responseStatus.value = res.status;
    responseContentType.value = res.headers.get('content-type') || '';
    responseText.value = await res.text();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

// Render markdown with clickable links that navigate in-browser
const renderedMarkdown = computed(() => {
  if (!responseText.value) return '';
  return marked.parse(responseText.value, { async: false }) as string;
});

// Render JSON with syntax highlighting and clickable links
const renderedJson = computed(() => {
  if (!responseText.value) return '';
  try {
    const obj = JSON.parse(responseText.value);
    return jsonToHtml(obj, 0);
  } catch {
    return escapeHtml(responseText.value);
  }
});

function jsonToHtml(data: unknown, indent: number): string {
  const pad = '  '.repeat(indent);

  if (data === null) return `<span class="jv-null">null</span>`;
  if (typeof data === 'boolean') return `<span class="jv-bool">${data}</span>`;
  if (typeof data === 'number') return `<span class="jv-num">${data}</span>`;

  if (typeof data === 'string') {
    const isUrl = data.startsWith('http://') || data.startsWith('https://');
    const isPath = data.startsWith('/') && data.length > 1 && !data.includes(' ');
    if (isUrl || isPath) {
      return `<a class="jv-link" data-nav-url="${escapeHtml(data)}">"${escapeHtml(data)}"</a>`;
    }
    return `<span class="jv-str">"${escapeHtml(data)}"</span>`;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return `<span class="jv-brace">[]</span>`;
    const items = data.map((item, i) => {
      const comma = i < data.length - 1 ? '<span class="jv-punct">,</span>' : '';
      return `${pad}  ${jsonToHtml(item, indent + 1)}${comma}`;
    });
    return `<span class="jv-brace">[</span>\n${items.join('\n')}\n${pad}<span class="jv-brace">]</span>`;
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return `<span class="jv-brace">{}</span>`;
    const items = entries.map(([key, value], i) => {
      const comma = i < entries.length - 1 ? '<span class="jv-punct">,</span>' : '';
      return `${pad}  <span class="jv-key">"${escapeHtml(key)}"</span><span class="jv-punct">: </span>${jsonToHtml(value, indent + 1)}${comma}`;
    });
    return `<span class="jv-brace">{</span>\n${items.join('\n')}\n${pad}<span class="jv-brace">}</span>`;
  }

  return escapeHtml(String(data));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Handle clicks on links inside rendered content
function handleContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement;

  // Handle JSON viewer links
  const navLink = target.closest('[data-nav-url]') as HTMLElement | null;
  if (navLink) {
    e.preventDefault();
    const url = navLink.dataset.navUrl;
    if (url) navigate(url);
    return;
  }

  // Handle markdown links
  const anchor = target.closest('a') as HTMLAnchorElement | null;
  if (anchor) {
    const href = anchor.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      e.preventDefault();
      navigate(href);
    }
  }
}

function handleSubmit() {
  navigate(targetUrl.value);
}

// Auto-navigate on load
navigate(targetUrl.value);
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div>
      <p class="text-xs text-gray-400 mb-2">
        Agent Content Browser — sends <code class="text-green-400">Accept: text/markdown</code> to any URL
      </p>
      <form class="flex gap-2" @submit.prevent="handleSubmit">
        <input
          v-model="targetUrl"
          type="text"
          placeholder="http://localhost:6403/llms.txt"
          class="input-field flex-1 font-mono text-sm"
        />
        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? '...' : 'Go' }}
        </button>
      </form>
    </div>

    <!-- Quick targets -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="target in [
          { label: 'llms.txt', url: 'http://localhost:6403/llms.txt' },
          { label: 'Agent Card', url: 'http://localhost:6403/.well-known/agent.json' },
          { label: 'Categories', url: 'http://localhost:6403/api/categories' },
          { label: 'Articles', url: 'http://localhost:6403/api/articles' },
          { label: 'Signals', url: 'http://localhost:6403/agent/signals' },
          { label: 'Narrative', url: 'http://localhost:6403/agent/narrative/pragmatist' },
          { label: 'llms-full.txt', url: 'http://localhost:6403/llms-full.txt' },
        ]"
        :key="target.url"
        class="text-xs px-2 py-1 rounded bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600 transition-colors"
        @click="navigate(target.url)"
      >
        {{ target.label }}
      </button>
    </div>

    <!-- Response status -->
    <div v-if="responseStatus !== null" class="flex items-center gap-4 text-sm">
      <span
        :class="[
          'font-mono font-bold',
          responseStatus < 300 ? 'text-green-400' :
          responseStatus < 400 ? 'text-yellow-400' : 'text-red-400'
        ]"
      >
        {{ responseStatus }}
      </span>
      <span class="text-gray-400">
        Content-Type: <code :class="format === 'markdown' ? 'text-green-400' : format === 'json' ? 'text-blue-400' : 'text-yellow-400'">{{ responseContentType }}</code>
      </span>
      <span :class="['text-xs px-2 py-0.5 rounded', formatColor]">{{ formatLabel }}</span>
    </div>

    <!-- Error -->
    <div v-if="error" class="card border-red-500">
      <p class="text-red-400 text-sm font-mono">{{ error }}</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="card text-center py-8">
      <p class="text-gray-400">Fetching with Accept: text/markdown...</p>
    </div>

    <!-- Markdown response -->
    <div
      v-else-if="format === 'markdown' && responseText"
      class="markdown-body card overflow-hidden"
      @click="handleContentClick"
    >
      <div class="prose" v-html="renderedMarkdown" />
    </div>

    <!-- JSON response -->
    <div
      v-else-if="format === 'json' && responseText"
      class="json-viewer card overflow-hidden p-0"
      @click="handleContentClick"
    >
      <pre
        class="p-4 overflow-auto text-sm font-mono leading-relaxed"
        style="max-height: calc(100vh - 320px);"
        v-html="renderedJson"
      />
    </div>

    <!-- HTML response (iframe) -->
    <div v-else-if="format === 'html' && responseText" class="card overflow-hidden p-0">
      <div class="bg-gray-700 px-3 py-2 text-xs text-yellow-300 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        This server returned HTML — it doesn't support agent content negotiation
      </div>
      <iframe
        :srcdoc="responseText"
        class="w-full bg-white"
        style="height: calc(100vh - 360px); min-height: 400px;"
        sandbox="allow-same-origin"
      />
    </div>

    <!-- History -->
    <div v-if="history.length > 1" class="text-xs text-gray-500">
      <p class="mb-1">History:</p>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="(url, i) in history.slice(0, 10)"
          :key="i"
          class="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors font-mono truncate max-w-xs"
          @click="navigate(url)"
        >
          {{ url }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* JSON viewer */
.json-viewer :deep(.jv-key) { color: #c792ea; }
.json-viewer :deep(.jv-str) { color: #c3e88d; }
.json-viewer :deep(.jv-num) { color: #f78c6c; }
.json-viewer :deep(.jv-bool) { color: #ff9cac; }
.json-viewer :deep(.jv-null) { color: #697098; font-style: italic; }
.json-viewer :deep(.jv-brace) { color: #89ddff; }
.json-viewer :deep(.jv-punct) { color: #89ddff; }
.json-viewer :deep(.jv-link) {
  color: #82aaff;
  text-decoration: underline;
  cursor: pointer;
}
.json-viewer :deep(.jv-link:hover) { color: #b4d0ff; }

/* Markdown prose */
.markdown-body :deep(.prose) {
  color: #e2e8f0;
  max-width: none;
}
.markdown-body :deep(.prose h1) {
  color: #f1f5f9;
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid #334155;
  padding-bottom: 0.5rem;
}
.markdown-body :deep(.prose h2) {
  color: #e2e8f0;
  font-size: 1.2rem;
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}
.markdown-body :deep(.prose h3) {
  color: #cbd5e1;
  font-size: 1rem;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.25rem;
}
.markdown-body :deep(.prose p) {
  color: #94a3b8;
  font-size: 0.875rem;
  line-height: 1.6;
  margin-bottom: 0.75rem;
}
.markdown-body :deep(.prose a) {
  color: #82aaff;
  text-decoration: underline;
  cursor: pointer;
}
.markdown-body :deep(.prose a:hover) { color: #b4d0ff; }
.markdown-body :deep(.prose ul) {
  list-style: disc;
  padding-left: 1.5rem;
  margin-bottom: 0.75rem;
}
.markdown-body :deep(.prose li) {
  color: #94a3b8;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}
.markdown-body :deep(.prose strong) { color: #e2e8f0; }
.markdown-body :deep(.prose em) { color: #64748b; }
.markdown-body :deep(.prose code) {
  color: #c3e88d;
  background: #1e293b;
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.8rem;
}
.markdown-body :deep(.prose pre) {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  padding: 1rem;
  overflow-x: auto;
  margin-bottom: 1rem;
}
.markdown-body :deep(.prose pre code) {
  background: none;
  padding: 0;
}
.markdown-body :deep(.prose blockquote) {
  border-left: 3px solid #475569;
  padding-left: 1rem;
  margin-bottom: 1rem;
  color: #64748b;
  font-style: italic;
}
.markdown-body :deep(.prose hr) {
  border-color: #334155;
  margin: 1.5rem 0;
}
</style>
