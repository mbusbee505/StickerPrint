import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { sseClient } from '../services/sse';

function Gallery() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('job_id');

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hoveredImage, setHoveredImage] = useState(null);
  const [toast, setToast] = useState(null);
  const [jobs, setRuns] = useState([]);
  const [selectedJob, setSelectedRun] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef(null);

  useEffect(() => {
    // Reset when jobId changes
    setImages([]);
    setPage(1);
    setHasMore(true);
    loadImages(1, true);
    loadJobs();

    const handleImageCreated = (data) => {
      if (!jobId || data.job_id === parseInt(jobId)) {
        setImages([]);
        setPage(1);
        setHasMore(true);
        loadImages(1, true);
      }
    };

    const handleGalleryCleared = () => {
      setImages([]);
      setPage(1);
      setHasMore(true);
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

  const loadImages = useCallback(async (pageNum, reset = false) => {
    if (!reset && (!hasMore || loadingMore)) return;

    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const data = await api.listImages(jobId ? parseInt(jobId) : null, pageNum, 50);

      if (data.length < 50) {
        setHasMore(false);
      }

      if (reset) {
        setImages(data);
      } else {
        setImages(prev => {
          // Prevent duplicates by checking if images already exist
          const existingIds = new Set(prev.map(img => img.id));
          const newImages = data.filter(img => !existingIds.has(img.id));
          return [...prev, ...newImages];
        });
      }
    } catch (error) {
      showToast('error', 'Failed to load images');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [jobId, hasMore, loadingMore]);

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

  const sanitizeFilename = (text) => {
    // Remove or replace invalid filename characters
    return text
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove invalid chars
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 100) // Limit length
      .trim();
  };

  const handleDownload = async (imageUrl, promptText) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Get file extension from original URL
      const extension = imageUrl.split('.').pop().split('?')[0] || 'png';
      const filename = `${sanitizeFilename(promptText)}.${extension}`;

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showToast('error', 'Failed to download image');
    }
  };

  // Infinite scroll observer
  useEffect(() => {
    const currentTarget = observerTarget.current;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadImages(nextPage, false);
        }
      },
      { threshold: 0.1 }
    );

    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, loadingMore, page, loadImages]);

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
        <>
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
                    <button
                      onClick={() => handleDownload(image.url, image.prompt_text)}
                      className="mt-2 px-3 py-1 bg-white text-black rounded text-sm text-center hover:bg-gray-200"
                    >
                      Download
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Infinite scroll trigger */}
          <div ref={observerTarget} className="w-full py-8 flex justify-center">
            {loadingMore && (
              <div className="text-gray-600 dark:text-gray-400">Loading more...</div>
            )}
            {!hasMore && images.length > 0 && (
              <div className="text-gray-600 dark:text-gray-400">No more images</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Gallery;
