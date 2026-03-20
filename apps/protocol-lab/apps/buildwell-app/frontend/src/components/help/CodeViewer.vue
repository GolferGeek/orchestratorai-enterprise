<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { CodeReference } from '@agent-communication/shared-protocols';

const props = defineProps<{
  codeRef: CodeReference;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const content = ref('');
const totalLines = ref(0);
const loading = ref(false);
const error = ref('');

async function loadSource() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch(`/api/source?file=${encodeURIComponent(props.codeRef.sourceFile)}`);
    if (!res.ok) {
      error.value = `Failed to load: ${res.statusText}`;
      return;
    }
    const data = await res.json();
    content.value = data.content;
    totalLines.value = data.totalLines;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load source';
  } finally {
    loading.value = false;
  }
}

// Load when component mounts or codeRef changes
watch(() => props.codeRef.sourceFile, loadSource, { immediate: true });

// Line numbers
const lines = computed(() => content.value.split('\n'));

// Simple syntax highlighting (TypeScript keywords, strings, comments)
function highlightLine(line: string): string {
  // HTML-escape first
  let html = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Comments
  if (html.trimStart().startsWith('//')) {
    return `<span class="text-slate-600">${html}</span>`;
  }

  // Strings (single and double quoted)
  html = html.replace(
    /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g,
    '<span class="text-emerald-400">$1</span>',
  );

  // Keywords
  html = html.replace(
    /\b(import|export|from|class|extends|implements|interface|type|const|let|var|function|async|await|return|if|else|for|while|new|this|throw|try|catch|finally|typeof|instanceof|in|of|readonly|private|public|protected|static|abstract|enum|namespace|module|declare|as|is|keyof|infer|never|void|null|undefined|true|false)\b/g,
    '<span class="text-blue-400">$1</span>',
  );

  // Decorators
  html = html.replace(
    /(@\w+)/g,
    '<span class="text-amber-400">$1</span>',
  );

  // Types after colon
  html = html.replace(
    /:\s*(string|number|boolean|any|unknown|Record|Promise|Map|Set|Array)\b/g,
    ': <span class="text-cyan-400">$1</span>',
  );

  return html;
}
</script>

<template>
  <div class="bg-slate-950 border border-slate-700/50 rounded-lg overflow-hidden max-h-[600px] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-slate-700/40 bg-slate-900/80 flex-shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <svg class="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span class="text-sm font-bold text-slate-200">{{ codeRef.className }}</span>
        <span class="text-xxs text-slate-600 font-mono truncate">{{ codeRef.sourceFile }}</span>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="text-xxs text-slate-600">{{ totalLines }} lines</span>
        <button class="text-slate-500 hover:text-slate-300 p-0.5" @click="$emit('close')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Interface file link -->
    <div v-if="codeRef.interfaceFile" class="px-4 py-1.5 bg-slate-900/50 border-b border-slate-800/50 flex-shrink-0">
      <span class="text-xxs text-slate-600">
        Implements interface from
        <span class="font-mono text-slate-500">{{ codeRef.interfaceFile }}</span>
      </span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-4 py-8 text-center">
      <div class="text-sm text-slate-500">Loading source...</div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-4 py-4">
      <div class="text-sm text-red-400 bg-red-950/30 rounded p-3 border border-red-800/50">{{ error }}</div>
    </div>

    <!-- Code -->
    <div v-else class="overflow-auto flex-1">
      <table class="w-full text-xs font-mono leading-relaxed">
        <tbody>
          <tr
            v-for="(line, idx) in lines"
            :key="idx"
            class="hover:bg-slate-800/30"
          >
            <td class="text-right text-slate-700 select-none pr-4 pl-3 py-0 align-top w-10 border-r border-slate-800/50">
              {{ idx + 1 }}
            </td>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <td class="pl-4 pr-3 py-0 whitespace-pre text-slate-300" v-html="highlightLine(line)" />
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
