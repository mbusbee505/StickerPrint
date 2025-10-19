export class SSEClient {
  constructor() {
    this.eventSource = null;
    this.listeners = new Map();
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
  }

  connect() {
    if (this.eventSource) return;

    this.eventSource = new EventSource('/api/events');

    this.eventSource.addEventListener('run_updated', (event) => {
      this.emit('run_updated', JSON.parse(event.data));
    });

    this.eventSource.addEventListener('image_created', (event) => {
      this.emit('image_created', JSON.parse(event.data));
    });

    this.eventSource.addEventListener('zip_ready', (event) => {
      this.emit('zip_ready', JSON.parse(event.data));
    });

    this.eventSource.addEventListener('all_runs_zip_ready', (event) => {
      this.emit('all_runs_zip_ready', JSON.parse(event.data));
    });

    this.eventSource.addEventListener('gallery_cleared', (event) => {
      this.emit('gallery_cleared', JSON.parse(event.data));
    });

    this.eventSource.addEventListener('config_updated', (event) => {
      this.emit('config_updated', JSON.parse(event.data));
    });

    this.eventSource.onerror = () => {
      this.disconnect();
      setTimeout(() => {
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay
        );
        this.connect();
      }, this.reconnectDelay);
    };

    this.eventSource.onopen = () => {
      this.reconnectDelay = 1000;
    };
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
  }

  off(eventType, callback) {
    if (this.listeners.has(eventType)) {
      const callbacks = this.listeners.get(eventType);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(eventType, data) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).forEach((callback) => {
        callback(data);
      });
    }
  }
}

export const sseClient = new SSEClient();
