import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { sseClient } from '../services/sse';

function Dashboard() {
  const navigate = useNavigate();
  const [promptsFiles, setPromptsFiles] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadData();

    const handleRunUpdate = (data) => {
      loadData();
    };

    sseClient.on('run_updated', handleRunUpdate);
    sseClient.on('zip_ready', handleRunUpdate);

    return () => {
      sseClient.off('run_updated', handleRunUpdate);
      sseClient.off('zip_ready', handleRunUpdate);
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

  const showToast = (type, text) => {
    setToast({ type, text });
  };

  const loadData = async () => {
    try {
      const [filesData, runsData] = await Promise.all([
        api.listPromptsFiles(),
        api.listRuns(),
      ]);
      setPromptsFiles(filesData);
      setRuns(runsData);
    } catch (error) {
      showToast('error', 'Failed to load data');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await api.uploadPromptsFile(file);
      setUploadedFile(result);
      setSelectedFileId(result.id);
      showToast('success', `Uploaded ${result.lines} prompts successfully!`);
      await loadData();
    } catch (error) {
      showToast('error', 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleStartRun = async () => {
    if (!selectedFileId) return;

    try {
      await api.createRun(selectedFileId);
      showToast('success', 'Run started successfully!');
      setUploadedFile(null);
      setSelectedFileId(null);
      await loadData();
    } catch (error) {
      showToast('error', 'Failed to start run');
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      queued: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      succeeded: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      canceled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[status]}`}>
        {status}
      </span>
    );
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        Dashboard
      </h1>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
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

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Upload Prompts
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select .txt file with prompts (one per line)
          </label>
          <input
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            disabled={uploading}
            className="block w-full text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 cursor-pointer focus:outline-none"
          />
        </div>

        {uploadedFile && (
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded">
            <p className="text-sm text-gray-900 dark:text-white">
              <strong>File:</strong> {uploadedFile.filename}
            </p>
            <p className="text-sm text-gray-900 dark:text-white">
              <strong>Prompts:</strong> {uploadedFile.lines}
            </p>
          </div>
        )}

        <button
          onClick={handleStartRun}
          disabled={!selectedFileId || uploading}
          className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Start Run
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Run History
        </h2>

        {runs.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No runs yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Images
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Started
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {run.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(run.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {run.image_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => navigate(`/gallery?run_id=${run.id}`)}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        View
                      </button>
                      {run.zip_ready && (
                        <a
                          href={api.getRunZipUrl(run.id)}
                          download
                          className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                        >
                          Download ZIP
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
