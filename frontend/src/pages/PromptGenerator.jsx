import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { sseClient } from '../services/sse';

function PromptGenerator() {
  const [userInput, setUserInput] = useState('');
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [promptQueue, setPromptQueue] = useState([]);
  const [promptsFiles, setPromptsFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadAllData();

    // Set up SSE listeners for live updates
    const handlePromptQueueUpdated = (data) => {
      console.log('Prompt queue updated:', data);
      loadAllData();
    };

    const handlePromptsFileAdded = (data) => {
      console.log('Prompts file added:', data);
      loadAllData();
    };

    sseClient.on('prompt_queue_updated', handlePromptQueueUpdated);
    sseClient.on('prompts_file_added', handlePromptsFileAdded);

    return () => {
      sseClient.off('prompt_queue_updated', handlePromptQueueUpdated);
      sseClient.off('prompts_file_added', handlePromptsFileAdded);
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


  const loadAllData = async () => {
    try {
      const [files, queue, prompts] = await Promise.all([
        api.listGeneratedPromptFiles(),
        api.listPromptQueue(),
        api.listPromptsFiles()
      ]);
      console.log('[DATA] Loaded:', { files: files.length, queue: queue.length, prompts: prompts.length });
      setGeneratedFiles(files);
      setPromptQueue(queue);
      setPromptsFiles(prompts);
    } catch (error) {
      console.error('[DATA] Load error:', error);
      showToast('error', 'Failed to load data');
    }
  };

  const showToast = (type, text) => {
    setToast({ type, text });
  };

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (!userInput.trim()) {
      showToast('error', 'Please enter demographic research text');
      return;
    }

    setLoading(true);

    try {
      const result = await api.generatePrompts(userInput);
      showToast('success', `Generated ${result.prompt_count} prompts!`);

      // Automatically download the file
      const downloadUrl = api.getGeneratedPromptFileUrl(result.id);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Reload data
      await loadAllData();

      // Clear input
      setUserInput('');
    } catch (error) {
      showToast('error', error.message || 'Failed to generate prompts');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (fileId, filename) => {
    const downloadUrl = api.getGeneratedPromptFileUrl(fileId);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleQueue = async (fileId, filename) => {
    try {
      console.log('[QUEUE] Queuing file:', fileId, filename);
      const result = await api.queueGeneratedPromptFile(fileId);
      console.log('[QUEUE] Queue result:', result);
      if (result.already_queued) {
        showToast('error', 'File already in prompt queue');
      } else {
        showToast('success', `${filename} added to queue!`);
        await loadAllData();
      }
    } catch (error) {
      console.error('[QUEUE] Error:', error);
      showToast('error', error.message || 'Failed to queue file');
    }
  };

  const handleRemoveFromQueue = async (queueId, filename) => {
    try {
      await api.removeFromPromptQueue(queueId);
      showToast('success', `${filename} removed from queue`);
      await loadAllData();
    } catch (error) {
      showToast('error', error.message || 'Failed to remove from queue');
    }
  };

  const getQueueStatusBadge = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    };

    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <>
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

      <div className="flex h-[calc(100vh-8rem)] gap-4">
        {/* Left Panel - Generation Form */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Generate Sticker Prompts
            </h2>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Enter demographic research or description of your target audience. The AI will generate 100 unique sticker design prompts optimized for image generation.
            </p>

            <form onSubmit={handleGenerate}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Demographic Research / Audience Description
                </label>
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  rows={15}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Describe your target audience, their interests, demographics, cultural references, hobbies, etc..."
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !userInput.trim()}
                className="w-full sm:w-auto px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Generating Prompts...' : 'Generate 100 Prompts'}
              </button>
            </form>

            {loading && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900 rounded">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Generating prompts using GPT-5 Thinking Extended... This may take 30-60 seconds.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Queue and Previously Generated Files */}
        <div className="w-96 flex flex-col gap-4">
          {/* Prompt Queue Section */}
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-hidden flex flex-col">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Prompt Queue ({promptQueue.filter(q => q.status === 'pending').length})
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Files will be automatically sent to the job queue one at a time.
            </p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {promptQueue.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No items in queue
                </p>
              ) : (
                promptQueue.map((item) => (
                  <div
                    key={item.id}
                    className="p-2 bg-gray-50 dark:bg-gray-700 rounded"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 dark:text-white truncate">
                          {item.filename}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {getQueueStatusBadge(item.status)}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {item.prompt_count} prompts
                          </span>
                        </div>
                      </div>
                      {item.status === 'pending' && (
                        <button
                          onClick={() => handleRemoveFromQueue(item.id, item.filename)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Previously Generated Files Section */}
          <div className="h-96 bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-hidden flex flex-col">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Previously Generated Files ({generatedFiles.length})
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2">
              {generatedFiles.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  No files generated yet
                </p>
              ) : (
                generatedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {file.filename}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            {file.prompt_count} prompts
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(file.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 mb-2">
                      {file.user_input}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(file.id, file.filename)}
                        className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => handleQueue(file.id, file.filename)}
                        className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                      >
                        Queue
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default PromptGenerator;
