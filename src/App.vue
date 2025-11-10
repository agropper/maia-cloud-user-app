<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container class="full-width">
      <q-page>
        <!-- Not authenticated - show auth dialog -->
        <div v-if="!authenticated" class="flex flex-center" style="height: 100vh">
          <template v-if="deepLinkShareId">
            <q-card style="min-width: 420px; max-width: 520px">
              <q-card-section>
                <div class="text-h6 text-center q-mb-md">Join a Shared MAIA Chat</div>
                <div class="text-body2 text-center q-mb-lg">
                  Enter your name and email to view the shared conversation. We’ll remember you for the next month on this device.
                </div>

                <div v-if="deepLinkLoading" class="text-center q-pa-md">
                  <q-spinner size="2em" />
                  <div class="q-mt-sm">Preparing your invitation...</div>
                </div>

                <div v-else>
                  <div v-if="deepLinkError" class="text-negative text-center q-mb-md">
                    {{ deepLinkError }}
                  </div>

                  <DeepLinkAccess
                    v-if="showDeepLinkAccess && deepLinkShareId"
                    :share-id="deepLinkShareId"
                    @authenticated="handleDeepLinkAuthenticated"
                  />

                  <div v-else class="text-center text-caption text-grey">
                    Awaiting invitation details...
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </template>

          <template v-else>
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
          </template>
        </div>

        <!-- Authenticated - show main interface -->
        <div v-else class="full-width full-height">
          <ChatInterface
            :user="user"
            :is-deep-link-user="isDeepLinkUser"
            :deep-link-info="deepLinkInfo"
            @sign-out="handleSignOut"
          />
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import PasskeyAuth from './components/PasskeyAuth.vue';
import ChatInterface from './components/ChatInterface.vue';
import DeepLinkAccess from './components/DeepLinkAccess.vue';

interface User {
  userId: string;
  displayName: string;
  isDeepLink?: boolean;
  deepLinkInfo?: DeepLinkInfo | null;
}

interface DeepLinkInfo {
  shareId: string | null;
  chatId?: string | null;
}

const authenticated = ref(false);
const showAuth = ref(false);
const user = ref<User | null>(null);
const isDeepLinkUser = ref(false);
const deepLinkInfo = ref<DeepLinkInfo | null>(null);
const deepLinkShareId = ref<string | null>(null);
const showDeepLinkAccess = ref(false);
const deepLinkLoading = ref(false);
const deepLinkError = ref('');

const setAuthenticatedUser = (userData: any, deepLink: DeepLinkInfo | null = null) => {
  if (!userData) return;
  const normalizedUser: User = {
    userId: userData.userId,
    displayName: userData.displayName || userData.userId,
    isDeepLink: !!userData.isDeepLink,
    deepLinkInfo: userData.deepLinkInfo || null
  };

  user.value = normalizedUser;
  authenticated.value = true;
  showAuth.value = false;
  isDeepLinkUser.value = !!normalizedUser.isDeepLink;

  if (isDeepLinkUser.value) {
    const sessionInfo = userData.deepLinkInfo || {};
    const resolvedShareId = (deepLink && deepLink.shareId) || sessionInfo.activeShareId || deepLinkShareId.value || (Array.isArray(sessionInfo.shareIds) ? sessionInfo.shareIds[0] : null) || null;
    const resolvedChatId = (deepLink && deepLink.chatId) || sessionInfo.chatId || null;
    if (resolvedShareId) {
      deepLinkShareId.value = resolvedShareId;
    }
    deepLinkInfo.value = {
      shareId: resolvedShareId,
      chatId: resolvedChatId
    };
    showDeepLinkAccess.value = false;
  } else {
    deepLinkInfo.value = deepLink;
  }
};

const handleAuthenticated = (userData: any) => {
  setAuthenticatedUser(userData);
};

