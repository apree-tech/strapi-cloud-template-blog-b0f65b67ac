import React, { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * FieldSyncManager - Manages real-time field synchronization using Yjs CRDT
 * Saves only before version creation (every 5 minutes) instead of every 1 second
 */
const FieldSyncManager = ({ documentId, yjs, connected, fieldFocus, currentUser }) => {
  const boundFieldsRef = useRef(new Set());
  const cleanupFunctionsRef = useRef(new Map());
  const savingRef = useRef(false);
  const socketRef = useRef(null);

  // Save function - clicks the Save button
  const triggerSave = useCallback(async () => {
    if (savingRef.current) return Promise.resolve(false);

    // Find and click the save button
    const saveButton = document.querySelector('button[type="submit"]') ||
                       document.querySelector('[data-testid="save-button"]') ||
                       Array.from(document.querySelectorAll('button')).find(btn =>
                         btn.textContent?.toLowerCase().includes('save') ||
                         btn.textContent?.toLowerCase().includes('сохранить')
                       );

    if (saveButton && !saveButton.disabled) {
      console.log('[VersionSave] Triggering save before version...');
      savingRef.current = true;

      try {
        saveButton.click();
        console.log('[VersionSave] Save triggered successfully');
        return new Promise(resolve => {
          // Wait for save to complete (Strapi form submission)
          setTimeout(() => {
            savingRef.current = false;
            resolve(true);
          }, 2000);
        });
      } catch (error) {
        console.error('[VersionSave] Error triggering save:', error);
        savingRef.current = false;
        return Promise.resolve(false);
      }
    }
    return Promise.resolve(false);
  }, []);

  // Listen for prepare-version event from server
  useEffect(() => {
    if (!documentId) return;

    // Get or create socket connection
    const socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[VersionSave] Socket connected for version events');
      socket.emit('join-report', { reportId: documentId });
    });

    // When server is about to create a version, save first
    socket.on('prepare-version', async ({ reportId }) => {
      if (reportId !== documentId) return;

      console.log('[VersionSave] Received prepare-version, saving...');
      const saved = await triggerSave();

      // Notify server that save is complete
      socket.emit('version-ready', { reportId, saved });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [documentId, triggerSave]);

  // Check if element is inside a CodeMirror/Slate/Blocks editor
  const isInsideRichEditor = useCallback((element) => {
    let parent = element.parentElement;
    while (parent) {
      // Check for CodeMirror
      if (parent.classList?.contains('cm-editor') ||
          parent.classList?.contains('CodeMirror') ||
          parent.hasAttribute('data-slate-editor') ||
          parent.hasAttribute('data-slate-node') ||
          parent.classList?.contains('slate-editor') ||
          // Strapi's Blocks editor container
          parent.getAttribute('data-strapi-field')?.includes('blocks') ||
          parent.classList?.contains('ck-editor') ||
          // Generic rich text containers
          parent.getAttribute('contenteditable') === 'true') {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }, []);

  // Bind all text inputs to Yjs (simple inputs only, not Blocks Editor)
  const bindAllFields = useCallback(() => {
    if (!yjs || !yjs.synced || !yjs.bindTextInput) {
      console.log('[FieldSync] Yjs not ready yet');
      return;
    }

    const form = document.querySelector('form');
    if (!form) return;

    // Bind regular inputs
    const inputs = form.querySelectorAll('input[name], textarea[name]');
    console.log('[FieldSync] Found inputs:', inputs.length);

    inputs.forEach((input) => {
      try {
        const fieldPath = input.getAttribute('name');
        const inputType = input.getAttribute('type') || 'text';

        // Skip non-text inputs
        if (['checkbox', 'radio', 'hidden', 'file', 'submit', 'button'].includes(inputType)) {
          return;
        }

        // Skip if already bound
        if (!fieldPath || boundFieldsRef.current.has(fieldPath)) return;

        // Skip inputs inside rich text editors (CodeMirror, Slate, CKEditor, etc.)
        if (isInsideRichEditor(input)) {
          console.log('[FieldSync] Skipping rich editor input:', fieldPath);
          return;
        }

        // Skip inputs with aria-hidden (likely internal editor inputs)
        if (input.getAttribute('aria-hidden') === 'true') {
          return;
        }

        // Skip inputs that are not visible
        const style = window.getComputedStyle(input);
        if (style.display === 'none' || style.visibility === 'hidden' || input.offsetParent === null) {
          return;
        }

        console.log('[FieldSync] Binding field:', fieldPath, 'type:', inputType);

        const cleanup = yjs.bindTextInput(input, fieldPath);
        boundFieldsRef.current.add(fieldPath);
        cleanupFunctionsRef.current.set(fieldPath, cleanup);
      } catch (error) {
        console.warn('[FieldSync] Error binding input:', error);
      }
    });

    // Note: Blocks Editor (Slate/CodeMirror) sync is disabled
    // because direct DOM manipulation breaks their internal state.
    // Only simple input/textarea fields are synchronized via Yjs.
  }, [yjs, isInsideRichEditor]);

  // Update field focus indicators
  useEffect(() => {
    if (!fieldFocus || !currentUser) return;

    document.querySelectorAll('.collab-editing-indicator').forEach(el => el.remove());

    Object.entries(fieldFocus).forEach(([fieldPath, focus]) => {
      if (focus.userId === currentUser.id) return;

      try {
        const input = document.querySelector(`[name="${fieldPath}"]`);
        if (!input) return;

        // Skip inputs inside rich text editors
        if (isInsideRichEditor(input)) return;

        const indicator = document.createElement('div');
        indicator.className = 'collab-editing-indicator';
        indicator.style.cssText = `
          position: absolute;
          top: -20px;
          right: 0;
          background: #4945FF;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          z-index: 100;
          animation: fadeIn 0.2s ease-out;
        `;
        indicator.textContent = `${focus.userName} editing`;

        const wrapper = input.closest('.collab-field-wrapper') || input.parentElement;
        if (wrapper) {
          wrapper.style.position = 'relative';
          wrapper.appendChild(indicator);
        }

        input.style.boxShadow = '0 0 0 2px #4945FF';
      } catch (error) {
        console.warn('[FieldSync] Error adding focus indicator:', error);
      }
    });

    return () => {
      document.querySelectorAll('.collab-editing-indicator').forEach(el => el.remove());
      document.querySelectorAll('[name]').forEach(input => {
        try {
          input.style.boxShadow = '';
        } catch (e) {
          // Ignore errors for inputs that may have been removed
        }
      });
    };
  }, [fieldFocus, currentUser, isInsideRichEditor]);

  // Initialize bindings when Yjs is ready
  useEffect(() => {
    if (!documentId || !connected || !yjs?.synced) return;

    console.log('[FieldSync] Yjs synced, binding fields...');
    bindAllFields();

    const observer = new MutationObserver((mutations) => {
      let shouldRebind = false;
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            // Only process element nodes
            if (node.nodeType !== 1) return;

            // Skip if the mutation is inside a CodeMirror/Slate editor
            const isEditorMutation =
              node.classList?.contains('cm-') ||
              node.closest?.('.cm-editor') ||
              node.closest?.('[data-slate-editor]') ||
              node.closest?.('.ck-editor');

            if (isEditorMutation) return;

            // Check if this is a form input we care about
            if (node.matches?.('input[name], textarea[name]') ||
                node.querySelector?.('input[name], textarea[name]')) {
              shouldRebind = true;
            }
          });
        }
      });
      if (shouldRebind) {
        setTimeout(bindAllFields, 100);
      }
    });

    // Only observe the form, not the entire body
    const form = document.querySelector('form');
    if (form) {
      observer.observe(form, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      cleanupFunctionsRef.current.forEach((cleanup) => cleanup());
      cleanupFunctionsRef.current.clear();
      boundFieldsRef.current.clear();
    };
  }, [documentId, connected, yjs?.synced, bindAllFields]);

  // Add global styles
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'collab-field-styles';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .collab-field-wrapper input:focus,
      .collab-field-wrapper textarea:focus {
        outline: none;
        box-shadow: 0 0 0 2px #4945FF !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById('collab-field-styles');
      if (existingStyle) existingStyle.remove();
    };
  }, []);

  return null;
};

export default FieldSyncManager;
