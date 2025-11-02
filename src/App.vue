<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
      <q-toolbar>
        <q-toolbar-title>MAIA User App</q-toolbar-title>
        <div v-if="user">
          <q-btn flat :label="user.displayName" />
          <q-btn flat label="Sign Out" @click="handleSignOut" />
        </div>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <q-page padding>
        <!-- Not authenticated - show auth dialog -->
        <div v-if="!authenticated" class="flex flex-center" style="height: 80vh">
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
        <div v-else>
          <div class="text-h4 q-mb-md">Welcome, {{ user?.displayName }}</div>
          <div class="text-body1 q-mb-lg">
            You are successfully authenticated with a passkey!
          </div>

          <q-card>
            <q-card-section>
              <div class="text-h6 q-mb-md">User Information</div>
              <div>
                <p><strong>User ID:</strong> {{ user?.userId }}</p>
                <p><strong>Display Name:</strong> {{ user?.displayName }}</p>
                <p><strong>Type:</strong> Authenticated User</p>
              </div>
            </q-card-section>
          </q-card>

          <q-card class="q-mt-md">
            <q-card-section>
              <div class="text-h6 q-mb-md">Next Steps</div>
              <ul>
                <li>Build chat interface</li>
                <li>Add knowledge base management</li>
                <li>Implement agent interaction</li>
              </ul>
            </q-card-section>
          </q-card>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import PasskeyAuth from './components/PasskeyAuth.vue';

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

