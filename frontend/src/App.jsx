import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import Gallery from './pages/Gallery';
import Config from './pages/Config';
import { sseClient } from './services/sse';

function App() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Check system preference on mount
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(prefersDark);

    // Apply dark class to html element
    if (prefersDark) {
      document.documentElement.classList.add('dark');
    }

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setDarkMode(e.matches);
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    // Connect SSE
    sseClient.connect();

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      sseClient.disconnect();
    };
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <nav className="bg-white dark:bg-gray-800 shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  StickerPrint
                </h1>
              </div>
              <div className="flex space-x-8">
                <Link
                  to="/"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  Dashboard
                </Link>
                <Link
                  to="/gallery"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  Gallery
                </Link>
                <Link
                  to="/config"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  Config
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/config" element={<Config />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
