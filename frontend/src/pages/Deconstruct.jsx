import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function Deconstruct() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/deconstruct/history`);
      const data = await response.json();
      setHistory(data);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    setResults([]);
  };

  const handleAnalyze = async () => {
    if (selectedFiles.length === 0) return;

    setIsAnalyzing(true);
    setResults([]);

    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch(`${API_BASE}/api/deconstruct/analyze`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setResults(data);
      loadHistory();
    } catch (error) {
      console.error('Failed to analyze images:', error);
      alert('Failed to analyze images. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadResult = (uploadId) => {
    window.open(`${API_BASE}/api/deconstruct/download/${uploadId}`, '_blank');
  };

  const deleteUpload = async (uploadId) => {
    if (!confirm('Delete this upload?')) return;

    try {
      await fetch(`${API_BASE}/api/deconstruct/history/${uploadId}`, {
        method: 'DELETE'
      });
      loadHistory();
    } catch (error) {
      console.error('Failed to delete upload:', error);
    }
  };

  const clearSelection = () => {
    setSelectedFiles([]);
    setResults([]);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left Panel - Upload & Results */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Deconstruct Images
          </h2>
          {selectedFiles.length > 0 && (
            <button
              onClick={clearSelection}
              className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedFiles.length === 0 && results.length === 0 && (
            <div className="text-center py-12">
              <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                Upload Image(s) to Analyze
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Upload one or more images to generate sticker design prompts based on their style and content
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

          {selectedFiles.length > 0 && results.length === 0 && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  {selectedFiles.length} image{selectedFiles.length !== 1 ? 's' : ''} selected
                </p>
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Analyze Images'}
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-32 object-cover rounded mb-2"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {file.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">
                  Analysis Complete!
                </h3>
                <p className="text-green-800 dark:text-green-200">
                  Generated {results.length} sticker design prompt{results.length !== 1 ? 's' : ''}
                </p>
              </div>

              {results.map((result, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {result.filename}
                      </p>
                      <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                        {result.prompt}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <button
                  onClick={() => downloadResult(history[0]?.id)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Download Prompts (.txt)
                </button>
                <label className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer">
                  Analyze More Images
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
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-700 dark:text-gray-300">
                  Analyzing images and generating prompts...
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - History */}
      <div className="w-96 bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-hidden flex flex-col">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Upload History
        </h3>
        <div className="flex-1 overflow-y-auto space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No uploads yet
            </p>
          )}
          {history.map((upload) => (
            <div
              key={upload.id}
              className="p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Upload #{upload.id}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {upload.image_count} image{upload.image_count !== 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(upload.created_at).toLocaleString()}
                  </div>
                  <button
                    onClick={() => downloadResult(upload.id)}
                    className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Download
                  </button>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteUpload(upload.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 dark:text-red-400"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Deconstruct;
