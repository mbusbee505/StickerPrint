import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { sseClient } from '../services/sse';

function Gallery() {
  const [searchParams] = useSearchParams();
  const runId = searchParams.get('run_id');

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredImage, setHoveredImage] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState('all');

  useEffect(() => {
    loadImages();
    loadRuns();

    const handleImageCreated = (data) => {
      if (!runId || data.run_id === parseInt(runId)) {
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
  }, [runId]);

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
      const data = await api.listImages(runId ? parseInt(runId) : null);
      setImages(data);
    } catch (error) {
      showToast('error', 'Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    try {
      const data = await api.listRuns();
      setRuns(data);
    } catch (error) {
      console.error('Failed to load runs:', error);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await api.deleteAllImages();
      setImages([]);
      setShowDeleteConfirm(false);
      showToast('success', 'All images deleted successfully!');
    } catch (error) {
      showToast('error', 'Failed to delete images');
    }
  };

  const getDownloadUrl = () => {
    if (selectedRun === 'all') {
      return api.getAllZipUrl();
    } else if (selectedRun === 'latest') {
      return api.getLatestZipUrl();
    } else {
      return api.getRunZipUrl(selectedRun);
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
          Gallery {runId && `- Run ${runId}`}
        </h1>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedRun}
            onChange={(e) => setSelectedRun(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Runs</option>
            <option value="latest">Latest Run</option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.prompts_file_name || `Run ${run.id}`}
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

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Delete All
          </button>
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

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Confirm Delete
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete all images? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAll}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete All
              </button>
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
