import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import * as Y from 'yjs';

const YjsContext = createContext(null);

// Get documentId from URL
const getDocumentIdFromUrl = () => {
  const match = window.location.pathname.match(/\/api::report\.report\/([^/]+)/);
  return match ? match[1] : null;
};

// Global singleton for Yjs state
let globalYdoc = null;
let globalSocket = null;
let globalDocumentId = null;
const observers = new Map();
const subscribers = new Set();

// Notify all subscribers of changes
const notifySubscribers = () => {
  subscribers.forEach((callback) => callback());
};

export const YjsProvider = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    const documentId = getDocumentIdFromUrl();
    if (!documentId || initRef.current) return;

    // Skip if already connected to this document
    if (globalDocumentId === documentId && globalSocket?.connected) {
      setConnected(true);
      setSynced(true);
      return;
    }

    initRef.current = true;
    globalDocumentId = documentId;

    console.log('[YjsContext] Initializing for document:', documentId);

    // Create socket connection
    const socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    globalSocket = socket;

    socket.on('connect', () => {
      console.log('[YjsContext] Socket connected');
      setConnected(true);

      // Join report room
      socket.emit('join-report', { reportId: documentId });
    });

    socket.on('disconnect', () => {
      console.log('[YjsContext] Socket disconnected');
      setConnected(false);
    });

    // Create Y.Doc
    const doc = new Y.Doc();
    globalYdoc = doc;

    // Handle Yjs updates from server
    socket.on('yjs-update', (data) => {
      if (data.update && globalYdoc) {
        try {
          Y.applyUpdate(globalYdoc, new Uint8Array(data.update));
          notifySubscribers();
        } catch (error) {
          console.error('[YjsContext] Error applying update:', error);
        }
      }
    });

    // Handle full state sync
    socket.on('yjs-state', (data) => {
      if (data.update && globalYdoc) {
        try {
          Y.applyUpdate(globalYdoc, new Uint8Array(data.update));
          setSynced(true);
          notifySubscribers();
          console.log('[YjsContext] Full state synced');
        } catch (error) {
          console.error('[YjsContext] Error applying state:', error);
        }
      }
    });

    // Send local updates to server
    const handleLocalUpdate = (update, origin) => {
      if (origin === 'remote') return;
      socket.emit('yjs-update', { update: Array.from(update) });
    };

    doc.on('update', handleLocalUpdate);

    // Request initial state
    setTimeout(() => {
      socket.emit('yjs-request-state');
    }, 500);

    return () => {
      doc.off('update', handleLocalUpdate);
      socket.disconnect();
      doc.destroy();
      globalYdoc = null;
      globalSocket = null;
      globalDocumentId = null;
      initRef.current = false;
    };
  }, []);

  return (
    <YjsContext.Provider value={{ connected, synced }}>
      {children}
    </YjsContext.Provider>
  );
};

// Hook to use Yjs for a JSON field
export const useYjsJson = (fieldPath, initialValue, onChange) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const updateFnRef = useRef(null);

  useEffect(() => {
    if (!globalYdoc || !fieldPath) return;

    const ymap = globalYdoc.getMap(`json:${fieldPath}`);

    // Initialize with current value if empty
    if (ymap.size === 0 && initialValue) {
      globalYdoc.transact(() => {
        ymap.set('data', JSON.stringify(initialValue));
      });
    } else if (ymap.size > 0) {
      // Load existing value
      const jsonStr = ymap.get('data');
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          setLocalValue(parsed);
          onChange?.(parsed);
        } catch (e) {
          console.error('[useYjsJson] Parse error:', e);
        }
      }
    }

    // Observer for remote changes
    const observer = (event) => {
      if (event.transaction.local) return;

      const jsonStr = ymap.get('data');
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          console.log('[useYjsJson] Remote update for:', fieldPath);
          setLocalValue(parsed);
          onChange?.(parsed);
        } catch (e) {
          console.error('[useYjsJson] Parse error:', e);
        }
      }
    };

    ymap.observe(observer);
    observers.set(fieldPath, observer);

    // Update function for local changes
    updateFnRef.current = (newValue) => {
      globalYdoc.transact(() => {
        ymap.set('data', JSON.stringify(newValue));
      });
      setLocalValue(newValue);
    };

    return () => {
      ymap.unobserve(observer);
      observers.delete(fieldPath);
    };
  }, [fieldPath]);

  const updateValue = useCallback((newValue) => {
    if (updateFnRef.current) {
      updateFnRef.current(newValue);
    }
  }, []);

  return { value: localValue, updateValue, synced: !!globalYdoc };
};

// Hook to subscribe to Yjs changes
export const useYjsSubscription = (callback) => {
  useEffect(() => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }, [callback]);
};

export const useYjsContext = () => useContext(YjsContext);

export default YjsContext;
