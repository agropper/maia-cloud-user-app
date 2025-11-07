/**
 * Script to fix KB name mismatch in user document
 * Usage: node scripts/fix-kb-names.js <userId> <actualKBName>
 */

import { config } from 'dotenv';
import { CloudantClient } from '../lib/cloudant/index.js';

config();

async function fixNames() {
  const userId = process.argv[2] || 'do3';
  const actualKBName = process.argv[3] || 'do3-kb-11062025';

  try {
    const cloudant = new CloudantClient({
      url: process.env.CLOUDANT_URL,
      username: process.env.CLOUDANT_USERNAME,
      password: process.env.CLOUDANT_PASSWORD
    });

    console.log(`\n📝 Fixing KB names for user ${userId}...\n`);

    // Get user document
    const userDoc = await cloudant.getDocument('maia_users', userId);
    
    if (!userDoc) {
      console.error(`❌ User ${userId} not found`);
      process.exit(1);
    }

    console.log('Current values:');
    console.log(`   kbName: ${userDoc.kbName}`);
    console.log(`   connectedKBs: ${JSON.stringify(userDoc.connectedKBs)}`);
    console.log(`   connectedKB: ${userDoc.connectedKB}`);
    console.log(`   kbId: ${userDoc.kbId}\n`);

    // Update to match actual KB name
    userDoc.kbName = actualKBName;
    userDoc.connectedKBs = [actualKBName];
    userDoc.connectedKB = actualKBName;
    userDoc.updatedAt = new Date().toISOString();

    await cloudant.saveDocument('maia_users', userDoc);

    console.log('✅ Updated to:');
    console.log(`   kbName: ${actualKBName}`);
    console.log(`   connectedKBs: ["${actualKBName}"]`);
    console.log(`   connectedKB: ${actualKBName}`);
    console.log(`   kbId: ${userDoc.kbId} (unchanged)\n`);

    console.log('✅ Done! Reload the app to see the correct KB name.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixNames();

