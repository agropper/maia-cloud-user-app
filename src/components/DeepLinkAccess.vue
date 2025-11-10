<template>
  <form @submit.prevent="handleSubmit">
    <div class="q-gutter-md">
      <q-input
        v-model="name"
        label="Your Name"
        outlined
        :disable="loading"
        :rules="[val => !!val || 'Name is required']"
        autocomplete="name"
      />

      <q-input
        v-model="email"
        label="Email (optional)"
        outlined
        type="email"
        :disable="loading"
        autocomplete="email"
        hint="We’ll use this to notify you about updates to the shared chat"
      />

      <div v-if="error" class="text-negative text-caption">{{ error }}</div>

      <q-btn
        type="submit"
        color="primary"
        label="Continue"
        class="full-width"
        :loading="loading"
      />
    </div>

    <q-dialog v-model="showEmailConflict" persistent>
      <q-card style="min-width: 320px">
        <q-card-section>
          <div class="text-h6">Email mismatch</div>
          <div class="text-body2 q-mt-sm">
            This name was previously used with a different email ({{ emailConflict?.existingEmail }}). Which email would you like to keep?
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            flat
            label="Keep existing"
            color="primary"
            @click="resolveConflict('existing')"
            :disable="loading"
          />
          <q-btn
            flat
            label="Use new email"
            color="primary"
            @click="resolveConflict('new')"
            :disable="loading"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';

interface DeepLinkSuccess {
  user: any;
  deepLinkInfo: {
    shareId: string;
    chatId?: string | null;
  };
}

const props = defineProps<{ shareId: string }>();
const emit = defineEmits<{ authenticated: [DeepLinkSuccess] }>();

const $q = useQuasar();

const name = ref('');
const email = ref('');
const loading = ref(false);
const error = ref('');

const emailConflict = ref<{ existingEmail: string } | null>(null);
const showEmailConflict = ref(false);

const submitRequest = async (emailPreference?: 'existing' | 'new') => {
  loading.value = true;
  error.value = '';

  try {
    const trimmedName = name.value.trim();
    const trimmedEmail = email.value.trim();
    const payload: Record<string, unknown> = {
      shareId: props.shareId,
      name: trimmedName,
      email: trimmedEmail,
      emailPreference
    };
    if (!trimmedEmail) {
      delete payload.email;
    }

    const response = await fetch('/api/deep-link/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (response.status === 409) {
      const conflict = await response.json();
      emailConflict.value = { existingEmail: conflict.existingEmail };
      showEmailConflict.value = true;
      return;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || 'Unable to join shared chat');
    }

    const result = await response.json();
    emit('authenticated', {
      user: result.user,
      deepLinkInfo: result.deepLinkInfo || { shareId: props.shareId, chatId: result.deepLinkInfo?.chatId || null }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to join shared chat';
    error.value = message;
    if ($q && typeof $q.notify === 'function') {
      $q.notify({ type: 'negative', message });
    }
  } finally {
    loading.value = false;
  }
};

const handleSubmit = async () => {
  if (!name.value.trim()) {
    error.value = 'Name is required';
    return;
  }
  await submitRequest();
};

const resolveConflict = async (choice: 'existing' | 'new') => {
  showEmailConflict.value = false;
  await submitRequest(choice);
};
</script>

<style scoped>
form {
  width: 100%;
}
</style>
