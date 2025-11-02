/**
 * Knowledge Base client for DigitalOcean GenAI
 */

export class KbClient {
  constructor(doClient) {
    this.client = doClient;
  }

  /**
   * List all knowledge bases
   */
  async list() {
    const response = await this.client.request('/v2/gen-ai/knowledge_bases');
    return response.knowledge_bases || response.data?.knowledge_bases || [];
  }

  /**
   * Get knowledge base details
   */
  async get(kbId) {
    const response = await this.client.request(`/v2/gen-ai/knowledge_bases/${kbId}`);
    return response.knowledge_base || response.data || response;
  }

  /**
   * Create a new knowledge base
   */
  async create(options) {
    const {
      name,
      description,
      projectId,
      databaseId,
      embeddingModelId,
      bucketName = 'maia',
      itemPath,
      region
    } = options;

    if (!name || !projectId || !databaseId) {
      throw new Error('name, projectId, and databaseId are required');
    }

    const kbData = {
      name,
      description: description || `${name} description`,
      project_id: projectId,
      database_id: databaseId,
      region: region || this.client.region,
      datasources: [
        {
          spaces_data_source: {
            bucket_name: bucketName,
            item_path: itemPath || '',
            region: region || this.client.region
          }
        }
      ]
    };

    if (embeddingModelId) {
      kbData.embedding_model_uuid = embeddingModelId;
    }

    const response = await this.client.request('/v2/gen-ai/knowledge_bases', {
      method: 'POST',
      body: JSON.stringify(kbData)
    });

    return response.knowledge_base || response.data || response;
  }

  /**
   * Update knowledge base
   */
  async update(kbId, updates) {
    const response = await this.client.request(`/v2/gen-ai/knowledge_bases/${kbId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });

    return response.knowledge_base || response.data || response;
  }

  /**
   * Delete knowledge base
   */
  async delete(kbId) {
    await this.client.request(`/v2/gen-ai/knowledge_bases/${kbId}`, {
      method: 'DELETE'
    });
    return { deleted: true };
  }

  /**
   * Add data source to knowledge base
   */
  async addDataSource(kbId, dataSourceOptions) {
    const { bucketName = 'maia', itemPath, region } = dataSourceOptions;

    if (!itemPath) {
      throw new Error('itemPath is required for data source');
    }

    const dataSourceData = {
      spaces_data_source: {
        bucket_name: bucketName,
        item_path: itemPath,
        region: region || this.client.region
      }
    };

    const response = await this.client.request(`/v2/gen-ai/knowledge_bases/${kbId}/data_sources`, {
      method: 'POST',
      body: JSON.stringify(dataSourceData)
    });

    return response.data_source || response.data || response;
  }

  /**
   * Delete data source from knowledge base
   */
  async deleteDataSource(kbId, dataSourceId) {
    await this.client.request(`/v2/gen-ai/knowledge_bases/${kbId}/data_sources/${dataSourceId}`, {
      method: 'DELETE'
    });
    return { deleted: true };
  }
}

