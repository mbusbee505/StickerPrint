import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { sseClient } from '../services/sse';

function Gallery() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('job_id');

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredImage, setHoveredImage] = useState(null);
  const [toast, setToast] = useState(null);
  const [jobs, setRuns] = useState([]);
  const [selectedJob, setSelectedRun] = useState('all');

  useEffect(() => {
    loadImages();
    loadJobs();

    const handleImageCreated = (data) => {
      if (!jobId || data.job_id === parseInt(jobId)) {
        loadImages();
      }
    };

    const handleGalleryCleared = () => {
      setImages([]);
      showToast('success', 'Gallery cleared successfully!');
    };

    sseClient.on('image_created', handleImageCreated);
    sseClient.on('gallery_cleared', handleGalleryCleared);

    return () => {
      sseClient.off('image_created', handleImageCreated);
      sseClient.off('gallery_cleared', handleGalleryCleared);
    };
  }, [jobId]);

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

  const loadImages = async () => {
    try {
      const data = await api.listImages(jobId ? parseInt(jobId) : null);
      setImages(data);
    } catch (error) {
      showToast('error', 'Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const loadJobs = async () => {
    try {
      const data = await api.listJobs();
      setRuns(data);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  const getDownloadUrl = () => {
    if (selectedJob === 'all') {
      return api.getAllZipUrl();
    } else if (selectedJob === 'latest') {
      return api.getLatestZipUrl();
    } else {
      return api.getJobZipUrl(selectedJob);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-0">
          Gallery {jobId && `- Job ${jobId}`}
        </h1>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Jobs</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.prompts_file_name || `Job ${job.id}`}
              </option>
            ))}
          </select>

          <a
            href={getDownloadUrl()}
            download
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-center"
          >
            Download
          </a>
        </div>
      </div>

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

      {images.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">No images yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group aspect-square"
              onMouseEnter={() => setHoveredImage(image.id)}
              onMouseLeave={() => setHoveredImage(null)}
            >
              <img
                src={image.url}
                alt={image.prompt_text}
                className="w-full h-full object-cover rounded-lg shadow"
              />

              {hoveredImage === image.id && (
                <div className="absolute inset-0 bg-black bg-opacity-75 rounded-lg p-4 flex flex-col justify-between">
                  <p className="text-white text-sm overflow-y-auto">
                    {image.prompt_text}
                  </p>
                  <a
                    href={image.url}
                    download
                    className="mt-2 px-3 py-1 bg-white text-black rounded text-sm text-center hover:bg-gray-200"
                  >
                    Download
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Gallery;
