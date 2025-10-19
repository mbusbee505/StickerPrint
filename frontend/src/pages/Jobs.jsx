import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { sseClient } from '../services/sse';

const PENDING_QUEUE_KEY = 'stickerprint_pending_queue';

// Load initial pending files from localStorage synchronously
const getInitialPendingFiles = () => {
  try {
    const savedQueue = localStorage.getItem(PENDING_QUEUE_KEY);
    if (savedQueue) {
      return JSON.parse(savedQueue);
    }
  } catch (error) {
    console.error('Failed to parse pending queue:', error);
  }
  return [];
};

function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [pendingFiles, setPendingFiles] = useState(getInitialPendingFiles());
  const [currentJob, setCurrentJob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  const showToast = (type, text) => {
    setToast({ type, text });
  };

  // Verify pending queue against server on mount
  useEffect(() => {
    const verifyQueue = async () => {
      if (pendingFiles.length === 0) return;

      try {
        // Get all prompts files and jobs
        const [allPromptsFiles, allJobs] = await Promise.all([
          api.listPromptsFiles(),
          api.listJobs()
        ]);

        const existingFileIds = new Set(allPromptsFiles.map(f => f.id));
        const usedFileIds = new Set(allJobs.map(j => j.prompts_file_id));

        // Verify each file still exists and hasn't been used
        const verifiedQueue = [];
        for (const file of pendingFiles) {
          if (existingFileIds.has(file.id) && !usedFileIds.has(file.id)) {
            verifiedQueue.push(file);
          } else {
            console.log(`Removed file from queue: ${file.filename} (${existingFileIds.has(file.id) ? 'already used' : 'no longer exists'})`);
          }
        }

        // Update state if queue changed
        if (verifiedQueue.length !== pendingFiles.length) {
          setPendingFiles(verifiedQueue);
        }
      } catch (error) {
        console.error('Failed to verify pending queue:', error);
      }
    };

    verifyQueue();
  }, []);

  // Save pending queue to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(pendingFiles));
  }, [pendingFiles]);

  const loadData = async () => {
    try {
      const jobsData = await api.listJobs();
      console.log('Loaded jobs:', jobsData);
      setJobs(jobsData);

      // Find current running job
      const runningJob = jobsData.find(j => j.status === 'running' || j.status === 'queued');
      setCurrentJob(runningJob || null);
    } catch (error) {
      showToast('error', 'Failed to load data');
    }
  };

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
      // Process next file only if there are pending files and no job is currently being created
      if (pendingFiles.length > 0 && !isProcessing) {
        // Check if there's already a running/queued job - if so, wait
        if (currentJob && (currentJob.status === 'running' || currentJob.status === 'queued')) {
          return;
        }

        setIsProcessing(true);
        const nextFile = pendingFiles[0];

        try {
          await api.createJob(nextFile.id);
          setPendingFiles(prev => prev.slice(1));
          showToast('success', `Job started for ${nextFile.filename}`);
          await loadData(); // Reload to get the new job
        } catch (error) {
          showToast('error', `Failed to start job for ${nextFile.filename}`);
        } finally {
          setIsProcessing(false);
        }
      }
    };

    processNextFile();
  }, [pendingFiles, isProcessing, currentJob]);

  const handleFileSelect = (event) => {
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      handleMultipleFileUpload(event);
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

  const handleStopJob = async () => {
    if (!currentJob) return;

    try {
      await api.cancelJob(currentJob.id);
      showToast('success', 'Job stopped successfully');
      await loadData();
    } catch (error) {
      showToast('error', 'Failed to stop job');
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

  // Filter completed jobs (exclude running/queued)
  const completedJobs = jobs.filter(j => {
    const isCompleted = j.status === 'succeeded' || j.status === 'failed' || j.status === 'canceled';
    return isCompleted;
  });

  console.log('All jobs:', jobs);
  console.log('Completed jobs:', completedJobs);
  console.log('Current job:', currentJob);

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
      {/* Header with Upload Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-0">
          Jobs
        </h1>

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            multiple
            onChange={handleMultipleFileUpload}
            disabled={uploading}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className={`px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer text-center ${
              uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {uploading ? 'Uploading...' : 'Upload Prompts'}
          </label>
        </div>
      </div>

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
              {(currentJob.status === 'running' || currentJob.status === 'queued') && (
                <button
                  onClick={handleStopJob}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Stop Job
                </button>
              )}
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
