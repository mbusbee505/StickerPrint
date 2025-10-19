import { useState, useEffect } from 'react';
import { api } from '../services/api';

function PromptGenerator() {
  const [userInput, setUserInput] = useState('');
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadGeneratedFiles();
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

  const loadGeneratedFiles = async () => {
    try {
      const files = await api.listGeneratedPromptFiles();
      setGeneratedFiles(files);
    } catch (error) {
      showToast('error', 'Failed to load generated files');
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

      // Reload file list
      await loadGeneratedFiles();

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

        {/* Right Panel - Previously Generated Files */}
        <div className="w-96 bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-hidden flex flex-col">
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
                  <button
                    onClick={() => handleDownload(file.id, file.filename)}
                    className="w-full px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                  >
                    Download
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default PromptGenerator;
