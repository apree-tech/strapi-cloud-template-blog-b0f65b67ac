'use strict';

const { Server } = require('socket.io');
const Y = require('yjs');
const { encodeStateAsUpdate, applyUpdate, encodeStateVector } = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');

// Store Y.Doc instances per document
const docs = new Map();
// Store awareness instances per document
const awarenessMap = new Map();
// Track which docs have been initialized from DB
const initializedDocs = new Set();
// Track changes per document for auto-versioning
// { docId: { hasChanges: true, users: Map(userId => { id, name }) } }
const documentChanges = new Map();

// Get or create a Y.Doc for a document
const getYDoc = (docId) => {
  if (!docs.has(docId)) {
    const ydoc = new Y.Doc();
    docs.set(docId, ydoc);

    // Create awareness for this doc
    const awareness = new awarenessProtocol.Awareness(ydoc);
    awarenessMap.set(docId, awareness);

    console.log(`[Yjs] Created new Y.Doc for ${docId}`);
  }
  return docs.get(docId);
};

// Initialize Y.Doc with data from database
const initYDocFromDatabase = async (docId, ydoc, strapi) => {
  try {
    // Find the report by documentId
    const report = await strapi.db.query('api::report.report').findOne({
      where: { documentId: docId },
    });

    if (report) {
      console.log(`[Yjs] Initializing Y.Doc from database for ${docId}`);

      // Initialize Y.Text fields with all string/date values from report
      ydoc.transact(() => {
        Object.entries(report).forEach(([key, value]) => {
          // Skip non-syncable fields
          if (['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale'].includes(key)) {
            return;
          }

          // Only sync string and date values
          if (typeof value === 'string' && value) {
            const ytext = ydoc.getText(key);
            if (ytext.length === 0) {
              ytext.insert(0, value);
              console.log(`[Yjs] Initialized field "${key}" with value: ${value.substring(0, 50)}...`);
            }
          }
        });
      });

      console.log(`[Yjs] Y.Doc initialized with database values`);
    } else {
      console.log(`[Yjs] No report found for documentId ${docId}`);
    }
  } catch (error) {
    console.error(`[Yjs] Error initializing Y.Doc from database:`, error);
  }
};

const getAwareness = (docId) => {
  getYDoc(docId); // Ensure doc exists
  return awarenessMap.get(docId);
};

// Message types for Yjs protocol
const messageSync = 0;
const messageAwareness = 1;

