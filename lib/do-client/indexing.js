/**
 * Indexing jobs client for DigitalOcean GenAI
 */

export class IndexingClient {
  constructor(doClient) {
    this.client = doClient;
  }

  /**
   * Start an indexing job for a specific data source
   */
  async start(kbId, dataSourceUuid) {
    const response = await this.client.request(
      `/v2/gen-ai/knowledge_bases/${kbId}/indexing_jobs`,
      {
        method: 'POST',
        body: JSON.stringify({
          data_source_uuid: dataSourceUuid
        })
      }
    );

    return response.indexing_job || response.data || response;
  }

  /**
   * Start global indexing job (alternative endpoint)
   */
  async startGlobal(kbId, dataSourceUuids) {
    const response = await this.client.request('/v2/gen-ai/indexing_jobs', {
      method: 'POST',
      body: JSON.stringify({
        knowledge_base_uuid: kbId,
        data_source_uuids: Array.isArray(dataSourceUuids) ? dataSourceUuids : [dataSourceUuids]
      })
    });

    return response.indexing_job || response.data || response;
  }

  /**
   * Get indexing job status
   */
  async getStatus(jobId) {
    const response = await this.client.request(`/v2/gen-ai/indexing_jobs/${jobId}`);
    return response.indexing_job || response.data || response;
  }

  /**
   * Poll indexing job until completion
   */
  async poll(jobId, options = {}) {
    const { maxAttempts = 500, intervalMs = 5000, onProgress } = options;

    let attempts = 0;
    while (attempts < maxAttempts) {
      const status = await this.getStatus(jobId);

      if (onProgress) {
        onProgress(status, attempts + 1);
      }

      if (status.status === 'INDEX_JOB_STATUS_COMPLETED') {
        return status;
      }

      if (status.status === 'INDEX_JOB_STATUS_FAILED') {
        throw new Error(`Indexing job failed: ${status.error || 'Unknown error'}`);
      }

      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }

    throw new Error(`Indexing job timed out after ${maxAttempts} attempts`);
  }
}

