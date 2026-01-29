import pluginId from './pluginId';
import ActiveEditorsPanel from './components/ActiveEditorsPanel';
import CollaborativeIndicator from './components/CollaborativeIndicator';
import HistoryPanel from './components/HistoryPanel';
import VersionsPanel from './components/VersionsPanel';

// Panel component for Edit View sidebar
const ActiveEditorsSidePanel = ({ document, model, collectionType }) => {
  // Only show for reports
  if (model !== 'api::report.report') {
    return null;
  }

  return {
    title: 'Active Editors',
    content: <ActiveEditorsPanel documentId={document?.documentId} />,
  };
};

// History Panel for Edit View sidebar
const HistorySidePanel = ({ document, model, collectionType }) => {
  if (model !== 'api::report.report') {
    return null;
  }

  return {
    title: 'История изменений',
    content: <HistoryPanel documentId={document?.documentId} />,
  };
};

// Versions Panel for Edit View sidebar
const VersionsSidePanel = ({ document, model, collectionType }) => {
  if (model !== 'api::report.report') {
    return null;
  }

  return {
    title: 'Версии документа',
    content: <VersionsPanel documentId={document?.documentId} />,
  };
};

// Header action component
const CollaborativeHeaderAction = ({ document, model }) => {
  // Only show for reports
  if (model !== 'api::report.report') {
    return null;
  }

  return {
    label: '',
    type: 'icon',
    icon: <CollaborativeIndicator documentId={document?.documentId} />,
  };
};

export default {
  register(app) {
    // Register the plugin
    app.registerPlugin({
      id: pluginId,
      name: 'Collaborative Editing',
    });
  },

  bootstrap(app) {
    const contentManagerApis = app.getPlugin('content-manager')?.apis;

    if (!contentManagerApis) {
      console.warn('[Collaborative Editing] Content Manager APIs not available');
      return;
    }

    // Add the Active Editors panel to the Edit View sidebar
    if (contentManagerApis.addEditViewSidePanel) {
      try {
        contentManagerApis.addEditViewSidePanel([
          ActiveEditorsSidePanel,
          HistorySidePanel,
          VersionsSidePanel,
        ]);
        console.log('[Collaborative Editing] Side panels registered');
      } catch (error) {
        console.error('[Collaborative Editing] Failed to register side panels:', error);
      }
    }

    // Add collaborative indicator to the header
    if (contentManagerApis.addDocumentHeaderAction) {
      try {
        contentManagerApis.addDocumentHeaderAction([CollaborativeHeaderAction]);
        console.log('[Collaborative Editing] Header action registered');
      } catch (error) {
        console.error('[Collaborative Editing] Failed to register header action:', error);
      }
    }
  },

  async registerTrads({ locales }) {
    const importedTrads = await Promise.all(
      locales.map((locale) => {
        return Promise.resolve({
          data: {
            [`${pluginId}.plugin.name`]: 'Collaborative Editing',
            [`${pluginId}.active-editors`]: 'Active Editors',
            [`${pluginId}.history`]: 'История изменений',
            [`${pluginId}.versions`]: 'Версии документа',
            [`${pluginId}.no-editors`]: 'No one else is editing',
            [`${pluginId}.editing-field`]: 'Editing',
            [`${pluginId}.rollback`]: 'Откатить',
            [`${pluginId}.restore`]: 'Восстановить',
            [`${pluginId}.compare`]: 'Сравнить',
          },
          locale,
        });
      })
    );

    return Promise.resolve(importedTrads);
  },
};

export { pluginId };
