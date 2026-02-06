import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useYjsSync } from './useYjsSync';

const SOCKET_URL = window.location.origin; // Same origin as Strapi

/**
 * Hook for managing collaborative editing socket connection
 */
export const useCollaborativeSocket = (reportId, currentUser) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [editors, setEditors] = useState([]);
  const [fieldFocus, setFieldFocus] = useState({}); // { fieldPath: { userId, userName } }
  const [lastSequence, setLastSequence] = useState(0);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Initialize socket connection
  useEffect(() => {
    if (!reportId || !currentUser) return;

    console.log('[Collaborative] Connecting to server...', { reportId, userId: currentUser?.id });

    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('[Collaborative] Connected to server');
      setConnected(true);
      reconnectAttempts.current = 0;

      // Join the report session
      socketInstance.emit('join-report', {
        reportId,
        userId: currentUser.id,
        userName: currentUser.firstname || currentUser.username || 'Unknown',
        userRole: currentUser.roles?.[0]?.name || 'Editor',
      });
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Collaborative] Disconnected:', reason);
      setConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Collaborative] Connection error:', error.message);
      reconnectAttempts.current++;
    });

    // Handle editors list updates - show ALL editors including current user
    socketInstance.on('editors-list', ({ editors: editorsList }) => {
      console.log('[Collaborative] Editors list:', editorsList);
      setEditors(editorsList || []);
    });

    socketInstance.on('user-joined', ({ userId, userName, userRole, editors: editorsList }) => {
      console.log('[Collaborative] User joined:', userName);
      setEditors(editorsList || []);
    });

    socketInstance.on('user-left', ({ userId, userName, editors: editorsList }) => {
      console.log('[Collaborative] User left:', userName);
      setEditors(editorsList || []);

      // Clear their field focus
      setFieldFocus(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (updated[key].userId === userId) {
            delete updated[key];
          }
        });
        return updated;
      });
    });

    // Handle field focus events
    socketInstance.on('user-focus', ({ userId, userName, fieldPath }) => {
      console.log('[Collaborative] User focus:', userName, fieldPath);
      setFieldFocus(prev => ({
        ...prev,
        [fieldPath]: { userId, userName },
      }));
    });

    socketInstance.on('user-blur', ({ userId, fieldPath }) => {
      console.log('[Collaborative] User blur:', fieldPath);
      setFieldFocus(prev => {
        const updated = { ...prev };
        if (updated[fieldPath]?.userId === userId) {
          delete updated[fieldPath];
        }
        return updated;
      });
    });

    // Handle field updates from other users (legacy - Yjs handles this now)
    socketInstance.on('field-updated', ({ userId, userName, fieldPath, newValue, sequence }) => {
      console.log('[Collaborative] Field updated by', userName, ':', fieldPath);
      setLastSequence(sequence);

      // Dispatch event for non-Yjs components
      window.dispatchEvent(new CustomEvent('collaborative-field-update', {
        detail: { userId, userName, fieldPath, newValue, sequence },
      }));
    });

    // Handle sync operations
    socketInstance.on('sync-operations', ({ operations, currentSequence }) => {
      console.log('[Collaborative] Sync operations:', operations.length);
      setLastSequence(currentSequence);
    });

    // Handle change confirmation
    socketInstance.on('change-confirmed', ({ operation, sequence, applied }) => {
      console.log('[Collaborative] Change confirmed:', applied);
      setLastSequence(sequence);
    });

    // Handle errors
    socketInstance.on('error', ({ message }) => {
      console.error('[Collaborative] Error:', message);
    });

    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      if (socketInstance) {
        socketInstance.emit('leave-report', { reportId });
        socketInstance.disconnect();
      }
    };
  }, [reportId, currentUser?.id]);

  // Send field change
  const sendFieldChange = useCallback((fieldPath, oldValue, newValue) => {
    if (!socket || !connected) return;

    socket.emit('field-change', {
      reportId,
      userId: currentUser.id,
      userName: currentUser.firstname || currentUser.username,
      fieldPath,
      oldValue,
      newValue,
    });
  }, [socket, connected, reportId, currentUser]);

  // Send field focus
  const sendFieldFocus = useCallback((fieldPath, cursorPosition = null) => {
    if (!socket || !connected) return;

    socket.emit('field-focus', {
      reportId,
      userId: currentUser.id,
      userName: currentUser.firstname || currentUser.username,
      fieldPath,
      cursorPosition,
    });
  }, [socket, connected, reportId, currentUser]);

  // Send field blur
  const sendFieldBlur = useCallback((fieldPath) => {
    if (!socket || !connected) return;

    socket.emit('field-blur', {
      reportId,
      userId: currentUser.id,
      userName: currentUser.firstname || currentUser.username,
      fieldPath,
    });
  }, [socket, connected, reportId, currentUser]);

  // Request sync
  const requestSync = useCallback(() => {
    if (!socket || !connected) return;

    socket.emit('request-sync', {
      reportId,
      sinceSequence: lastSequence,
    });
  }, [socket, connected, reportId, lastSequence]);

  // Heartbeat to keep session alive
  useEffect(() => {
    if (!socket || !connected) return;

    const heartbeatInterval = setInterval(() => {
      socket.emit('heartbeat', { reportId });
    }, 30000); // Every 30 seconds

    return () => clearInterval(heartbeatInterval);
  }, [socket, connected, reportId]);

  // Initialize Yjs sync
  const yjs = useYjsSync(socket, reportId, currentUser);

  return {
    socket,
    connected,
    editors,
    fieldFocus,
    lastSequence,
    sendFieldChange,
    sendFieldFocus,
    sendFieldBlur,
    requestSync,
    // Yjs CRDT functions
    yjs,
  };
};

export default useCollaborativeSocket;
