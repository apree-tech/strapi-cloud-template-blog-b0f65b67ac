import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useForm } from '@strapi/admin/strapi-admin';
import { Box, Flex, Typography, Button } from '@strapi/design-system';
import { io } from 'socket.io-client';

// Get documentId from URL
const getDocumentId = () => {
  const match = window.location.pathname.match(/\/api::report\.report\/([^/]+)/);
  return match ? match[1] : null;
};

// Create a fingerprint of the structure (block count + types)
const getStructureFingerprint = (contentBlocks) => {
  if (!contentBlocks || !Array.isArray(contentBlocks)) return '';
  return contentBlocks.map(b => b?.__component || 'unknown').join('|');
};

/**
 * Watches for structural changes (add/remove blocks) and notifies other users
 */
const StructureSyncWatcher = ({ documentId }) => {
  const [showReloadBanner, setShowReloadBanner] = useState(false);
  const [changedBy, setChangedBy] = useState(null);
  const socketRef = useRef(null);
  const lastFingerprintRef = useRef(null);
  const isLocalChangeRef = useRef(false);

  // Watch content_blocks from form state
  const contentBlocks = useForm('StructureSyncWatcher', (state) => {
    return state.values?.content_blocks;
  });

  // Initialize socket connection
  useEffect(() => {
    const docId = documentId || getDocumentId();
    if (!docId) return;

    // Connect to socket
    const socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[StructureSync] Connected');
      socket.emit('join-report', { reportId: docId });
    });

    // Listen for structure changes from other users
    socket.on('structure-changed', ({ fingerprint, userName, senderId }) => {
      if (senderId === socket.id) return; // Ignore own changes

      const currentFingerprint = getStructureFingerprint(contentBlocks);

      // Only show banner if structure actually differs
      if (fingerprint !== currentFingerprint) {
        console.log('[StructureSync] Remote structure change detected');
        setChangedBy(userName || 'Другой пользователь');
        setShowReloadBanner(true);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [documentId]);

  // Watch for local structure changes and broadcast
  useEffect(() => {
    const fingerprint = getStructureFingerprint(contentBlocks);

    // Skip if no change or if this is initial load
    if (!fingerprint || fingerprint === lastFingerprintRef.current) {
      return;
    }

    // Skip broadcasting if this was a remote change we just applied
    if (isLocalChangeRef.current) {
      isLocalChangeRef.current = false;
      lastFingerprintRef.current = fingerprint;
      return;
    }

    const prevFingerprint = lastFingerprintRef.current;
    lastFingerprintRef.current = fingerprint;

    // Only broadcast if we had a previous fingerprint (not initial load)
    if (prevFingerprint && socketRef.current?.connected) {
      const docId = documentId || getDocumentId();

      // Get current user name from localStorage or default
      let userName = 'Пользователь';
      try {
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        userName = userInfo.firstname || userInfo.username || userName;
      } catch (e) {}

      console.log('[StructureSync] Broadcasting structure change');
      socketRef.current.emit('structure-changed', {
        reportId: docId,
        fingerprint,
        userName,
        senderId: socketRef.current.id,
      });
    }
  }, [contentBlocks, documentId]);

  // Handle reload
  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setShowReloadBanner(false);
    // Update fingerprint to current to avoid re-showing
    lastFingerprintRef.current = getStructureFingerprint(contentBlocks);
    isLocalChangeRef.current = true;
  }, [contentBlocks]);

  if (!showReloadBanner) return null;

  return (
    <Box
      position="fixed"
      style={{
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        maxWidth: '400px',
        width: '90%',
      }}
    >
      <Box
        padding={3}
        background="warning100"
        hasRadius
        shadow="filterShadow"
        style={{ border: '1px solid #f5c518' }}
      >
        <Flex direction="column" gap={2}>
          <Typography variant="omega" fontWeight="bold" textColor="warning700">
            Структура документа изменена
          </Typography>
          <Typography variant="pi" textColor="neutral700">
            {changedBy} добавил или удалил блоки. Обновите страницу, чтобы увидеть изменения.
          </Typography>
          <Flex gap={2} marginTop={1}>
            <Button variant="default" size="S" onClick={handleReload}>
              Обновить
            </Button>
            <Button variant="tertiary" size="S" onClick={handleDismiss}>
              Позже
            </Button>
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
};

export default memo(StructureSyncWatcher);
