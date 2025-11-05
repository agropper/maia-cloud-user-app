<template>
  <q-dialog v-model="isOpen" persistent maximized>
    <q-card>
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h5">My Stuff</div>
        <q-space />
        <q-btn icon="close" flat round dense @click="closeDialog" />
      </q-card-section>

      <q-card-section>
        <q-tabs v-model="currentTab" class="text-grey" active-color="primary" indicator-color="primary" align="justify">
          <q-tab name="files" label="Saved Files" icon="description" />
          <q-tab name="agent" label="My AI Agent" icon="smart_toy" />
          <q-tab name="chats" label="Saved Chats" icon="chat" />
        </q-tabs>

        <q-separator />

        <q-tab-panels v-model="currentTab" animated>
          <!-- Saved Files Tab -->
          <q-tab-panel name="files">
            <div v-if="loadingFiles" class="text-center q-pa-md">
              <q-spinner size="2em" />
              <div class="q-mt-sm">Loading files...</div>
            </div>

            <div v-else-if="filesError" class="text-center q-pa-md">
              <q-icon name="error" color="negative" size="40px" />
              <div class="text-negative q-mt-sm">{{ filesError }}</div>
              <q-btn label="Retry" color="primary" @click="loadFiles" class="q-mt-md" />
            </div>

            <div v-else-if="userFiles.length === 0" class="text-center q-pa-md text-grey">
              <q-icon name="folder_open" size="3em" />
              <div class="q-mt-sm">No files found</div>
            </div>

            <div v-else class="q-mt-md">
              <q-list>
                <q-item v-for="file in userFiles" :key="file.bucketKey" class="q-pa-md">
                  <q-item-section avatar>
                    <q-checkbox
                      v-model="file.inKnowledgeBase"
                      @update:model-value="toggleKnowledgeBase(file)"
                      :disable="updatingFiles.has(file.bucketKey)"
                    />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ file.fileName }}</q-item-label>
                    <q-item-label caption>
                      {{ formatFileSize(file.fileSize) }} • Uploaded {{ formatDate(file.uploadedAt) }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge v-if="file.inKnowledgeBase" color="primary" label="In My Knowledge Base" />
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
          </q-tab-panel>

          <!-- My AI Agent Tab -->
          <q-tab-panel name="agent">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-h6">Agent Instructions</div>
              <q-btn
                label="EDIT"
                color="primary"
                @click="editMode = !editMode"
                :icon="editMode ? 'close' : 'edit'"
              />
            </div>

            <div v-if="loadingAgent" class="text-center q-pa-md">
              <q-spinner size="2em" />
              <div class="q-mt-sm">Loading agent...</div>
            </div>

            <div v-else-if="agentError" class="text-center q-pa-md">
              <q-icon name="error" color="negative" size="40px" />
              <div class="text-negative q-mt-sm">{{ agentError }}</div>
              <q-btn label="Retry" color="primary" @click="loadAgent" class="q-mt-md" />
            </div>

            <div v-else-if="agentInstructions">
              <div v-if="editMode" class="q-mb-md">
                <q-input
                  v-model="editedInstructions"
                  type="textarea"
                  rows="15"
                  outlined
                  autofocus
                />
                <div class="q-mt-md">
                  <q-btn label="Save" color="primary" @click="saveInstructions" :loading="savingInstructions" />
                  <q-btn label="Cancel" flat @click="cancelEdit" class="q-ml-sm" />
                </div>
              </div>

              <div v-else>
                <div class="q-mb-md">
                  <vue-markdown :source="agentInstructions" />
                </div>
              </div>
            </div>

            <div v-else class="text-center q-pa-md text-grey">
              <q-icon name="smart_toy" size="3em" />
              <div class="q-mt-sm">No agent found</div>
            </div>
          </q-tab-panel>

          <!-- Saved Chats Tab -->
          <q-tab-panel name="chats">
            <div v-if="loadingChats" class="text-center q-pa-md">
              <q-spinner size="2em" />
              <div class="q-mt-sm">Loading chats...</div>
            </div>

            <div v-else-if="chatsError" class="text-center q-pa-md">
              <q-icon name="error" color="negative" size="40px" />
              <div class="text-negative q-mt-sm">{{ chatsError }}</div>
              <q-btn label="Retry" color="primary" @click="loadSharedChats" class="q-mt-md" />
            </div>

            <div v-else-if="sharedChats.length === 0" class="text-center q-pa-md text-grey">
              <q-icon name="chat" size="3em" />
              <div class="q-mt-sm">No shared group chats found</div>
            </div>

            <div v-else class="q-mt-md">
              <q-list>
                <q-item
                  v-for="chat in sortedSharedChats"
                  :key="chat._id"
                  class="q-pa-md q-mb-sm"
                  style="border: 1px solid #e0e0e0; border-radius: 8px;"
                >
                  <q-item-section>
                    <q-item-label class="text-weight-medium">
                      {{ formatDate(chat.updatedAt || chat.createdAt) }}
                    </q-item-label>
                    <q-item-label caption class="q-mt-xs">
                      {{ getLastQueryDescription(chat) }}
                    </q-item-label>
                    <q-item-label caption class="q-mt-xs">
                      Group Participants: {{ getGroupParticipants(chat) }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import VueMarkdown from 'vue-markdown-render';

interface UserFile {
  fileName: string;
  bucketKey: string;
  fileSize: number;
  uploadedAt: string;
  inKnowledgeBase: boolean;
  knowledgeBases?: string[];
}

interface SavedChat {
  _id: string;
  type: string;
  shareId: string;
  currentUser: string;
  patientOwner?: string;
  chatHistory: any[];
  uploadedFiles: any[];
  createdAt: string;
  updatedAt: string;
  isShared?: boolean;
}

interface Props {
  modelValue: boolean;
  userId: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const isOpen = ref(props.modelValue);
const currentTab = ref('files');
const loadingFiles = ref(false);
const filesError = ref('');
const userFiles = ref<UserFile[]>([]);
const updatingFiles = ref(new Set<string>());

const loadingAgent = ref(false);
const agentError = ref('');
const agentInstructions = ref('');
const editMode = ref(false);
const editedInstructions = ref('');
const savingInstructions = ref(false);

const loadingChats = ref(false);
const chatsError = ref('');
const sharedChats = ref<SavedChat[]>([]);

const loadFiles = async () => {
  loadingFiles.value = true;
  filesError.value = '';

  try {
    const response = await fetch(`http://localhost:3001/api/user-files?userId=${encodeURIComponent(props.userId)}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch files: ${response.statusText}`);
    }
    const result = await response.json();
    userFiles.value = (result.files || []).map((file: any) => ({
      ...file,
      inKnowledgeBase: file.knowledgeBases && file.knowledgeBases.length > 0
    }));
  } catch (err) {
    filesError.value = err instanceof Error ? err.message : 'Failed to load files';
  } finally {
    loadingFiles.value = false;
  }
};

const toggleKnowledgeBase = async (file: UserFile) => {
  updatingFiles.value.add(file.bucketKey);

  try {
    const response = await fetch('http://localhost:3001/api/toggle-file-knowledge-base', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        userId: props.userId,
        bucketKey: file.bucketKey,
        inKnowledgeBase: file.inKnowledgeBase
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update knowledge base status');
    }

    // Reload files to get updated state
    await loadFiles();
  } catch (err) {
    filesError.value = err instanceof Error ? err.message : 'Failed to update knowledge base status';
    // Revert checkbox on error
    file.inKnowledgeBase = !file.inKnowledgeBase;
  } finally {
    updatingFiles.value.delete(file.bucketKey);
  }
};

const loadAgent = async () => {
  loadingAgent.value = true;
  agentError.value = '';

  try {
    const response = await fetch(`http://localhost:3001/api/agent-instructions?userId=${encodeURIComponent(props.userId)}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch agent: ${response.statusText}`);
    }
    const result = await response.json();
    agentInstructions.value = result.instructions || '';
    editedInstructions.value = result.instructions || '';
  } catch (err) {
    agentError.value = err instanceof Error ? err.message : 'Failed to load agent';
  } finally {
    loadingAgent.value = false;
  }
};

const saveInstructions = async () => {
  savingInstructions.value = true;

  try {
    const response = await fetch('http://localhost:3001/api/agent-instructions', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        userId: props.userId,
        instructions: editedInstructions.value
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save instructions');
    }

    agentInstructions.value = editedInstructions.value;
    editMode.value = false;
  } catch (err) {
    agentError.value = err instanceof Error ? err.message : 'Failed to save instructions';
  } finally {
    savingInstructions.value = false;
  }
};

const cancelEdit = () => {
  editedInstructions.value = agentInstructions.value;
  editMode.value = false;
};

const loadSharedChats = async () => {
  loadingChats.value = true;
  chatsError.value = '';

  try {
    const response = await fetch(`http://localhost:3001/api/shared-group-chats?userId=${encodeURIComponent(props.userId)}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch chats: ${response.statusText}`);
    }
    const result = await response.json();
    sharedChats.value = result.chats || [];
  } catch (err) {
    chatsError.value = err instanceof Error ? err.message : 'Failed to load chats';
  } finally {
    loadingChats.value = false;
  }
};

