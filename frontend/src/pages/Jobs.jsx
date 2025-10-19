import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { sseClient } from '../services/sse';

function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadData();

    // Handle real-time updates via SSE
    const handleJobUpdate = (data) => {
      loadData(); // Reload all jobs when any job updates
    };

    const handleImageCreated = (data) => {
      loadData(); // Reload to update image counts and progress
    };

    const handleZipReady = (data) => {
      loadData();
    };

    sseClient.on('job_updated', handleJobUpdate);
    sseClient.on('image_created', handleImageCreated);
    sseClient.on('zip_ready', handleZipReady);

    return () => {
      sseClient.off('job_updated', handleJobUpdate);
      sseClient.off('image_created', handleImageCreated);
      sseClient.off('zip_ready', handleZipReady);
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

  // Auto-process pending files
  useEffect(() => {
    const processNextFile = async () => {
      if (pendingFiles.length > 0 && !isProcessing && !currentJob) {
        setIsProcessing(true);
        const nextFile = pendingFiles[0];

        try {
          await api.createJob(nextFile.id);
          setPendingFiles(prev => prev.slice(1));
          showToast('success', `Job started for ${nextFile.filename}`);
        } catch (error) {
          showToast('error', `Failed to start job for ${nextFile.filename}`);
        } finally {
          setIsProcessing(false);
        }
      }
    };

    processNextFile();
  }, [pendingFiles, isProcessing, currentJob]);

  const showToast = (type, text) => {
    setToast({ type, text });
  };

  const loadData = async () => {
    try {
      const jobsData = await api.listJobs();
      setJobs(jobsData);

      // Find current running job
      const runningJob = jobsData.find(j => j.status === 'running' || j.status === 'queued');
      setCurrentJob(runningJob || null);
    } catch (error) {
      showToast('error', 'Failed to load data');
    }
  };

  const handleMultipleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setUploading(true);
    const uploadedFiles = [];

    try {
      for (const file of files) {
        const result = await api.uploadPromptsFile(file);
        uploadedFiles.push(result);
      }

      setPendingFiles(prev => [...prev, ...uploadedFiles]);
      showToast('success', `Uploaded ${uploadedFiles.length} file(s) successfully!`);
      await loadData();

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      showToast('error', 'Upload failed');
    } finally {
      setUploading(false);
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

  const removePendingFile = (fileId) => {
    setPendingFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const completedJobs = jobs.filter(j => j.status === 'succeeded' || j.status === 'failed' || j.status === 'canceled');

  // Calculate progress for current job - fixed calculation
  const getJobProgress = (job) => {
    if (!job) return 0;
    if (job.status === 'succeeded') return 100;
    if (job.status === 'queued') return 0;

    // For running jobs, calculate based on actual progress
    if (job.total_prompts && job.total_prompts > 0) {
      return Math.round((job.image_count / job.total_prompts) * 100);
    }

    // Fallback if total_prompts not available
    return Math.min(95, job.image_count * 10);
  };

  return (
    <div className="px-4 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        Jobs
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

      {/* Upload Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Upload Prompts
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select multiple .txt files with prompts (one per line)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            multiple
            onChange={handleMultipleFileUpload}
            disabled={uploading}
            className="block w-full text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 cursor-pointer focus:outline-none"
          />
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Files will automatically be processed in order after upload.
        </p>
      </div>

      {/* Current Job Section */}
      {currentJob && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Current Job
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Job #{currentJob.id} - {currentJob.prompts_file_name || 'Unknown File'}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {currentJob.image_count} / {currentJob.total_prompts || '?'} images generated
                </p>
              </div>
              {getStatusBadge(currentJob.status)}
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
              <div
                className="bg-indigo-600 h-4 rounded-full transition-all duration-500 flex items-center justify-center"
                style={{ width: `${getJobProgress(currentJob)}%` }}
              >
                <span className="text-xs text-white font-medium">
                  {getJobProgress(currentJob)}%
                </span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => navigate(`/gallery?job_id=${currentJob.id}`)}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                View Gallery
              </button>
              {currentJob.zip_ready && (
                <a
                  href={api.getJobZipUrl(currentJob.id)}
                  download
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 inline-block"
                >
                  Download ZIP
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pending Jobs Queue */}
      {pendingFiles.length > 0 && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Pending Jobs ({pendingFiles.length})
          </h2>

          <div className="space-y-2">
            {pendingFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {file.filename}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {file.lines} prompts
                  </p>
                </div>
                <button
                  onClick={() => removePendingFile(file.id)}
                  className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Jobs Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Completed Jobs ({completedJobs.length})
        </h2>

        {completedJobs.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No completed jobs yet</p>
        ) : (
          <div className="space-y-3">
            {completedJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Job #{job.id} - {job.prompts_file_name || 'Unknown File'}
                    </p>
                    {getStatusBadge(job.status)}
                  </div>
                  <div className="mt-1 flex items-center space-x-4 text-xs text-gray-600 dark:text-gray-400">
                    <span>{job.image_count} images</span>
                    <span>{new Date(job.started_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => navigate(`/gallery?job_id=${job.id}`)}
                    className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm"
                  >
                    View
                  </button>
                  {job.zip_ready && (
                    <a
                      href={api.getJobZipUrl(job.id)}
                      download
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm"
                    >
                      Download ZIP
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Jobs;
