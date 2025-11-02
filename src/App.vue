<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container class="full-width">
      <q-page>
        <!-- Not authenticated - show auth dialog -->
        <div v-if="!authenticated" class="flex flex-center" style="height: 100vh">
          <q-card style="min-width: 400px">
            <q-card-section>
              <div class="text-h6 text-center q-mb-md">
                Welcome to MAIA
              </div>
              <div class="text-center q-mb-lg">
                <p>Sign in with your passkey or create a new account</p>
              </div>

              <q-btn
                v-if="!showAuth"
                label="Get Started"
                color="primary"
                size="lg"
                class="full-width"
                @click="showAuth = true"
              />

              <PasskeyAuth
                v-if="showAuth"
                @authenticated="handleAuthenticated"
                @cancelled="showAuth = false"
              />
            </q-card-section>
          </q-card>
        </div>

        <!-- Authenticated - show main interface -->
        <div v-else class="full-width full-height">
          <ChatInterface :user="user" @sign-out="handleSignOut" />
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import PasskeyAuth from './components/PasskeyAuth.vue';
import ChatInterface from './components/ChatInterface.vue';

interface User {
  userId: string;
  displayName: string;
}

const authenticated = ref(false);
const showAuth = ref(false);
const user = ref<User | null>(null);

const handleAuthenticated = (userData: any) => {
  user.value = userData;
  authenticated.value = true;
  showAuth.value = false;
};

const handleSignOut = async () => {
  try {
    const response = await fetch('/api/sign-out', {
      method: 'POST',
      credentials: 'include'
    });

    if (response.ok) {
      authenticated.value = false;
      user.value = null;
    }
  } catch (error) {
    console.error('Sign out error:', error);
  }
};

onMounted(async () => {
  // Check if user is already authenticated
  try {
    const response = await fetch('/api/current-user', {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.authenticated) {
      authenticated.value = true;
      user.value = data.user;
    }
  } catch (error) {
    console.error('Auth check error:', error);
  }
});
</script>

<style>
.q-layout {
  padding: 0 !important;
}

.q-page-container {
  padding: 0 !important;
}

.q-page {
  padding: 0 !important;
}
</style>

