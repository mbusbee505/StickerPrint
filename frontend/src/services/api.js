const API_BASE_URL = '/api';

export const api = {
  // Prompts
  async uploadPromptsFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE_URL}/prompts/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Upload failed');
    return response.json();
  },

  async listPromptsFiles() {
    const response = await fetch(`${API_BASE_URL}/prompts`);
    if (!response.ok) throw new Error('Failed to fetch prompts');
    return response.json();
  },

  // Runs
  async createRun(promptsFileId) {
    const response = await fetch(`${API_BASE_URL}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts_file_id: promptsFileId }),
    });
    if (!response.ok) throw new Error('Failed to create run');
    return response.json();
  },

  async listRuns(limit = 50) {
    const response = await fetch(`${API_BASE_URL}/runs?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch runs');
    return response.json();
  },

  async getRun(runId) {
    const response = await fetch(`${API_BASE_URL}/runs/${runId}`);
    if (!response.ok) throw new Error('Failed to fetch run');
    return response.json();
  },

  // Images
  async listImages(runId = null, page = 1, pageSize = 100) {
    let url = `${API_BASE_URL}/images?page=${page}&page_size=${pageSize}`;
    if (runId !== null) url += `&run_id=${runId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch images');
    return response.json();
  },

  async deleteAllImages() {
    const response = await fetch(`${API_BASE_URL}/images`, {
      method: 'DELETE',
      headers: { 'X-Confirm': 'delete-all' },
    });
    if (!response.ok) throw new Error('Failed to delete images');
    return response.json();
  },

  // ZIPs
  getRunZipUrl(runId) {
    return `${API_BASE_URL}/runs/${runId}/zip`;
  },

  getLatestZipUrl() {
    return `${API_BASE_URL}/zips/latest`;
  },

  getAllZipUrl() {
    return `${API_BASE_URL}/zips/all`;
  },

  // Config
  async getConfig() {
    const response = await fetch(`${API_BASE_URL}/config`);
    if (!response.ok) throw new Error('Failed to fetch config');
    return response.json();
  },

  async updateConfig(config) {
    const response = await fetch(`${API_BASE_URL}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to update config');
    return response.json();
  },
};
