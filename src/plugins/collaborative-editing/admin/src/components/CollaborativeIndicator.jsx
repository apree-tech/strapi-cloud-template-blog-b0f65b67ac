import React from 'react';
import { Box, Flex, Typography, Tooltip } from '@strapi/design-system';
import { useCollaborativeSocket } from '../hooks/useCollaborativeSocket';
import { useCurrentUser } from '../hooks/useCurrentUser';

const CollaborativeIndicator = ({ documentId }) => {
  const { user: currentUser } = useCurrentUser();
  const { connected, editors } = useCollaborativeSocket(documentId, currentUser);

  if (!documentId || editors.length === 0) {
    return null;
  }

  return (
    <Flex alignItems="center" gap={2} marginRight={4}>
      {/* Connection indicator */}
      <Tooltip description={connected ? 'CRDT sync active' : 'Reconnecting...'}>
        <Box
          width="8px"
          height="8px"
          borderRadius="50%"
          background={connected ? 'success500' : 'warning500'}
          style={{
            animation: connected ? 'none' : 'pulse 1.5s infinite',
          }}
        />
      </Tooltip>

      <Typography variant="pi" textColor="neutral600">
        {editors.length} editing
      </Typography>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}
      </style>
    </Flex>
  );
};

export default CollaborativeIndicator;