const handleDeepLinkAuthenticated = (payload: { user: User; deepLinkInfo: DeepLinkInfo }) => {
  setAuthenticatedUser({ ...payload.user, isDeepLink: true, deepLinkInfo: payload.deepLinkInfo }, payload.deepLinkInfo);
  if (payload.deepLinkInfo?.shareId && window.location.search.indexOf(`share=${payload.deepLinkInfo.shareId}`) === -1) {
    const normalizedUrl = `${window.location.origin}/?share=${encodeURIComponent(payload.deepLinkInfo.shareId)}${window.location.hash}`;
    window.history.replaceState({}, '', normalizedUrl);
  }
  showDeepLinkAccess.value = false;
  deepLinkLoading.value = false;
  deepLinkError.value = '';
};

const resetAuthState = () => {
  authenticated.value = false;
  user.value = null;
  isDeepLinkUser.value = false;
  deepLinkInfo.value = null;
  showAuth.value = false;
  showDeepLinkAccess.value = !!deepLinkShareId.value;
};

const checkDeepLinkSession = async (shareId: string) => {
  deepLinkLoading.value = true;
  deepLinkError.value = '';

  try {
    const response = await fetch(`/api/deep-link/session?shareId=${encodeURIComponent(shareId)}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(response.statusText || 'Failed to verify deep link');
    }

    const result = await response.json();

    if (result.authenticated && result.user) {
      const info: DeepLinkInfo | null = result.deepLinkInfo || (result.deepLink
        ? { shareId, chatId: result.deepLinkInfo?.chatId || null }
        : { shareId, chatId: result.deepLinkInfo?.chatId || null });
      setAuthenticatedUser({ ...result.user, isDeepLink: !!result.deepLink }, info);
      showDeepLinkAccess.value = false;
    } else {
      showDeepLinkAccess.value = true;
    }
  } catch (error) {
    deepLinkError.value = error instanceof Error ? error.message : 'Unable to load invitation';
    showDeepLinkAccess.value = true;
  } finally {
    deepLinkLoading.value = false;
  }
};

const handleSignOut = async () => {
  try {
    const response = await fetch('/api/sign-out', {
      method: 'POST',
      credentials: 'include'
    });

    if (response.ok) {
      resetAuthState();
      if (deepLinkShareId.value) {
        await checkDeepLinkSession(deepLinkShareId.value);
      }
    }
  } catch (error) {
    console.error('Sign out error:', error);
  }
};

onMounted(async () => {
  let share: string | null = null;
  const params = new URLSearchParams(window.location.search);
  const queryShare = params.get('share');
  if (queryShare) {
    share = queryShare;
  } else {
    const pathMatch = window.location.pathname.match(/\/chat\/(.+)$/);
    if (pathMatch && pathMatch[1]) {
      share = pathMatch[1];
      const newUrl = `${window.location.origin}/?share=${encodeURIComponent(share)}${window.location.hash}`;
      window.history.replaceState({}, '', newUrl);
    }
  }

  if (share) {
    deepLinkShareId.value = share;
    showDeepLinkAccess.value = true;
  }

  // Check if user is already authenticated
  try {
    const response = await fetch('/api/current-user', {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.authenticated) {
      const info: DeepLinkInfo | null = data.user?.deepLinkInfo
        ? {
            shareId: data.user.deepLinkInfo.activeShareId || share || (Array.isArray(data.user.deepLinkInfo.shareIds) ? data.user.deepLinkInfo.shareIds[0] : null) || null,
            chatId: data.user.deepLinkInfo.chatId || null
          }
        : (share ? { shareId: share, chatId: null } : null);
      setAuthenticatedUser(data.user, info);
      if (info?.shareId && window.location.search.indexOf(`share=${info.shareId}`) === -1) {
        const normalizedUrl = `${window.location.origin}/?share=${encodeURIComponent(info.shareId)}${window.location.hash}`;
        window.history.replaceState({}, '', normalizedUrl);
      }
      return;
    }
  } catch (error) {
    console.error('Auth check error:', error);
  }

  if (share) {
    await checkDeepLinkSession(share);
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

