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

  // Jobs
  async createJob(promptsFileId) {
    const response = await fetch(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts_file_id: promptsFileId }),
    });
    if (!response.ok) throw new Error('Failed to create job');
    return response.json();
  },

  async listJobs(limit = 50) {
    const response = await fetch(`${API_BASE_URL}/jobs?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch jobs');
    return response.json();
  },

  async getJob(jobId) {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
    if (!response.ok) throw new Error('Failed to fetch job');
    return response.json();
  },

  async cancelJob(jobId) {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to cancel job');
    return response.json();
  },

  async deleteAllJobs() {
    const response = await fetch(`${API_BASE_URL}/jobs/all`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete all jobs');
    return response.json();
  },

  // Images
  async listImages(jobId = null, page = 1, pageSize = 100) {
    let url = `${API_BASE_URL}/images?page=${page}&page_size=${pageSize}`;
    if (jobId !== null) url += `&job_id=${jobId}`;
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
  getJobZipUrl(jobId) {
    return `${API_BASE_URL}/jobs/${jobId}/zip`;
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

  // Prompt Generator
  async generatePrompts(userInput) {
    const response = await fetch(`${API_BASE_URL}/prompt-generator/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_input: userInput }),
    });
    if (!response.ok) throw new Error('Failed to generate prompts');
    return response.json();
  },

  async listGeneratedPromptFiles() {
    const response = await fetch(`${API_BASE_URL}/prompt-generator/list`);
    if (!response.ok) throw new Error('Failed to fetch generated files');
    return response.json();
  },

  getGeneratedPromptFileUrl(fileId) {
    return `${API_BASE_URL}/prompt-generator/download/${fileId}`;
  },

  async queueGeneratedPromptFile(fileId) {
    const response = await fetch(`${API_BASE_URL}/prompt-generator/queue/${fileId}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to queue file');
    return response.json();
  },
};
