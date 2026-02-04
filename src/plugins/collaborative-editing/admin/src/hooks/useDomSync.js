import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// Global socket instance
let globalSocket = null;
let currentDocumentId = null;
const fieldCallbacks = new Map();

// Get documentId from URL
const getDocumentId = () => {
  const match = window.location.pathname.match(/\/api::report\.report\/([^/]+)/);
  return match ? match[1] : null;
};

// Initialize socket connection
const initSocket = () => {
  if (globalSocket?.connected) return globalSocket;

  const documentId = getDocumentId();
  if (!documentId) return null;

  currentDocumentId = documentId;

  globalSocket = io(window.location.origin, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  globalSocket.on('connect', () => {
    console.log('[DomSync] Connected');
    globalSocket.emit('join-report', { reportId: documentId });
  });

  // Receive field updates from other users
  globalSocket.on('field-update', ({ fieldPath, value, senderId }) => {
    // Don't apply our own updates
    if (senderId === globalSocket.id) return;

    console.log('[DomSync] Received update for:', fieldPath);

    // Call registered callback for this field
    const callback = fieldCallbacks.get(fieldPath);
    if (callback) {
      callback(value);
    }

    // Also try to update DOM directly for simple inputs
    const input = document.querySelector(`[name="${fieldPath}"]`);
    if (input && document.activeElement !== input) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  return globalSocket;
};

// Broadcast field change to other users
const broadcastChange = (fieldPath, value) => {
  if (!globalSocket?.connected) return;

  globalSocket.emit('field-update', {
    reportId: currentDocumentId,
    fieldPath,
    value,
    senderId: globalSocket.id,
  });
};

/**
 * Hook for DOM-based field synchronization
 * Simple broadcast of changes - no conflict resolution
 */
export const useDomSync = (fieldPath, initialValue, onRemoteChange) => {
  const valueRef = useRef(initialValue);
  const isInitialized = useRef(false);

  // Register callback for remote updates
  useEffect(() => {
    if (!fieldPath) return;

    initSocket();

    fieldCallbacks.set(fieldPath, (newValue) => {
      valueRef.current = newValue;
      onRemoteChange?.(newValue);
    });

    return () => {
      fieldCallbacks.delete(fieldPath);
    };
  }, [fieldPath, onRemoteChange]);

  // Broadcast local changes
  const updateValue = useCallback((newValue) => {
    valueRef.current = newValue;
    broadcastChange(fieldPath, newValue);
  }, [fieldPath]);

  return {
    updateValue,
    currentValue: valueRef.current,
  };
};

/**
 * Hook to sync all form inputs automatically
 */
export const useFormSync = () => {
  useEffect(() => {
    initSocket();

    const form = document.querySelector('form');
    if (!form) return;

    // Listen to all input changes
    const handleInput = (e) => {
      const input = e.target;
      const fieldPath = input.getAttribute('name');
      if (!fieldPath) return;

      // Skip hidden/internal fields
      if (input.type === 'hidden') return;

      broadcastChange(fieldPath, input.value);
    };

    form.addEventListener('input', handleInput, true);

    return () => {
      form.removeEventListener('input', handleInput, true);
    };
  }, []);
};

export default useDomSync;