module.exports = {
  register(/*{ strapi }*/) {},

  bootstrap({ strapi }) {
    // Initialize Socket.IO server attached to Strapi's HTTP server
    const io = new Server(strapi.server.httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
      },
    });

    // Store io instance on strapi for access in services
    strapi.io = io;
    strapi.yDocs = docs;
    strapi.yAwareness = awarenessMap;

    strapi.log.info('[Socket.IO] Server initialized with Yjs CRDT support');

    // Handle connections
    io.on('connection', (socket) => {
      strapi.log.info(`[Socket.IO] Client connected: ${socket.id}`);

      // Join report room
      socket.on('join-report', async (data) => {
        const { reportId, userId, userName, userRole } = data;

        if (!reportId) return;

        const room = `report:${reportId}`;
        socket.join(room);
        socket.reportId = reportId;
        socket.userId = userId;
        socket.userName = userName;

        strapi.log.info(`[Socket.IO] ${userName} joined report ${reportId}`);

        try {
          // Register session in database
          const collaborativeService = strapi.service('api::collaborative.collaborative');
          if (collaborativeService) {
            await collaborativeService.joinSession(reportId, userId, userName, userRole, socket.id);

            // Get current editors and broadcast
            const editors = await collaborativeService.getActiveEditors(reportId);
            io.to(room).emit('editors-list', { editors });
            socket.to(room).emit('user-joined', { userId, userName, userRole, editors });
          }

          // Initialize Yjs for this document
          const ydoc = getYDoc(reportId);
          const awareness = getAwareness(reportId);

          // If this doc hasn't been initialized from DB yet, do it now
          if (!initializedDocs.has(reportId)) {
            await initYDocFromDatabase(reportId, ydoc, strapi);
            initializedDocs.add(reportId);
          }

          // Set awareness state for this user
          awareness.setLocalStateField('user', {
            id: userId,
            name: userName,
            color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
          });

          // Send initial sync to the new client
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.writeSyncStep1(encoder, ydoc);
          socket.emit('yjs-sync', Buffer.from(encoding.toUint8Array(encoder)));

          // Send current awareness state
          const awarenessEncoder = encoding.createEncoder();
          encoding.writeVarUint(awarenessEncoder, messageAwareness);
          encoding.writeVarUint8Array(awarenessEncoder,
            awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys()))
          );
          socket.emit('yjs-sync', Buffer.from(encoding.toUint8Array(awarenessEncoder)));

          strapi.log.info(`[Yjs] Sent initial sync for ${reportId}`);

        } catch (error) {
          strapi.log.error('[Socket.IO] Error joining session:', error);
          socket.emit('error', { message: 'Failed to join session' });
        }
      });

      // Handle Yjs sync messages
      socket.on('yjs-sync', (message) => {
        if (!socket.reportId) return;

        const ydoc = getYDoc(socket.reportId);
        const awareness = getAwareness(socket.reportId);
        const room = `report:${socket.reportId}`;

        try {
          const decoder = decoding.createDecoder(new Uint8Array(message));
          const messageType = decoding.readVarUint(decoder);

          switch (messageType) {
            case messageSync: {
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, messageSync);
              const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, ydoc, null);

              if (encoding.length(encoder) > 1) {
                socket.emit('yjs-sync', Buffer.from(encoding.toUint8Array(encoder)));
              }

              // Broadcast updates to other clients
              if (syncMessageType === syncProtocol.messageYjsUpdate ||
                  syncMessageType === syncProtocol.messageYjsSyncStep2) {
                const updateEncoder = encoding.createEncoder();
                encoding.writeVarUint(updateEncoder, messageSync);
                syncProtocol.writeUpdate(updateEncoder, decoding.readVarUint8Array(
                  decoding.createDecoder(new Uint8Array(message).slice(1))
                ));
                // Broadcast to others in the room
                socket.to(room).emit('yjs-sync', Buffer.from(encoding.toUint8Array(updateEncoder)));
              }
              break;
            }
            case messageAwareness: {
              const update = decoding.readVarUint8Array(decoder);
              awarenessProtocol.applyAwarenessUpdate(awareness, update, socket);
              // Broadcast awareness to others
              socket.to(room).emit('yjs-sync', message);
              break;
            }
          }
        } catch (error) {
          strapi.log.error('[Yjs] Error processing sync message:', error);
        }
      });

      // Handle Yjs document update (simpler approach)
      socket.on('yjs-update', (data) => {
        strapi.log.info(`[Yjs] Received update from ${socket.userName}, reportId: ${socket.reportId}`);

        if (!socket.reportId) {
          strapi.log.warn('[Yjs] No reportId set, ignoring update');
          return;
        }

        const { update } = data;
        const ydoc = getYDoc(socket.reportId);
        const room = `report:${socket.reportId}`;

        // Track changes for auto-versioning
        if (!documentChanges.has(socket.reportId)) {
          documentChanges.set(socket.reportId, { hasChanges: false, users: new Map() });
        }
        const tracker = documentChanges.get(socket.reportId);
        tracker.hasChanges = true;
        if (socket.userId && socket.userName) {
          tracker.users.set(socket.userId, { id: socket.userId, name: socket.userName });
        }

        try {
          // Apply update to server doc
          Y.applyUpdate(ydoc, new Uint8Array(update));

          // Broadcast to others
          socket.to(room).emit('yjs-update', { update });

          strapi.log.info(`[Yjs] Applied and broadcast update for ${socket.reportId}, size: ${update.length}`);
        } catch (error) {
          strapi.log.error('[Yjs] Error applying update:', error);
        }
      });

      // Request full Yjs state
      socket.on('yjs-request-state', () => {
        strapi.log.info(`[Yjs] State requested, reportId: ${socket.reportId}`);

        if (!socket.reportId) {
          strapi.log.warn('[Yjs] No reportId set, cannot send state');
          return;
        }

        const ydoc = getYDoc(socket.reportId);
        const stateUpdate = Y.encodeStateAsUpdate(ydoc);

        socket.emit('yjs-state', { update: Array.from(stateUpdate) });
        strapi.log.info(`[Yjs] Sent full state for ${socket.reportId}, size: ${stateUpdate.length}`);
      });

      // Leave report room
      socket.on('leave-report', async (data) => {
        const { reportId } = data;
        if (!reportId) return;

        const room = `report:${reportId}`;
        socket.leave(room);

        try {
          const collaborativeService = strapi.service('api::collaborative.collaborative');
          if (collaborativeService) {
            await collaborativeService.leaveSession(reportId, socket.id);
            const editors = await collaborativeService.getActiveEditors(reportId);
            io.to(room).emit('user-left', {
              userId: socket.userId,
              userName: socket.userName,
              editors
            });
          }
        } catch (error) {
          strapi.log.error('[Socket.IO] Error leaving session:', error);
        }
      });

      // Field change
      socket.on('field-change', async (data) => {
        const { reportId, userId, userName, fieldPath, oldValue, newValue } = data;
        if (!reportId) return;

        const room = `report:${reportId}`;

        // Track changes for auto-versioning
        if (!documentChanges.has(reportId)) {
          documentChanges.set(reportId, { hasChanges: false, users: new Map() });
        }
        const tracker = documentChanges.get(reportId);
        tracker.hasChanges = true;
        tracker.users.set(userId, { id: userId, name: userName });

        try {
          const collaborativeService = strapi.service('api::collaborative.collaborative');
          if (collaborativeService) {
            const result = await collaborativeService.recordOperation(
              reportId, userId, userName, 'update', fieldPath, oldValue, newValue
            );

            // Broadcast to others
            socket.to(room).emit('field-updated', {
              userId,
              userName,
              fieldPath,
              newValue,
              sequence: result.sequence_number,
            });

            // Confirm to sender
            socket.emit('change-confirmed', {
              operation: result,
              sequence: result.sequence_number,
              applied: true,
            });
          }
        } catch (error) {
          strapi.log.error('[Socket.IO] Error recording change:', error);
          socket.emit('error', { message: 'Failed to save change' });
        }
      });

      // Field focus
      socket.on('field-focus', async (data) => {
        const { reportId, userId, userName, fieldPath, cursorPosition } = data;
        if (!reportId) return;

        const room = `report:${reportId}`;
        socket.to(room).emit('user-focus', { userId, userName, fieldPath, cursorPosition });

        try {
          const collaborativeService = strapi.service('api::collaborative.collaborative');
          if (collaborativeService) {
            await collaborativeService.updateFieldFocus(reportId, socket.id, fieldPath, cursorPosition);
          }
        } catch (error) {
          strapi.log.error('[Socket.IO] Error updating focus:', error);
        }
      });

      // Field blur
      socket.on('field-blur', async (data) => {
        const { reportId, userId, userName, fieldPath } = data;
        if (!reportId) return;

        const room = `report:${reportId}`;
        socket.to(room).emit('user-blur', { userId, userName, fieldPath });

        try {
          const collaborativeService = strapi.service('api::collaborative.collaborative');
          if (collaborativeService) {
            await collaborativeService.updateFieldFocus(reportId, socket.id, null, null);
          }
        } catch (error) {
          strapi.log.error('[Socket.IO] Error updating blur:', error);
        }
      });

      // Heartbeat
      socket.on('heartbeat', async (data) => {
        const { reportId } = data;
        if (!reportId) return;

        try {
          const collaborativeService = strapi.service('api::collaborative.collaborative');
          if (collaborativeService) {
            // Update last_activity
            await strapi.db.query('api::edit-session.edit-session').update({
              where: { socket_id: socket.id },
              data: { last_activity: new Date() },
            });
          }
        } catch (error) {
          // Silent fail for heartbeat
        }
      });

      // Request sync
      socket.on('request-sync', async (data) => {
        const { reportId, sinceSequence } = data;
        if (!reportId) return;

        try {
          const collaborativeService = strapi.service('api::collaborative.collaborative');
          if (collaborativeService) {
            const operations = await collaborativeService.getRecentOperations(reportId, sinceSequence || 0);
            socket.emit('sync-operations', {
              operations,
              currentSequence: operations.length > 0
                ? operations[operations.length - 1].sequence_number
                : sinceSequence || 0,
            });
          }
        } catch (error) {
          strapi.log.error('[Socket.IO] Error syncing operations:', error);
        }
      });

      // Disconnect
      socket.on('disconnect', async () => {
        strapi.log.info(`[Socket.IO] Client disconnected: ${socket.id}`);

        if (socket.reportId) {
          const room = `report:${socket.reportId}`;

          try {
            const collaborativeService = strapi.service('api::collaborative.collaborative');
            if (collaborativeService) {
              await collaborativeService.leaveSession(socket.reportId, socket.id);
              const editors = await collaborativeService.getActiveEditors(socket.reportId);
              io.to(room).emit('user-left', {
                userId: socket.userId,
                userName: socket.userName,
                editors
              });
            }
          } catch (error) {
            strapi.log.error('[Socket.IO] Error on disconnect:', error);
          }
        }
      });
    });

    // Periodic cleanup of stale sessions
    setInterval(async () => {
      try {
        const collaborativeService = strapi.service('api::collaborative.collaborative');
        if (collaborativeService) {
          const cleaned = await collaborativeService.cleanupStaleSessions();
          if (cleaned > 0) {
            strapi.log.info(`[Collaborative] Cleaned up ${cleaned} stale sessions`);
          }
        }
      } catch (error) {
        strapi.log.error('[Collaborative] Error during cleanup:', error);
      }
    }, 60000);

    // Auto-versioning: create versions every 5 minutes for documents with changes
    setInterval(async () => {
      try {
        const versionService = strapi.service('api::report-version.report-version');
        if (!versionService) {
          return;
        }

        for (const [docId, tracker] of documentChanges.entries()) {
          if (tracker.hasChanges && tracker.users.size > 0) {
            // Collect user info
            const userIds = Array.from(tracker.users.values()).map(u => u.id);
            const userNames = Array.from(tracker.users.values()).map(u => u.name).join(', ');

            strapi.log.info(`[Version] Creating auto-version for ${docId} by ${userNames}`);

            // Create version
            await versionService.createVersion(docId, userIds, userNames, true);

            // Reset tracker
            tracker.hasChanges = false;
            tracker.users.clear();

            // Notify connected clients
            const room = `report:${docId}`;
            io.to(room).emit('version-created', {
              userNames,
              isAutoSave: true,
            });
          }
        }
      } catch (error) {
        strapi.log.error('[Version] Error during auto-versioning:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  },
};
