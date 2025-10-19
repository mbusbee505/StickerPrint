import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { sseClient } from '../services/sse';

function Config() {
  const [config, setConfig] = useState({
    base_prompt: '',
    api_key: '',
    model: '',
    provider: '',
    prompt_designer_template: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAction, setDeleteAction] = useState(null);

  useEffect(() => {
    loadConfig();

    const handleConfigUpdate = () => {
      loadConfig();
    };

    sseClient.on('config_updated', handleConfigUpdate);

    return () => {
      sseClient.off('config_updated', handleConfigUpdate);
    };
  }, []);

  useEffect(() => {
    // Auto-dismiss toast after 3 seconds
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadConfig = async () => {
    try {
      const data = await api.getConfig();
      setConfig(data);
    } catch (error) {
      showToast('error', 'Failed to load config');
    }
  };

  const showToast = (type, text) => {
    setToast({ type, text });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await api.updateConfig(config);
      showToast('success', 'Configuration saved successfully!');
    } catch (error) {
      showToast('error', 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setConfig({ ...config, [field]: value });
  };

  const handleDeleteAll = async () => {
    try {
      await api.deleteAllImages();
      setShowDeleteConfirm(false);
      setDeleteAction(null);
      showToast('success', 'All images deleted successfully!');
    } catch (error) {
      showToast('error', 'Failed to delete images');
    }
  };

  const handleDeleteGeneratedPromptFiles = async () => {
    try {
      await api.deleteAllGeneratedPromptFiles();
      setShowDeleteConfirm(false);
      setDeleteAction(null);
      showToast('success', 'All generated prompt files deleted successfully!');
    } catch (error) {
      showToast('error', 'Failed to delete generated prompt files');
    }
  };

  const handleDeletePromptQueue = async () => {
    try {
      await api.deleteAllPromptQueue();
      setShowDeleteConfirm(false);
      setDeleteAction(null);
      showToast('success', 'All prompt queue items deleted successfully!');
    } catch (error) {
      showToast('error', 'Failed to delete prompt queue');
    }
  };

  const handleDeletePromptsFiles = async () => {
    try {
      await api.deleteAllPromptsFiles();
      setShowDeleteConfirm(false);
      setDeleteAction(null);
      showToast('success', 'All prompts files deleted successfully!');
    } catch (error) {
      showToast('error', 'Failed to delete prompts files');
    }
  };

  const handleDeleteJobs = async () => {
    try {
      await api.deleteAllJobs();
      setShowDeleteConfirm(false);
      setDeleteAction(null);
      showToast('success', 'All jobs deleted successfully!');
    } catch (error) {
      showToast('error', 'Failed to delete jobs');
    }
  };

  const handleDeleteResearchHistory = async () => {
    try {
      await api.deleteAllResearchSessions();
      setShowDeleteConfirm(false);
      setDeleteAction(null);
      showToast('success', 'All research history deleted successfully!');
    } catch (error) {
      showToast('error', 'Failed to delete research history');
    }
  };

  const openDeleteConfirm = (action) => {
    setDeleteAction(action);
    setShowDeleteConfirm(true);
  };

  const executeDelete = () => {
    switch (deleteAction) {
      case 'images':
        handleDeleteAll();
        break;
      case 'generated_prompts':
        handleDeleteGeneratedPromptFiles();
        break;
      case 'prompt_queue':
        handleDeletePromptQueue();
        break;
      case 'prompts_files':
        handleDeletePromptsFiles();
        break;
      case 'jobs':
        handleDeleteJobs();
        break;
      case 'research':
        handleDeleteResearchHistory();
        break;
      default:
        setShowDeleteConfirm(false);
        setDeleteAction(null);
    }
  };

  const getDeleteConfirmMessage = () => {
    switch (deleteAction) {
      case 'images':
        return 'Are you sure you want to delete all images? This action cannot be undone.';
      case 'generated_prompts':
        return 'Are you sure you want to delete all saved generated prompt files? This action cannot be undone.';
      case 'prompt_queue':
        return 'Are you sure you want to delete all prompt queue items? This action cannot be undone.';
      case 'prompts_files':
        return 'Are you sure you want to delete all pending or completed prompt files? This action cannot be undone.';
      case 'jobs':
        return 'Are you sure you want to delete all jobs? This action cannot be undone.';
      case 'research':
        return 'Are you sure you want to delete all research history? This action cannot be undone.';
      default:
        return 'Are you sure you want to proceed? This action cannot be undone.';
    }
  };

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        Configuration
      </h1>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-4 z-50 animate-slide-in">
          <div
            className={`px-6 py-4 rounded-lg shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {toast.type === 'success' ? '✓' : '✕'}
              </span>
              <span className="font-medium">{toast.text}</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Base Prompt
          </label>
          <textarea
            value={config.base_prompt || ''}
            onChange={(e) => handleChange('base_prompt', e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Enter the base styling prompt that will be appended to all user prompts"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This prompt will be automatically appended to every user prompt during image generation.
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API Key
          </label>
          <div className="flex">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={config.api_key || ''}
              onChange={(e) => handleChange('api_key', e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter your OpenAI API key"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-r hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your OpenAI API key for image generation. Changes apply to new runs immediately.
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Model (Optional)
          </label>
          <input
            type="text"
            value={config.model || ''}
            onChange={(e) => handleChange('model', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="gpt-image-1"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Provider (Optional)
          </label>
          <input
            type="text"
            value={config.provider || ''}
            onChange={(e) => handleChange('provider', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="OpenAI"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Prompt Designer Template
          </label>
          <textarea
            value={config.prompt_designer_template || ''}
            onChange={(e) => handleChange('prompt_designer_template', e.target.value)}
            rows={15}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
            placeholder="Enter the prompt template for generating sticker design prompts"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This template is used by the Prompt Generator. Use {'{USER_INPUT}'} as a placeholder for the user's demographic research input.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>

      {/* Danger Zone */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mt-6 border-2 border-red-500">
        <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
          Danger Zone
        </h2>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Permanently delete data from the system. These actions cannot be undone.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => openDeleteConfirm('images')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-left"
          >
            Delete All Images
          </button>
          <button
            onClick={() => openDeleteConfirm('generated_prompts')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-left"
          >
            Delete Generated Prompt Files
          </button>
          <button
            onClick={() => openDeleteConfirm('prompt_queue')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-left"
          >
            Delete Prompt Queue Items
          </button>
          <button
            onClick={() => openDeleteConfirm('prompts_files')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-left"
          >
            Delete Prompts Files
          </button>
          <button
            onClick={() => openDeleteConfirm('jobs')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-left"
          >
            Delete All Jobs
          </button>
          <button
            onClick={() => openDeleteConfirm('research')}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-left"
          >
            Delete Research History
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Confirm Delete
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              {getDeleteConfirmMessage()}
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteAction(null);
                }}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Config;
