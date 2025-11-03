/**
 * Agent helper for getting and creating API keys for agents
 */

import { AgentClient } from '../../lib/do-client/agent.js';

/**
 * Get agent API key from user document
 * If missing, create a new one
 * If invalid, recreate it
 */
export async function getOrCreateAgentApiKey(doClient, cloudant, userId, agentId) {
  try {
    // Get user document
    const userDoc = await cloudant.getDocument('maia_users', userId);
    
    // Check if user has a stored API key
    if (userDoc.agentApiKey) {
      // Validate that the key exists in DO API
      const agentClient = new AgentClient(doClient);
      const apiKeys = await agentClient.listApiKeys(agentId);
      const keyExists = apiKeys.some(key => key.secret_key === userDoc.agentApiKey || key.name === `agent-${agentId}-api-key`);
      
      if (!keyExists) {
        console.log(`Stored API key not found in DO API for agent ${agentId}, recreating...`);
        // Key doesn't exist in DO - recreate it
        const apiKey = await agentClient.createApiKey(agentId, `agent-${agentId}-api-key`);
        userDoc.agentApiKey = apiKey;
        await cloudant.saveDocument('maia_users', userDoc);
        return apiKey;
      }
      
      return userDoc.agentApiKey;
    }
    
    // No API key stored - create one
    const agentClient = new AgentClient(doClient);
    const apiKey = await agentClient.createApiKey(agentId, `agent-${agentId}-api-key`);
    
    if (!apiKey) {
      throw new Error('API key was null/undefined after creation');
    }
    
    // Save the new API key to the user document
    userDoc.agentApiKey = apiKey;
    await cloudant.saveDocument('maia_users', userDoc);
    
    return apiKey;
  } catch (error) {
    console.error(`Error in getOrCreateAgentApiKey for user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Recreate agent API key (used when existing key is invalid)
 */
export async function recreateAgentApiKey(doClient, cloudant, userId, agentId) {
  try {
    // Get user document
    const userDoc = await cloudant.getDocument('maia_users', userId);
    
    const agentClient = new AgentClient(doClient);
    const apiKey = await agentClient.createApiKey(agentId, `agent-${agentId}-api-key`);
    
    if (!apiKey) {
      throw new Error('API key was null/undefined after creation');
    }
    
    // Save the new API key to the user document
    userDoc.agentApiKey = apiKey;
    await cloudant.saveDocument('maia_users', userDoc);
    
    return apiKey;
  } catch (error) {
    console.error(`Error recreating API key for agent ${agentId}:`, error.message);
    throw error;
  }
}

/**
 * Find user's agent by name pattern (e.g., "sun6-agent-*" for user "sun6")
 */
export async function findUserAgent(doClient, userId) {
  try {
    const agentClient = new AgentClient(doClient);
    const agents = await agentClient.list();
    
    // Pattern: {userId}-agent-*
    const agentPattern = new RegExp(`^${userId}-agent-`);
    const userAgent = agents.find(agent => agentPattern.test(agent.name));
    
    if (userAgent) {
      console.log(`Found agent for ${userId}:`, JSON.stringify(userAgent, null, 2));
    }
    
    return userAgent || null;
  } catch (error) {
    console.error(`Error finding agent for user ${userId}:`, error.message);
    return null;
  }
}
