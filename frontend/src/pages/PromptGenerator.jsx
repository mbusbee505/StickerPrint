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

  // Image deconstruct state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [imageResults, setImageResults] = useState([]);
  const [deconstructHistory, setDeconstructHistory] = useState([]);

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

      // Load deconstruct history
      await loadDeconstructHistory();
    } catch (error) {
      console.error('[DATA] Load error:', error);
      showToast('error', 'Failed to load data');
    }
  };

  const loadDeconstructHistory = async () => {
    try {
      const response = await fetch('/api/deconstruct/history');
      const data = await response.json();
      setDeconstructHistory(data);
    } catch (error) {
      console.error('Failed to load deconstruct history:', error);
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

  // Image deconstruct handlers
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    setImageResults([]);
  };

  const handleAnalyzeImages = async () => {
    if (selectedFiles.length === 0) return;

    setIsAnalyzing(true);
    setImageResults([]);

    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('/api/deconstruct/analyze', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Analysis failed' }));
        throw new Error(errorData.detail || 'Analysis failed');
      }

      const data = await response.json();
      setImageResults(data);
      showToast('success', `Generated ${data.length} prompts from images!`);
      await loadAllData();
    } catch (error) {
      console.error('Failed to analyze images:', error);
      showToast('error', error.message || 'Failed to analyze images');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const clearImageSelection = () => {
    setSelectedFiles([]);
    setImageResults([]);
  };

  const downloadDeconstructResult = (uploadId) => {
    window.open(`/api/deconstruct/download/${uploadId}`, '_blank');
  };

  const deleteDeconstructUpload = async (uploadId) => {
    if (!confirm('Delete this upload?')) return;

    try {
      await fetch(`/api/deconstruct/history/${uploadId}`, {
        method: 'DELETE'
      });
      showToast('success', 'Upload deleted');
      await loadDeconstructHistory();
    } catch (error) {
      console.error('Failed to delete upload:', error);
      showToast('error', 'Failed to delete upload');
    }
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
        {/* Left Panel - Two Sections */}
        <div className="flex-1 flex flex-col gap-4">
          {/* From Text Section */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                From Text
              </h2>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Enter demographic research or description of your target audience. The AI will generate 100 unique sticker design prompts.
              </p>

              <form onSubmit={handleGenerate}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Demographic Research / Audience Description
                  </label>
                  <textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    rows={8}
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

          {/* From Image Section */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                From Image
              </h2>
              {selectedFiles.length > 0 && (
                <button
                  onClick={clearImageSelection}
                  className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedFiles.length === 0 && imageResults.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Upload images to generate sticker design prompts based on their style and content
                  </p>
                  <label className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    Choose Images
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {selectedFiles.length > 0 && imageResults.length === 0 && (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-gray-700 dark:text-gray-300 mb-4">
                      {selectedFiles.length} image{selectedFiles.length !== 1 ? 's' : ''} selected
                    </p>
                    <button
                      onClick={handleAnalyzeImages}
                      disabled={isAnalyzing}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {isAnalyzing ? 'Analyzing...' : 'Analyze Images'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-full h-24 object-cover rounded mb-1"
                        />
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                          {file.name}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {imageResults.length > 0 && (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
                      Analysis Complete!
                    </h3>
                    <p className="text-green-800 dark:text-green-200">
                      Generated {imageResults.length} sticker design prompt{imageResults.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {imageResults.map((result, idx) => (
                      <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-600 text-white text-xs font-bold rounded-full flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 truncate">
                              {result.filename}
                            </p>
                            <p className="text-sm text-gray-900 dark:text-white line-clamp-2">
                              {result.prompt}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadDeconstructResult(deconstructHistory[0]?.id)}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Download
                    </button>
                    <label className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer">
                      Analyze More
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}

              {isAnalyzing && (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Analyzing images and generating prompts...
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Queue and Previously Generated Files */}
        <div className="w-96 flex flex-col gap-4">
          {/* Prompt Queue Section */}
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Prompt Queue
              </h3>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {promptQueue.filter(q => q.status === 'pending').length}
              </span>
            </div>
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

          {/* Generated Prompts Section */}
          <div className="h-96 bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Generated Prompts
              </h3>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {generatedFiles.length}
              </span>
            </div>
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
