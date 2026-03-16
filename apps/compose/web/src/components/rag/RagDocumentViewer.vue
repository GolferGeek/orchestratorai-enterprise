<template>
  <ion-modal :is-open="isOpen" @didDismiss="close" class="rag-document-modal">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ documentTitle }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="close">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="document-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <ion-spinner />
        <p>Loading document...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <ion-icon :icon="alertCircleOutline" color="danger" />
        <p>{{ error }}</p>
        <ion-button fill="outline" @click="loadDocument">Retry</ion-button>
      </div>

      <!-- Document Content -->
      <div v-else-if="documentContent && documentContent.content" class="document-wrapper">
        <!-- Source Info Header -->
        <div class="source-info-header">
          <div class="source-metadata">
            <ion-badge color="secondary">{{ source.score }}% match</ion-badge>
            <span v-if="source.sectionPath" class="section-path">
              <ion-icon :icon="navigateOutline" />
              {{ source.sectionPath }}
            </span>
          </div>
          <ion-button
            v-if="highlightPosition"
            fill="outline"
            size="small"
            @click="scrollToHighlight"
          >
            <ion-icon :icon="locateOutline" slot="start" />
            Jump to Citation
          </ion-button>
        </div>

        <!-- Markdown Content -->
        <!-- eslint-disable vue/no-v-html -->
        <div
          ref="contentContainer"
          class="markdown-content"
          v-html="renderedContent"
          @click="handleContentClick"
        />
        <!-- eslint-enable vue/no-v-html -->
      </div>

      <!-- No Content -->
      <div v-else class="empty-state">
        <ion-icon :icon="documentOutline" />
        <p>{{ documentContent ? 'Document content not stored' : 'No document content available' }}</p>
        <p v-if="documentContent" class="empty-hint">
          The document was processed but original content was not retained.
        </p>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSpinner,
  IonBadge,
} from '@ionic/vue';
import {
  closeOutline,
  alertCircleOutline,
  documentOutline,
  navigateOutline,
  locateOutline,
} from 'ionicons/icons';
import { marked } from 'marked';
import { ragService, type RagSource, type RagDocumentContent } from '@/services/ragService';
import { useRbacStore } from '@/stores/rbacStore';

