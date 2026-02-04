import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';

/**
 * Hook for Yjs CRDT synchronization
 * Provides real-time collaborative editing with automatic conflict resolution
 */
export const useYjsSync = (socket, documentId, currentUser) => {
  const [ydoc, setYdoc] = useState(null);
  const [synced, setSynced] = useState(false);
  const [awareness, setAwareness] = useState(new Map());
  const ydocRef = useRef(null);
  const observersRef = useRef(new Map());
  const initializedRef = useRef(false);

  // Initialize Y.Doc when socket connects
  useEffect(() => {
    if (!socket || !documentId || !currentUser) return;
    if (initializedRef.current) return;

    console.log('[Yjs] Initializing Y.Doc for', documentId);
    initializedRef.current = true;

    // Create new Y.Doc
    const doc = new Y.Doc();
    ydocRef.current = doc;
    setYdoc(doc);

    // Listen for updates from other users
    const handleYjsUpdate = (data) => {
      const { update } = data;
      if (update && ydocRef.current) {
        try {
          Y.applyUpdate(ydocRef.current, new Uint8Array(update));
          console.log('[Yjs] Applied remote update');
        } catch (error) {
          console.error('[Yjs] Error applying update:', error);
        }
      }
    };

    // Listen for full state sync
    const handleYjsState = (data) => {
      const { update } = data;
      if (update && ydocRef.current) {
        try {
          Y.applyUpdate(ydocRef.current, new Uint8Array(update));
          setSynced(true);
          console.log('[Yjs] Applied full state, synced!');
        } catch (error) {
          console.error('[Yjs] Error applying state:', error);
        }
      }
    };

    socket.on('yjs-update', handleYjsUpdate);
    socket.on('yjs-state', handleYjsState);

    // Send local updates to server
    const handleLocalUpdate = (update, origin) => {
      // Don't send updates that came from remote
      if (origin === 'remote') return;

      console.log('[Yjs] Sending local update, size:', update.length);
      socket.emit('yjs-update', { update: Array.from(update) });
    };

    doc.on('update', handleLocalUpdate);

    // Request initial state after a short delay to ensure join-report completed
    setTimeout(() => {
      console.log('[Yjs] Requesting initial state...');
      socket.emit('yjs-request-state');
    }, 500);

    return () => {
      socket.off('yjs-update', handleYjsUpdate);
      socket.off('yjs-state', handleYjsState);
      doc.off('update', handleLocalUpdate);
      doc.destroy();
      ydocRef.current = null;
      initializedRef.current = false;
      setSynced(false);
    };
  }, [socket, documentId, currentUser]);

  // Get or create a Y.Text for a field
  const getYText = useCallback((fieldPath) => {
    if (!ydocRef.current) return null;
    return ydocRef.current.getText(fieldPath);
  }, []);

  // Get or create a Y.Map for complex data
  const getYMap = useCallback((fieldPath) => {
    if (!ydocRef.current) return null;
    return ydocRef.current.getMap(fieldPath);
  }, []);

  // Bind a text input to a Y.Text
  const bindTextInput = useCallback((input, fieldPath) => {
    if (!ydocRef.current || !input) return () => {};

    const ytext = ydocRef.current.getText(fieldPath);

    // Initialize with current input value if Y.Text is empty
    if (ytext.length === 0 && input.value) {
      ydocRef.current.transact(() => {
        ytext.insert(0, input.value);
      });
    }

    // Update input when Y.Text changes
    const observer = (event) => {
      const newValue = ytext.toString();
      const oldValue = input.value;

      if (oldValue === newValue) return;

      // Use native setter to properly trigger React
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      )?.set;

      if (document.activeElement !== input) {
        // Field not focused - safe to update
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, newValue);
        } else {
          input.value = newValue;
        }
        // Trigger React's onChange with proper event
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      } else {
        // User is typing - preserve cursor position
        const start = input.selectionStart;
        const end = input.selectionEnd;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, newValue);
        } else {
          input.value = newValue;
        }

        // Trigger React's onChange
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

        // Restore cursor position
        if (start !== null) {
          input.setSelectionRange(
            Math.min(start, newValue.length),
            Math.min(end, newValue.length)
          );
        }
      }
    };

    ytext.observe(observer);
    observersRef.current.set(fieldPath, { ytext, observer });

    // Update Y.Text when input changes
    const handleInput = (e) => {
      const newValue = e.target.value;
      const currentYValue = ytext.toString();

      if (newValue !== currentYValue) {
        ydocRef.current.transact(() => {
          // Simple replace for now
          // For better UX, we could compute and apply delta
          ytext.delete(0, ytext.length);
          ytext.insert(0, newValue);
        });
      }
    };

    input.addEventListener('input', handleInput);

    return () => {
      ytext.unobserve(observer);
      input.removeEventListener('input', handleInput);
      observersRef.current.delete(fieldPath);
    };
  }, []);

  // Bind a JSON field to Y.Map for complex data synchronization
  const bindJsonField = useCallback((fieldPath, initialValue, onChange) => {
    if (!ydocRef.current) return () => {};

    const ymap = ydocRef.current.getMap(fieldPath);

    // Initialize with current value if Y.Map is empty
    if (ymap.size === 0 && initialValue) {
      ydocRef.current.transact(() => {
        ymap.set('data', JSON.stringify(initialValue));
      });
    }

    // Update component when Y.Map changes
    const observer = (event) => {
      if (event.transaction.local) return; // Skip local changes

      const jsonStr = ymap.get('data');
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          console.log('[Yjs] JSON field updated from remote:', fieldPath);
          onChange(parsed);
        } catch (e) {
          console.error('[Yjs] Failed to parse JSON:', e);
        }
      }
    };

    ymap.observe(observer);
    observersRef.current.set(fieldPath, { ymap, observer, type: 'json' });

    // Return update function and cleanup
    const updateValue = (newValue) => {
      ydocRef.current.transact(() => {
        ymap.set('data', JSON.stringify(newValue));
      });
    };

    const cleanup = () => {
      ymap.unobserve(observer);
      observersRef.current.delete(fieldPath);
    };

    return { updateValue, cleanup };
  }, []);

  // Get current JSON value from Y.Map
  const getJsonValue = useCallback((fieldPath) => {
    if (!ydocRef.current) return null;
    const ymap = ydocRef.current.getMap(fieldPath);
    const jsonStr = ymap.get('data');
    if (jsonStr) {
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        return null;
      }
    }
    return null;
  }, []);

  // Set JSON value in Y.Map
  const setJsonValue = useCallback((fieldPath, value) => {
    if (!ydocRef.current) return;
    const ymap = ydocRef.current.getMap(fieldPath);
    ydocRef.current.transact(() => {
      ymap.set('data', JSON.stringify(value));
    });
  }, []);

  // Unbind all observers
  const unbindAll = useCallback(() => {
    observersRef.current.forEach(({ ytext, ymap, observer, type }) => {
      if (type === 'json' && ymap) {
        ymap.unobserve(observer);
      } else if (ytext) {
        ytext.unobserve(observer);
      }
    });
    observersRef.current.clear();
  }, []);

  // Get current value of a field
  const getValue = useCallback((fieldPath) => {
    if (!ydocRef.current) return null;
    const ytext = ydocRef.current.getText(fieldPath);
    return ytext.toString();
  }, []);

  // Set value of a field
  const setValue = useCallback((fieldPath, value) => {
    if (!ydocRef.current) return;
    const ytext = ydocRef.current.getText(fieldPath);
    ydocRef.current.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, value || '');
    });
  }, []);

  return {
    ydoc,
    synced,
    awareness,
    getYText,
    getYMap,
    bindTextInput,
    bindJsonField,
    unbindAll,
    getValue,
    setValue,
    getJsonValue,
    setJsonValue,
  };
};

export default useYjsSync;
