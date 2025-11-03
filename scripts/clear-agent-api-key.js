/**
 * Script to clear invalid agent API key from user document
 */

import dotenv from 'dotenv';
import { CloudantClient } from '../lib/cloudant/index.js';

dotenv.config();

async function clearAgentApiKey(userId) {
  try {
    const cloudant = new CloudantClient({
      url: process.env.CLOUDANT_URL,
      username: process.env.CLOUDANT_USERNAME,
      password: process.env.CLOUDANT_PASSWORD
    });
    
    // Get user document
    const userDoc = await cloudant.getDocument('maia_users', userId);
    
    if (!userDoc) {
      console.log(`User ${userId} not found`);
      return;
    }
    
    console.log(`User ${userId} found`);
    console.log(`Current agentApiKey: ${userDoc.agentApiKey ? userDoc.agentApiKey.substring(0, 20) + '...' : 'null'}`);
    
    // Clear the API key
    userDoc.agentApiKey = undefined;
    await cloudant.saveDocument('maia_users', userDoc);
    
    console.log(`✅ Cleared agentApiKey for user ${userId}`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Get userId from command line
const userId = process.argv[2];
if (!userId) {
  console.log('Usage: node scripts/clear-agent-api-key.js <userId>');
  process.exit(1);
}

clearAgentApiKey(userId).then(() => process.exit(0));

