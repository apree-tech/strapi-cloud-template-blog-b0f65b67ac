import { useEffect, useRef, useCallback, memo } from 'react';
import { useForm } from '@strapi/admin/strapi-admin';
import { useDomSync } from '../hooks/useDomSync';

// Map component types to their blocks-type field names
const BLOCKS_FIELDS = {
  'report-components.text-block': 'content',
  'report-components.analysis-block': 'conclusions',
  'report-components.section': 'description',
};

/**
 * Syncs a single blocks (Slate rich text) field between users.
 * Uses useDomSync for socket broadcast and useForm to read/write form values.
 * BlocksEditor's built-in useResetKey() detects external value changes and remounts Slate.
 */
const SingleBlockSync = memo(({ blockIndex, fieldName, documentId }) => {
  const fieldPath = `content_blocks.${blockIndex}.${fieldName}`;
  const isRemoteRef = useRef(false);
  const prevJsonRef = useRef(null);

  // Read field value from Strapi form state
  const value = useForm('BlocksSync', (state) => {
    return state.values?.content_blocks?.[blockIndex]?.[fieldName];
  });

  const onChange = useForm('BlocksSync', (state) => state.onChange);

  // Handle remote update from another user
  const handleRemoteUpdate = useCallback((newValue) => {
    isRemoteRef.current = true;
    // onChange(stringPath, value) uses setIn() to update nested form value
    // This triggers BlocksEditor's useResetKey() which remounts Slate with new initialValue
    onChange(fieldPath, newValue);
    // Keep flag active long enough for React to process the update
    // and for our useEffect to skip broadcasting back
    setTimeout(() => { isRemoteRef.current = false; }, 500);
  }, [fieldPath, onChange]);

  const { updateValue: broadcast } = useDomSync(
    `blocks:${documentId}:${blockIndex}:${fieldName}`,
    value,
    handleRemoteUpdate
  );

  // Watch for local changes and broadcast to other users
  useEffect(() => {
    if (isRemoteRef.current) return;

    const json = JSON.stringify(value);
    if (json === prevJsonRef.current) return;
    prevJsonRef.current = json;

    if (value) {
      broadcast(value);
    }
  }, [value, broadcast]);

  return null; // Invisible sync component
});

SingleBlockSync.displayName = 'SingleBlockSync';

/**
 * Renders a SingleBlockSync for each blocks-type field found in content_blocks.
 * Must be rendered inside the edit view form context (useForm accessible).
 */
const BlocksFieldSync = ({ documentId }) => {
  const contentBlocks = useForm('BlocksFieldSync', (state) => {
    return state.values?.content_blocks;
  });

  if (!contentBlocks || !Array.isArray(contentBlocks) || !documentId) return null;

  return contentBlocks.map((block, index) => {
    const fieldName = BLOCKS_FIELDS[block?.__component];
    if (!fieldName) return null;

    return (
      <SingleBlockSync
        key={`${index}-${block.__component}`}
        blockIndex={index}
        fieldName={fieldName}
        documentId={documentId}
      />
    );
  });
};

export default BlocksFieldSync;