const props = defineProps<{
  isOpen: boolean;
  source: RagSource;
  organizationSlug: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const rbacStore = useRbacStore();
const loading = ref(false);
const error = ref<string | null>(null);
const documentContent = ref<RagDocumentContent | null>(null);
const contentContainer = ref<HTMLElement | null>(null);

// We need the collection ID to fetch content - try to get it from agent context
// For now, we'll use a placeholder collection ID since the document ID is unique
const collectionId = ref<string>('placeholder');
const searchHighlight = ref<string | null>(null); // Text to highlight when navigating to linked docs

const documentTitle = computed(() => {
  if (documentContent.value?.filename) {
    return formatDocumentName(documentContent.value.filename);
  }
  return formatDocumentName(props.source.document);
});

const highlightPosition = computed(() => {
  return props.source.charOffset !== undefined ? props.source.charOffset : null;
});

const renderedContent = computed(() => {
  if (!documentContent.value?.content) return '';

  let content = documentContent.value.content;
  let highlighted = false;

  // Priority 1: Try to find and highlight the RAG excerpt in the document
  // This is the text that was retrieved by the RAG search
  if (!highlighted && props.source.excerpt) {
    // Clean the excerpt - remove ellipsis and extra whitespace
    const excerptClean = props.source.excerpt
      .replace(/\.{3,}/g, '') // Remove ellipsis
      .replace(/\s+/g, ' ')   // Normalize whitespace
      .trim();

    // Extract meaningful sentences/phrases from the excerpt
    // Split by sentence endings and get the first complete sentence(s)
    const sentences = excerptClean.split(/(?<=[.!?])\s+/);
    const firstSentence = sentences[0]?.trim() || '';

    // Try multiple search strategies
    let excerptStart = -1;
    let matchLength = 0;

    // Strategy 1: Find the first complete sentence
    if (firstSentence.length > 20) {
      excerptStart = content.indexOf(firstSentence);
      if (excerptStart !== -1) {
        matchLength = excerptClean.length;
        console.log('🎯 Strategy 1: Found first sentence match');
      }
    }

    // Strategy 2: Find a unique phrase (words 2-6 to skip common starting words)
    if (excerptStart === -1) {
      const words = excerptClean.split(/\s+/);
      if (words.length >= 6) {
        // Try middle portion of text - more unique
        const searchPhrase = words.slice(2, 8).join(' ');
        const phraseStart = content.indexOf(searchPhrase);
        if (phraseStart !== -1) {
          // Expand to find word boundary at start
          let start = phraseStart;
          while (start > 0 && /\S/.test(content[start - 1])) {
            start--;
          }
          excerptStart = start;
          matchLength = Math.min(excerptClean.length, content.length - start);
          console.log('🎯 Strategy 2: Found phrase match at', start);
        }
      }
    }

    // Strategy 3: Find by section/heading context
    if (excerptStart === -1 && props.source.sectionPath) {
      // Try to find the section heading
      const sectionName = props.source.sectionPath.split(' > ').pop() || '';
      if (sectionName) {
        const headingPattern = new RegExp(`#+\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        const headingMatch = content.match(headingPattern);
        if (headingMatch && headingMatch.index !== undefined) {
          // Find the content after the heading
          const afterHeading = content.indexOf('\n', headingMatch.index);
          if (afterHeading !== -1) {
            excerptStart = afterHeading + 1;
            // Find end of paragraph
            const paragraphEnd = content.indexOf('\n\n', excerptStart);
            matchLength = paragraphEnd !== -1 ? paragraphEnd - excerptStart : 200;
            console.log('🎯 Strategy 3: Found section heading match');
          }
        }
      }
    }

    // Strategy 4: Fuzzy match - find longest common substring at word boundaries
    if (excerptStart === -1) {
      const words = excerptClean.split(/\s+/).filter(w => w.length > 3);
      // Try to find 3+ consecutive words
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = words.slice(i, i + 3).join(' ');
        const idx = content.indexOf(phrase);
        if (idx !== -1) {
          // Verify we're at a word boundary
          const beforeChar = idx > 0 ? content[idx - 1] : ' ';
          if (/[\s\n\[\(]/.test(beforeChar) || idx === 0) {
            excerptStart = idx;
            matchLength = Math.min(excerptClean.length, 300);
            console.log('🎯 Strategy 4: Found word sequence match');
            break;
          }
        }
      }
    }

    if (excerptStart !== -1) {
      // Ensure we start at a word boundary
      while (excerptStart > 0 && /\S/.test(content[excerptStart - 1])) {
        excerptStart--;
      }

      // Calculate end position - try to end at a sentence or paragraph
      let highlightEnd = excerptStart + matchLength;

      // Extend to sentence end if close
      const sentenceEnd = content.indexOf('.', highlightEnd);
      if (sentenceEnd !== -1 && sentenceEnd < highlightEnd + 50) {
        highlightEnd = sentenceEnd + 1;
      }

      // Make sure we don't exceed content length
      if (highlightEnd > content.length) {
        highlightEnd = content.length;
      }

      // Don't highlight if too short (likely a false match)
      if (highlightEnd - excerptStart < 20) {
        console.log('⚠️ [RagDocumentViewer] Match too short, skipping highlight');
      } else {
        console.log('🎯 [RagDocumentViewer] Highlighting excerpt at position:', excerptStart, 'to', highlightEnd);

        content =
          content.substring(0, excerptStart) +
          '<mark id="rag-highlight" class="rag-highlight">' +
          content.substring(excerptStart, highlightEnd) +
          '</mark>' +
          content.substring(highlightEnd);
        highlighted = true;
      }
    } else {
      console.log('⚠️ [RagDocumentViewer] Could not find excerpt in document. Excerpt:', excerptClean.substring(0, 50) + '...');
    }
  }

  // Priority 2: If we navigated here via a link and have a search term (reference ID)
  if (!highlighted && searchHighlight.value) {
    const searchIndex = content.indexOf(searchHighlight.value);
    if (searchIndex !== -1) {
      // Find the paragraph or section containing this reference
      let sectionStart = content.lastIndexOf('\n', searchIndex);
      if (sectionStart === -1) sectionStart = 0;
      else sectionStart += 1;

      // Look for the end of the paragraph (double newline or next heading)
      let sectionEnd = content.indexOf('\n\n', searchIndex);
      const nextHeading = content.indexOf('\n#', searchIndex);
      if (nextHeading !== -1 && (sectionEnd === -1 || nextHeading < sectionEnd)) {
        sectionEnd = nextHeading;
      }
      if (sectionEnd === -1) sectionEnd = Math.min(searchIndex + 500, content.length);

      content =
        content.substring(0, sectionStart) +
        '<mark id="rag-highlight" class="rag-highlight">' +
        content.substring(sectionStart, sectionEnd) +
        '</mark>' +
        content.substring(sectionEnd);
      highlighted = true;
    }
  }

  // Parse markdown to HTML
  return marked.parse(content, { async: false }) as string;
});

const formatDocumentName = (filename: string): string => {
  return filename
    .replace(/\.(md|txt|pdf|docx)$/i, '')
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const loadDocument = async () => {
  console.log('🔍 [RagDocumentViewer] loadDocument called');
  console.log('🔍 [RagDocumentViewer] source:', props.source);
  console.log('🔍 [RagDocumentViewer] organizationSlug from props:', props.organizationSlug);

  if (!props.source.documentId) {
    console.error('❌ [RagDocumentViewer] No document ID available');
    error.value = 'No document ID available';
    return;
  }

  loading.value = true;
  error.value = null;
  searchHighlight.value = null; // Reset search highlight for fresh load

  try {
    // Use the organization slug from props, falling back to current org or 'legal'
    const orgSlug = props.organizationSlug || rbacStore.currentOrganization || 'legal';
    console.log('🔍 [RagDocumentViewer] Using orgSlug:', orgSlug);

    // Get all collections for this organization and try each one
    console.log('🔍 [RagDocumentViewer] Fetching collections...');
    const collections = await ragService.getCollections(orgSlug);
    console.log('🔍 [RagDocumentViewer] Found collections:', collections.length, collections.map(c => ({ id: c.id, name: c.name })));

    for (const collection of collections) {
      try {
        console.log(`🔍 [RagDocumentViewer] Trying collection: ${collection.name} (${collection.id})`);
        const content = await ragService.getDocumentContent(
          collection.id,
          props.source.documentId,
          orgSlug,
        );
        console.log('🔍 [RagDocumentViewer] Got content:', content ? { id: content.id, filename: content.filename, hasContent: !!content.content, contentLength: content.content?.length || 0 } : 'null');
        if (content) {
          documentContent.value = content;
          collectionId.value = collection.id;
          console.log('✅ [RagDocumentViewer] Document found and loaded!');
          break;
        }
      } catch (e) {
        console.log(`⚠️ [RagDocumentViewer] Collection ${collection.name} failed:`, e instanceof Error ? e.message : e);
        // Try next collection
        continue;
      }
    }

    if (!documentContent.value) {
      console.error('❌ [RagDocumentViewer] Document not found in any collection');
      error.value = 'Document not found in any collection';
    }
  } catch (e) {
    console.error('❌ [RagDocumentViewer] loadDocument error:', e);
    error.value = e instanceof Error ? e.message : 'Failed to load document';
  } finally {
    loading.value = false;
    console.log('🔍 [RagDocumentViewer] Final state - documentContent:', documentContent.value ? { hasContent: !!documentContent.value.content } : 'null');

    // Auto-scroll to highlight after content renders
    if (documentContent.value?.content) {
      await nextTick();
      await nextTick(); // Double nextTick to ensure DOM is fully updated after markdown parsing
      scrollToHighlight();
    }
  }
};

const scrollToHighlight = async () => {
  await nextTick();
  const highlight = document.getElementById('rag-highlight');
  if (highlight) {
    highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

/**
 * Extract reference ID from link context (e.g., "EP-001-REF-001")
 */
const extractReferenceId = (element: HTMLElement): string | null => {
  // Check the text after the link for a reference pattern
  const parent = element.parentElement;
  if (!parent) return null;

  const parentText = parent.textContent || '';
  // Look for patterns like "- EP-001-REF-001" or "EP-001-REF-001"
  const refMatch = parentText.match(/[A-Z]{2,}-\d{3}-REF-\d{3}/);
  return refMatch ? refMatch[0] : null;
};

/**
 * Handle clicks on links in the markdown content
 * This allows navigation to cross-referenced documents
 */
const handleContentClick = async (event: MouseEvent) => {
  const target = event.target as HTMLElement;

  // Check if clicked element is a link
  const link = target.closest('a');
  if (!link) return;

  event.preventDefault();

  const href = link.getAttribute('href');
  const linkText = link.textContent?.trim() || '';

  // Extract any reference ID from the context
  const referenceId = extractReferenceId(link);

  console.log('🔗 [RagDocumentViewer] Link clicked:', { href, linkText, referenceId });

  // Try to find the linked document by searching for it
  // The link text often contains the document name
  const searchTerm = linkText
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  if (!searchTerm) return;

  const orgSlug = props.organizationSlug || rbacStore.currentOrganization || 'legal';

  try {
    loading.value = true;
    error.value = null;
    searchHighlight.value = null; // Reset highlight

    // Search through all collections for a document matching the link text
    const collections = await ragService.getCollections(orgSlug);

    for (const collection of collections) {
      try {
        // Get all documents in this collection
        const documents = await ragService.getDocuments(collection.id, orgSlug);

        // Find a document whose filename matches the link text
        const matchingDoc = documents.find(doc => {
          const docName = doc.filename
            .toLowerCase()
            .replace(/\.(md|txt|pdf|docx)$/i, '')
            .replace(/[-_]/g, '-');
          return docName.includes(searchTerm) || searchTerm.includes(docName);
        });

        if (matchingDoc) {
          console.log('✅ [RagDocumentViewer] Found matching document:', matchingDoc.filename);

          // Load the content of this document
          const content = await ragService.getDocumentContent(
            collection.id,
            matchingDoc.id,
            orgSlug,
          );

          if (content && content.content) {
            documentContent.value = content;
            collectionId.value = collection.id;

            // Set the reference ID as the search highlight term
            // This will highlight the section where this document is referenced
            if (referenceId) {
              searchHighlight.value = referenceId;
              console.log('🔍 [RagDocumentViewer] Will highlight reference:', referenceId);
            }

            // Scroll to highlight after content renders
            await nextTick();
            await nextTick(); // Double nextTick to ensure DOM is fully updated
            scrollToHighlight();
            return;
          }
        }
      } catch {
        continue;
      }
    }

    // No matching document found
    console.warn('⚠️ [RagDocumentViewer] No matching document found for:', linkText);
    error.value = `Document "${linkText}" not found in the collection`;

  } catch (e) {
    console.error('❌ [RagDocumentViewer] Error loading linked document:', e);
    error.value = e instanceof Error ? e.message : 'Failed to load linked document';
  } finally {
    loading.value = false;
  }
};

const close = () => {
  emit('close');
};

console.log('🔍 [RagDocumentViewer] Component setup - isOpen:', props.isOpen);

// Load document when modal opens - use immediate: true to trigger on mount
watch(() => props.isOpen, (isOpen) => {
  console.log('🔍 [RagDocumentViewer] Watch triggered - isOpen changed to:', isOpen);
  if (isOpen) {
    loadDocument();
  } else {
    // Reset state when closed
    documentContent.value = null;
    error.value = null;
  }
}, { immediate: true });
</script>

<style scoped>
.rag-document-modal {
  --width: 90%;
  --max-width: 900px;
  --height: 90%;
  --border-radius: 12px;
}

ion-toolbar {
  --background: var(--ion-color-step-50, #f8f9fa);
}

ion-title {
  font-size: 1rem;
  font-weight: 600;
}

.document-content {
  --padding-start: 0;
  --padding-end: 0;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--ion-color-medium);
}

.loading-state ion-spinner,
.error-state ion-icon,
.empty-state ion-icon {
  font-size: 48px;
}

.empty-hint {
  font-size: 0.85rem;
  max-width: 300px;
  text-align: center;
  line-height: 1.4;
}

.document-wrapper {
  height: 100%;
  overflow-y: auto;
}

.source-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 20px;
  background: var(--ion-color-step-50, #f8f9fa);
  border-bottom: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.1));
  position: sticky;
  top: 0;
  z-index: 10;
}

.source-metadata {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-path {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.section-path ion-icon {
  font-size: 14px;
}

.markdown-content {
  padding: 20px;
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--ion-text-color);
}

/* Link styling - make cross-references interactive */
.markdown-content :deep(a) {
  color: var(--ion-color-primary);
  text-decoration: none;
  cursor: pointer;
  border-bottom: 1px dashed var(--ion-color-primary);
  transition: all 0.2s ease;
}

.markdown-content :deep(a:hover) {
  color: var(--ion-color-primary-shade);
  border-bottom-style: solid;
}

/* Markdown styling */
.markdown-content :deep(h1) {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--ion-color-primary);
}

.markdown-content :deep(h2) {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 24px 0 12px 0;
  color: var(--ion-color-primary-shade);
}

.markdown-content :deep(h3) {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 20px 0 10px 0;
}

.markdown-content :deep(h4) {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 16px 0 8px 0;
}

.markdown-content :deep(p) {
  margin: 0 0 12px 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0 0 12px 0;
  padding-left: 24px;
}

.markdown-content :deep(li) {
  margin-bottom: 6px;
}

.markdown-content :deep(blockquote) {
  margin: 16px 0;
  padding: 12px 16px;
  border-left: 4px solid var(--ion-color-primary);
  background: var(--ion-color-step-50, #f8f9fa);
  font-style: italic;
}

.markdown-content :deep(code) {
  background: var(--ion-color-step-100, #e9ecef);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.markdown-content :deep(pre) {
  background: var(--ion-color-step-100, #e9ecef);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 16px 0;
}

.markdown-content :deep(pre code) {
  background: transparent;
  padding: 0;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  padding: 10px 12px;
  border: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.1));
  text-align: left;
}

.markdown-content :deep(th) {
  background: var(--ion-color-step-50, #f8f9fa);
  font-weight: 600;
}

.markdown-content :deep(tr:nth-child(even)) {
  background: var(--ion-color-step-25, #fcfcfc);
}

/* Highlight styling */
.markdown-content :deep(.rag-highlight) {
  background: linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%);
  padding: 2px 4px;
  border-radius: 3px;
  border: 1px solid #ffc107;
  box-shadow: 0 0 8px rgba(255, 193, 7, 0.4);
  animation: highlight-pulse 2s ease-in-out;
}

@keyframes highlight-pulse {
  0% {
    box-shadow: 0 0 8px rgba(255, 193, 7, 0.4);
  }
  50% {
    box-shadow: 0 0 20px rgba(255, 193, 7, 0.8);
  }
  100% {
    box-shadow: 0 0 8px rgba(255, 193, 7, 0.4);
  }
}

/* Dark mode */
:global(.ion-palette-dark) .source-info-header,
:global([data-theme="dark"]) .source-info-header {
  background: var(--ion-color-step-100, #1e1e1e);
}

:global(.ion-palette-dark) .markdown-content :deep(.rag-highlight),
:global([data-theme="dark"]) .markdown-content :deep(.rag-highlight) {
  background: linear-gradient(135deg, #4a4000 0%, #5a5000 100%);
  border-color: #8a7000;
}

:global(.ion-palette-dark) .markdown-content :deep(blockquote),
:global([data-theme="dark"]) .markdown-content :deep(blockquote) {
  background: var(--ion-color-step-100, #1e1e1e);
}
</style>
