import React from 'react';
import { Box, Flex, Typography, Badge } from '@strapi/design-system';
import { useCollaborativeSocket } from '../hooks/useCollaborativeSocket';
import { useCurrentUser } from '../hooks/useCurrentUser';
import FieldSyncManager from './FieldSyncProvider';

// Generate a consistent color from user ID
const getUserColor = (userId) => {
  const colors = [
    '#4945FF', // Primary blue
    '#7B79FF', // Light purple
    '#EE5E52', // Red
    '#0C75AF', // Blue
    '#328048', // Green
    '#BE5D01', // Orange
    '#8E4DFF', // Purple
    '#00A5A8', // Teal
  ];
  return colors[(userId || 0) % colors.length];
};

// Get initials from name
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const ActiveEditorsPanel = ({ documentId }) => {
  const { user: currentUser, loading: userLoading } = useCurrentUser();
  const { connected, editors, fieldFocus, yjs } = useCollaborativeSocket(documentId, currentUser);

  console.log('[ActiveEditorsPanel] Render:', { documentId, currentUser, userLoading, connected, editorsCount: editors.length, yjsSynced: yjs?.synced });

  if (!documentId) {
    return (
      <Box padding={4}>
        <Typography variant="pi" textColor="neutral600">
          Save the document to enable collaborative editing
        </Typography>
      </Box>
    );
  }

  if (userLoading) {
    return (
      <Box padding={4}>
        <Typography variant="pi" textColor="neutral600">
          Loading...
        </Typography>
      </Box>
    );
  }

  return (
    <Box padding={2}>
      {/* Connection status */}
      <Flex alignItems="center" gap={1} marginBottom={2}>
        <Box
          width="6px"
          height="6px"
          borderRadius="50%"
          background={connected ? 'success500' : 'danger500'}
        />
        <Typography variant="pi" textColor="neutral600" style={{ fontSize: '11px' }}>
          {connected ? 'Online' : 'Offline'}
        </Typography>
      </Flex>

      {/* Editors list */}
      {editors.length === 0 ? (
        <Typography variant="pi" textColor="neutral500" style={{ fontSize: '11px' }}>
          Никто не редактирует
        </Typography>
      ) : (
        <Flex direction="column" alignItems="flex-start" gap={2}>
          <Typography variant="pi" textColor="neutral600" style={{ fontSize: '11px' }}>
            {editors.length} {editors.length === 1 ? 'редактор' : 'редакторов'}
          </Typography>

          {/* Sort editors so current user is first */}
          {[...editors].sort((a, b) => {
            const aIsCurrentUser = currentUser && Number(a.userId) === Number(currentUser.id);
            const bIsCurrentUser = currentUser && Number(b.userId) === Number(currentUser.id);
            if (aIsCurrentUser && !bIsCurrentUser) return -1;
            if (!aIsCurrentUser && bIsCurrentUser) return 1;
            return 0;
          }).map((editor) => {
            const color = getUserColor(editor.userId);
            const isCurrentUser = currentUser && Number(editor.userId) === Number(currentUser.id);
            const currentField = Object.entries(fieldFocus).find(
              ([_, focus]) => focus.userId === editor.userId
            );

            return (
              <Flex key={editor.userId} alignItems="center" gap={2}>
                <Box position="relative">
                  <Box
                    style={{
                      backgroundColor: color,
                      color: 'white',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: '600',
                    }}
                  >
                    {getInitials(editor.userName)}
                  </Box>
                  {/* Online indicator */}
                  <Box
                    position="absolute"
                    style={{
                      bottom: '-1px',
                      right: '-1px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#328048',
                      border: '1.5px solid white',
                    }}
                  />
                </Box>

                <Flex direction="column" alignItems="flex-start" gap={0}>
                  <Typography variant="pi" fontWeight="semiBold" style={{ fontSize: '12px' }}>
                    {editor.userName}{isCurrentUser ? ' (вы)' : ''}
                  </Typography>
                  {currentField && (
                    <Typography variant="pi" textColor="neutral500" style={{ fontSize: '10px' }}>
                      {currentField[0].split('.').pop()}
                    </Typography>
                  )}
                </Flex>
              </Flex>
            );
          })}
        </Flex>
      )}

      {/* Sync status */}
      <Box marginTop={2} paddingTop={2} borderStyle="solid" borderWidth="1px 0 0 0" borderColor="neutral200">
        <Typography variant="pi" textColor={yjs?.synced ? 'success600' : 'neutral500'} style={{ fontSize: '10px' }}>
          {yjs?.synced ? '✓ Синхронизировано' : 'Синхронизация...'}
        </Typography>
      </Box>

      {/* Field Sync Manager - handles Yjs bindings */}
      <FieldSyncManager
        documentId={documentId}
        yjs={yjs}
        connected={connected}
        fieldFocus={fieldFocus}
        currentUser={currentUser}
      />
    </Box>
  );
};

export default ActiveEditorsPanel;
