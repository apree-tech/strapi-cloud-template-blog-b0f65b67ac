import pluginId from './pluginId';
import ActiveEditorsPanel from './components/ActiveEditorsPanel';
import CollaborativeIndicator from './components/CollaborativeIndicator';
import HistoryPanel from './components/HistoryPanel';
import VersionsPanel from './components/VersionsPanel';
import CommentsPanel from './components/CommentsPanel';
import SocialMetricsTable from './components/SocialMetricsTable';
import TableDataEditor from './components/TableDataEditor';
import ChatCommentsEditor from './components/ChatCommentsEditor';
import CopyFromPreviousPanel from './components/CopyFromPreviousPanel';
import RevenueTableEditor from './components/RevenueTableEditor';

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

// Copy From Previous Panel for Edit View sidebar
const CopyFromPreviousSidePanel = ({ document, model, collectionType }) => {
  if (model !== 'api::report.report') {
    return null;
  }

  return {
    title: 'Копирование данных',
    content: <CopyFromPreviousPanel documentId={document?.documentId} />,
  };
};

// Comments Panel for Edit View sidebar
const CommentsSidePanel = ({ document, model, collectionType }) => {
  if (model !== 'api::report.report') {
    return null;
  }

  return {
    title: 'Комментарии',
    content: <CommentsPanel documentId={document?.documentId} />,
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

    // Register custom field for social metrics table
    app.customFields.register({
      name: 'social-metrics',
      pluginId: pluginId,
      type: 'json',
      intlLabel: {
        id: `${pluginId}.social-metrics.label`,
        defaultMessage: 'Метрики соцсетей',
      },
      intlDescription: {
        id: `${pluginId}.social-metrics.description`,
        defaultMessage: 'Таблица метрик с автоматическим расчётом изменений',
      },
      components: {
        Input: async () => ({ default: SocialMetricsTable }),
      },
    });

    // Register custom field for table data editor
    app.customFields.register({
      name: 'table-editor',
      pluginId: pluginId,
      type: 'json',
      intlLabel: {
        id: `${pluginId}.table-editor.label`,
        defaultMessage: 'Редактор таблицы',
      },
      intlDescription: {
        id: `${pluginId}.table-editor.description`,
        defaultMessage: 'Визуальный редактор таблицы с колонками и строками',
      },
      components: {
        Input: async () => ({ default: TableDataEditor }),
      },
    });

    // Register custom field for chat-like comments
    app.customFields.register({
      name: 'chat-comments',
      pluginId: pluginId,
      type: 'json',
      intlLabel: {
        id: `${pluginId}.chat-comments.label`,
        defaultMessage: 'Чат комментариев',
      },
      intlDescription: {
        id: `${pluginId}.chat-comments.description`,
        defaultMessage: 'Чат с комментариями и @упоминаниями',
      },
      components: {
        Input: async () => ({ default: ChatCommentsEditor }),
      },
    });

    // Register custom field for revenue table
    app.customFields.register({
      name: 'revenue-table',
      pluginId: pluginId,
      type: 'json',
      intlLabel: {
        id: `${pluginId}.revenue-table.label`,
        defaultMessage: 'Таблица оборотов',
      },
      intlDescription: {
        id: `${pluginId}.revenue-table.description`,
        defaultMessage: 'Таблица оборотов с загрузкой данных из API',
      },
      components: {
        Input: async () => ({ default: RevenueTableEditor }),
      },
    });
  },

  bootstrap(app) {
    const contentManagerApis = app.getPlugin('content-manager')?.apis;

    if (!contentManagerApis) {
      console.warn('[Collaborative Editing] Content Manager APIs not available');
      return;
    }

    // Auto-calculate social media stats change percentage
    const initSocialMediaStatsCalculator = () => {
      const calculateChange = (prev, current) => {
        const p = Number(String(prev).replace(/\s/g, '')) || 0;
        const c = Number(String(current).replace(/\s/g, '')) || 0;
        if (p === 0) return c > 0 ? 100 : 0;
        return Math.round(((c - p) / p) * 1000) / 10;
      };

      const getIndicator = (change) => {
        if (change > 0) return '📈';
        if (change < 0) return '📉';
        return '➡️';
      };

      const setInputValue = (input, value) => {
        if (!input) return;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter && input.value !== String(value)) {
          nativeInputValueSetter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      // Make input read-only with styling
      const makeReadOnly = (input) => {
        if (!input) return;
        input.setAttribute('readonly', 'true');
        input.style.backgroundColor = '#f0f0f0';
        input.style.cursor = 'not-allowed';
        input.style.color = '#666';
      };

      const processAllMetrics = () => {
        // Find all social metric components by looking for prev_value inputs
        const allInputs = document.querySelectorAll('input');
        const metricContainers = new Map();

        allInputs.forEach(input => {
          const name = input.getAttribute('name') || '';
          // Match pattern like: content_blocks.0.metrics.0.prev_value
          const match = name.match(/^(content_blocks\.\d+\.metrics\.\d+)\.(prev_value|current_value|change_percent|change_indicator)$/);
          if (match) {
            const basePath = match[1];
            if (!metricContainers.has(basePath)) {
              metricContainers.set(basePath, {});
            }
            metricContainers.get(basePath)[match[2]] = input;
          }
        });

        // Calculate for each metric
        metricContainers.forEach((inputs, basePath) => {
          // Make calculated fields read-only
          if (inputs.change_percent) {
            makeReadOnly(inputs.change_percent);
          }
          if (inputs.change_indicator) {
            makeReadOnly(inputs.change_indicator);
          }

          if (inputs.prev_value && inputs.current_value) {
            const prev = inputs.prev_value.value;
            const current = inputs.current_value.value;
            const change = calculateChange(prev, current);
            const indicator = getIndicator(change);

            if (inputs.change_percent) {
              const formatted = change.toFixed(1) + '%';
              setInputValue(inputs.change_percent, formatted);
            }
            if (inputs.change_indicator) {
              setInputValue(inputs.change_indicator, indicator);
            }
          }
        });
      };

      // Watch for input changes
      document.addEventListener('input', (e) => {
        const input = e.target;
        const name = input.getAttribute?.('name') || '';
        if (name.includes('.prev_value') || name.includes('.current_value')) {
          console.log('[SocialMediaStats] Input changed:', name);
          setTimeout(processAllMetrics, 100);
        }
      }, true);

      // Also watch for DOM changes (new metrics added)
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            setTimeout(processAllMetrics, 200);
            break;
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      console.log('[SocialMediaStats] Calculator initialized with MutationObserver');
    };

    // Initialize after a delay to ensure DOM is ready
    setTimeout(initSocialMediaStatsCalculator, 2000);

    // Add the Active Editors panel to the Edit View sidebar
    if (contentManagerApis.addEditViewSidePanel) {
      try {
        contentManagerApis.addEditViewSidePanel([
          CommentsSidePanel,
          CopyFromPreviousSidePanel,
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
            [`${pluginId}.social-media-stats`]: 'Статистика соцсетей',
            [`${pluginId}.copy-from-previous`]: 'Из прошлого',
            [`${pluginId}.add-metric`]: 'Добавить метрику',
            [`${pluginId}.add-default`]: 'Добавить стандартные',
            [`${pluginId}.comments`]: 'Комментарии',
            [`${pluginId}.add-comment`]: 'Добавить комментарий',
            [`${pluginId}.resolve`]: 'Решено',
            [`${pluginId}.unresolve`]: 'Открыть заново',
          },
          locale,
        });
      })
    );

    return Promise.resolve(importedTrads);
  },
};

export { pluginId };
