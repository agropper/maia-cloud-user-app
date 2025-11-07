/**
 * Script to check KB datasource configuration
 */

import { config } from 'dotenv';
import { DigitalOceanClient } from '../lib/do-client/index.js';

config();

const kbId = process.argv[2] || '3acb4ee8-bb5f-11f0-b074-4e013e2ddde4';

async function checkKB() {
  try {
    const doClient = new DigitalOceanClient(process.env.DIGITALOCEAN_TOKEN);
    const kb = await doClient.kb.get(kbId);
    
    console.log('\n📊 KB Raw Response:');
    console.log(JSON.stringify(kb, null, 2));
    
    console.log('\n📊 KB Details:');
    console.log(`   Name: ${kb.name}`);
    console.log(`   UUID: ${kb.uuid}`);
    console.log('\n📦 Data Sources:');
    
    // Check multiple possible field names
    const datasources = kb.datasources || kb.data_sources || kb.knowledge_base_data_sources || [];
    
    if (datasources && datasources.length > 0) {
      datasources.forEach((ds, idx) => {
        console.log(`   ${idx + 1}. UUID: ${ds.uuid}`);
        if (ds.spaces_data_source) {
          console.log(`      Bucket: ${ds.spaces_data_source.bucket_name}`);
          console.log(`      Item Path: ${ds.spaces_data_source.item_path}`);
          console.log(`      Region: ${ds.spaces_data_source.region}`);
        }
      });
    } else {
      console.log('   No datasources found');
      console.log('   (Checked: datasources, data_sources, knowledge_base_data_sources)');
    }
    console.log('');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkKB();

