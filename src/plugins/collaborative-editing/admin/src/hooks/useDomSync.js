import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

// Global singleton socket
let sharedSocket = null;
let currentReportId = null;
const fieldCallbacks = new Map();

// Get documentId from URL
const getDocumentId = () => {
  const match = window.location.pathname.match(/\/api::report\.report\/([^/]+)/);
  return match ? match[1] : null;
};

// Initialize or get existing socket
const ensureSocket = () => {
  const docId = getDocumentId();

  if (!docId) {
    console.log('[DomSync] No documentId in URL');
    return null;
  }

  // Already connected to this report
  if (sharedSocket?.connected && currentReportId === docId) {
    return sharedSocket;
  }

  // Disconnect if connected to different report
  if (sharedSocket && currentReportId !== docId) {
    console.log('[DomSync] Switching to new report:', docId);
    sharedSocket.disconnect();
    sharedSocket = null;
  }

  if (!sharedSocket) {
    console.log('[DomSync] Creating new socket for:', docId);
    currentReportId = docId;

    sharedSocket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    sharedSocket.on('connect', () => {
      console.log('[DomSync] ✓ Connected, socket.id:', sharedSocket.id);
      console.log('[DomSync] Joining report room:', currentReportId);
      sharedSocket.emit('join-report', { reportId: currentReportId });
    });

    sharedSocket.on('disconnect', (reason) => {
      console.log('[DomSync] ✗ Disconnected:', reason);
    });

    sharedSocket.on('connect_error', (err) => {
      console.error('[DomSync] Connection error:', err.message);
    });

    // Handle field updates from other users
    sharedSocket.on('field-update', ({ fieldPath, value, senderId }) => {
      if (senderId === sharedSocket.id) return; // Ignore own updates

      console.log('[DomSync] ← Received:', fieldPath);

      const callback = fieldCallbacks.get(fieldPath);
      if (callback) {
        callback(value);
      }
    });
  }

  return sharedSocket;
};

/**
 * Hook for simple field synchronization via socket.io
 * Broadcasts changes to all other connected users
 */
export const useDomSync = (fieldPath, initialValue, onRemoteChange) => {
  const [isConnected, setIsConnected] = useState(false);
  const valueRef = useRef(initialValue);

  useEffect(() => {
    if (!fieldPath) return;

    const socket = ensureSocket();

    // Update connection state
    const updateConnectionState = () => {
      setIsConnected(sharedSocket?.connected || false);
    };

    if (socket) {
      socket.on('connect', updateConnectionState);
      socket.on('disconnect', updateConnectionState);
      updateConnectionState();
    }

    // Register callback for this field
    console.log('[DomSync] Registering field:', fieldPath);
    fieldCallbacks.set(fieldPath, (newValue) => {
      console.log('[DomSync] Applying to:', fieldPath);
      valueRef.current = newValue;
      onRemoteChange?.(newValue);
    });

    return () => {
      console.log('[DomSync] Unregistering:', fieldPath);
      fieldCallbacks.delete(fieldPath);
    };
  }, [fieldPath, onRemoteChange]);

  // Broadcast changes
  const updateValue = useCallback((newValue) => {
    valueRef.current = newValue;

    if (sharedSocket?.connected && currentReportId) {
      console.log('[DomSync] → Sending:', fieldPath);
      sharedSocket.emit('field-update', {
        reportId: currentReportId,
        fieldPath,
        value: newValue,
        senderId: sharedSocket.id,
      });
    } else {
      console.warn('[DomSync] Cannot send - not connected');
    }
  }, [fieldPath]);

  return { updateValue, isConnected };
};

export default useDomSync;