const getLastQueryDescription = (chat: SavedChat): string => {
  if (!chat.chatHistory || chat.chatHistory.length === 0) {
    return 'No messages';
  }

  // Find the last user message
  for (let i = chat.chatHistory.length - 1; i >= 0; i--) {
    if (chat.chatHistory[i].role === 'user' && chat.chatHistory[i].content) {
      const content = chat.chatHistory[i].content;
      // Return first 100 characters
      return content.length > 100 ? content.substring(0, 100) + '...' : content;
    }
  }

  return 'No user query found';
};

const getGroupParticipants = (chat: SavedChat): string => {
  if (!chat.isShared || !chat.currentUser) {
    return 'None';
  }

  // For now, just return the current user
  // TODO: Extract all participants from chat history
  return chat.currentUser;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

const sortedSharedChats = computed(() => {
  return [...sharedChats.value].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt);
    const dateB = new Date(b.updatedAt || b.createdAt);
    return dateB.getTime() - dateA.getTime();
  });
});

const closeDialog = () => {
  isOpen.value = false;
};

watch(() => props.modelValue, (newValue) => {
  isOpen.value = newValue;
  if (newValue) {
    // Load data when dialog opens
    if (currentTab.value === 'files') {
      loadFiles();
    } else if (currentTab.value === 'agent') {
      loadAgent();
    } else if (currentTab.value === 'chats') {
      loadSharedChats();
    }
  }
});

watch(isOpen, (newValue) => {
  emit('update:modelValue', newValue);
});

watch(currentTab, (newTab) => {
  if (isOpen.value) {
    if (newTab === 'files') {
      loadFiles();
    } else if (newTab === 'agent') {
      loadAgent();
    } else if (newTab === 'chats') {
      loadSharedChats();
    }
  }
});
</script>

<style scoped lang="scss">
.q-item {
  cursor: default;
}
</style>
