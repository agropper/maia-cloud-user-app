<template>
  <q-dialog v-model="isOpen">
    <q-card class="text-modal-card">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">{{ fileName }}</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <div v-if="fileContent" class="text-container">
          <!-- Markdown content -->
          <div v-if="isMarkdown" class="markdown-content" v-html="renderedMarkdown"></div>
          
          <!-- Plain text content -->
          <pre v-else class="text-content">{{ fileContent }}</pre>
        </div>

        <!-- Loading state -->
        <div v-else-if="isLoading" class="loading-state">
          <q-spinner color="primary" size="3em" />
          <p>Loading file...</p>
        </div>

        <!-- Error state -->
        <div v-else class="error-state">
          <q-icon name="error" size="40px" color="negative" />
          <p>{{ errorMessage || 'Failed to load file' }}</p>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';

interface Props {
  modelValue: boolean;
  file?: {
    fileUrl?: string;
    bucketKey?: string;
    originalFile?: File;
    name?: string;
    content?: string;
    type?: string;
  };
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const fileName = computed(() => props.file?.name || 'Text Viewer');

const isMarkdown = computed(() => {
  if (props.file?.type === 'markdown') return true;
  if (props.file?.name?.toLowerCase().endsWith('.md') || 
      props.file?.name?.toLowerCase().endsWith('.markdown')) {
    return true;
  }
  return false;
});

// Reactive state
const fileContent = ref<string>('');
const isLoading = ref(false);
const errorMessage = ref<string>('');

// Initialize markdown parser
const markdownParser = new MarkdownIt();

// Computed
const renderedMarkdown = computed(() => {
  if (!isMarkdown.value || !fileContent.value) return '';
  try {
    return markdownParser.render(fileContent.value);
  } catch (error) {
    console.error('[TEXT VIEW] Markdown rendering error:', error);
    return fileContent.value; // Fallback to plain text
  }
});

// Methods
const loadFileContent = async () => {
  if (!props.file) {
    fileContent.value = '';
    isLoading.value = false;
    return;
  }

  // If content is already provided, use it
  if (props.file.content) {
    fileContent.value = props.file.content;
    isLoading.value = false;
    return;
  }

  // If originalFile is provided, read it
  if (props.file.originalFile instanceof File) {
    try {
      isLoading.value = true;
      const text = await readFileAsText(props.file.originalFile);
      fileContent.value = text;
      errorMessage.value = '';
    } catch (error) {
      console.error('[TEXT VIEW] File reading error:', error);
      errorMessage.value = error instanceof Error ? error.message : 'Failed to read file';
      fileContent.value = '';
    } finally {
      isLoading.value = false;
    }
    return;
  }

  // If bucketKey is provided, fetch from server
  if (props.file.bucketKey) {
    try {
      isLoading.value = true;
      const response = await fetch(`/api/files/get-text/${encodeURIComponent(props.file.bucketKey)}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const data = await response.json();
      fileContent.value = data.content || '';
      errorMessage.value = '';
    } catch (error) {
      console.error('[TEXT VIEW] File fetch error:', error);
      errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch file';
      fileContent.value = '';
    } finally {
      isLoading.value = false;
    }
    return;
  }

  // If fileUrl is provided, fetch directly
  if (props.file.fileUrl) {
    try {
      isLoading.value = true;
      const response = await fetch(props.file.fileUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const text = await response.text();
      fileContent.value = text;
      errorMessage.value = '';
    } catch (error) {
      console.error('[TEXT VIEW] File URL fetch error:', error);
      errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch file';
      fileContent.value = '';
    } finally {
      isLoading.value = false;
    }
    return;
  }

  // No valid file source
  fileContent.value = '';
  isLoading.value = false;
  errorMessage.value = 'No file content available';
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

// Watch for file changes
watch(() => props.file, (newFile) => {
  if (newFile) {
    fileContent.value = '';
    errorMessage.value = '';
    loadFileContent();
  }
}, { immediate: true });

// Watch for modal opening
watch(() => props.modelValue, (isOpen) => {
  if (isOpen && props.file) {
    loadFileContent();
  }
});
</script>

<style scoped>
.text-modal-card {
  width: 90vw;
  height: 90vh;
  max-width: 90vw;
  max-height: 90vh;
}

.text-container {
  display: flex;
  flex-direction: column;
  height: 80vh;
  overflow: auto;
  padding: 16px;
  background: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.markdown-content {
  flex: 1;
  overflow: auto;
  background: white;
  padding: 24px;
  border-radius: 4px;
  line-height: 1.6;
  color: #333;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-content :deep(h1) {
  font-size: 2em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-content :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-content :deep(p) {
  margin-bottom: 16px;
}

.markdown-content :deep(code) {
  background: #f6f8fa;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 85%;
  font-family: 'Courier New', monospace;
}

.markdown-content :deep(pre) {
  background: #f6f8fa;
  padding: 16px;
  border-radius: 6px;
  overflow: auto;
  margin-bottom: 16px;
}

.markdown-content :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 85%;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin-bottom: 16px;
  padding-left: 2em;
}

.markdown-content :deep(li) {
  margin-bottom: 0.25em;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #dfe2e5;
  padding-left: 16px;
  margin: 0 0 16px 0;
  color: #6a737d;
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  margin-bottom: 16px;
  width: 100%;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid #dfe2e5;
  padding: 6px 13px;
}

.markdown-content :deep(th) {
  background: #f6f8fa;
  font-weight: 600;
}

.markdown-content :deep(a) {
  color: #0366d6;
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.text-content {
  flex: 1;
  overflow: auto;
  background: white;
  padding: 24px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80vh;
  gap: 16px;
}

.loading-state p,
.error-state p {
  margin: 0;
  color: #666;
}
</style>

