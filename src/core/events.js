/**
 * Event Bus for Decoupled Simulator Messaging & Logging
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.logs = [];
    this.maxLogs = 200;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const arr = this.listeners.get(event);
    const idx = arr.indexOf(callback);
    if (idx !== -1) arr.splice(idx, 1);
  }

  emit(event, data = {}) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const fn of handlers) {
        fn(data);
      }
    }
  }

  log(category, message, level = 'info') {
    const entry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      simTime: dataSimTime(),
      category,
      message,
      level, // 'info', 'success', 'warning', 'danger'
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.emit('log_added', entry);
  }

  clearLogs() {
    this.logs = [];
    this.emit('logs_cleared');
  }
}

let currentSimTime = 0;
export function setSimTime(t) {
  currentSimTime = t;
}

function dataSimTime() {
  const m = Math.floor(currentSimTime / 60);
  const s = Math.floor(currentSimTime % 60);
  const ms = Math.floor((currentSimTime % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}

export const events = new EventBus();
