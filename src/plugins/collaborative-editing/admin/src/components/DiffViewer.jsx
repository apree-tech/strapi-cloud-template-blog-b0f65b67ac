import React from 'react';
import { Box, Flex, Typography } from '@strapi/design-system';

const DiffViewer = ({ diff }) => {
  if (!diff) {
    return (
      <Typography variant="pi" textColor="neutral500">
        Нет изменений для отображения
      </Typography>
    );
  }

  // Render word-level diff (array from 'diff' library)
  const renderWordDiff = (changes) => {
    if (!changes || !Array.isArray(changes)) return null;

    return (
      <Box style={{ lineHeight: 1.6 }}>
        {changes.map((part, index) => (
          <span
            key={index}
            style={{
              backgroundColor: part.added
                ? '#d4edda'
                : part.removed
                  ? '#f8d7da'
                  : 'transparent',
              color: part.added
                ? '#155724'
                : part.removed
                  ? '#721c24'
                  : 'inherit',
              textDecoration: part.removed ? 'line-through' : 'none',
              padding: part.added || part.removed ? '0 2px' : '0',
              borderRadius: '2px',
            }}
          >
            {part.value}
          </span>
        ))}
      </Box>
    );
  };

  // Render simple old/new value diff
  const renderSimpleDiff = (change) => {
    if (!change) return null;

    return (
      <Flex direction="column" gap={1}>
        <Typography
          variant="pi"
          textColor="danger600"
          style={{ textDecoration: 'line-through' }}
        >
          - {change.old || '(пусто)'}
        </Typography>
        <Typography variant="pi" textColor="success600">
          + {change.new || '(пусто)'}
        </Typography>
      </Flex>
    );
  };

  // Get component display name
  const getComponentName = (componentId) => {
    const names = {
      'report.metric-group': 'Группа метрик',
      'report.image-section': 'Изображение',
      'report.analysis-block': 'Блок анализа',
      'report.text-block': 'Текстовый блок',
      'report.chart-block': 'График',
      'report.table-data': 'Таблица',
      'report.section': 'Раздел',
    };
    return names[componentId] || componentId || 'Блок';
  };

  // Render block change
  const renderBlockChange = (change, index) => {
    const typeConfig = {
      added: {
        text: 'Добавлен',
        bg: '#d4edda',
        border: '#28a745',
        color: '#155724',
      },
      removed: {
        text: 'Удалён',
        bg: '#f8d7da',
        border: '#dc3545',
        color: '#721c24',
      },
      modified: {
        text: 'Изменён',
        bg: '#fff3cd',
        border: '#ffc107',
        color: '#856404',
      },
    };

    const config = typeConfig[change.type] || typeConfig.modified;

    return (
      <Box
        key={index}
        padding={3}
        marginBottom={2}
        hasRadius
        style={{
          backgroundColor: config.bg,
          border: `1px solid ${config.border}`,
        }}
      >
        <Typography
          variant="omega"
          fontWeight="bold"
          style={{ color: config.color }}
        >
          {config.text}: {getComponentName(change.component)} (#{change.index + 1})
        </Typography>

        {/* Show added block info */}
        {change.type === 'added' && change.block && (
          <Box marginTop={2}>
            {change.block.title && (
              <Typography variant="pi" style={{ color: config.color }}>
                Заголовок: {change.block.title}
              </Typography>
            )}
            {change.block.content && (
              <Typography variant="pi" style={{ color: config.color }}>
                Содержимое: {typeof change.block.content === 'string'
                  ? change.block.content.substring(0, 100)
                  : JSON.stringify(change.block.content).substring(0, 100)}...
              </Typography>
            )}
          </Box>
        )}

        {/* Show removed block info */}
        {change.type === 'removed' && change.block && (
          <Box marginTop={2}>
            {change.block.title && (
              <Typography
                variant="pi"
                style={{ color: config.color, textDecoration: 'line-through' }}
              >
                Заголовок: {change.block.title}
              </Typography>
            )}
          </Box>
        )}

        {/* Show modified block changes */}
        {change.type === 'modified' && change.changes && (
          <Box marginTop={2}>
            {Object.entries(change.changes).map(([field, fieldDiff]) => (
              <Box key={field} marginBottom={2}>
                <Typography variant="pi" fontWeight="semiBold">
                  {field}:
                </Typography>
                {Array.isArray(fieldDiff) ? (
                  renderWordDiff(fieldDiff)
                ) : (
                  renderSimpleDiff(fieldDiff)
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  };

  const hasChanges =
    diff.title ||
    diff.dateFrom ||
    diff.dateTo ||
    (diff.content_blocks && diff.content_blocks.length > 0);

  if (!hasChanges) {
    return (
      <Typography variant="pi" textColor="neutral500">
        Нет изменений между версиями
      </Typography>
    );
  }

  return (
    <Box>
      {/* Title diff */}
      {diff.title && (
        <Box marginBottom={4}>
          <Typography variant="omega" fontWeight="bold" marginBottom={2}>
            Заголовок:
          </Typography>
          {renderWordDiff(diff.title)}
        </Box>
      )}

      {/* Date diffs */}
      {diff.dateFrom && (
        <Box marginBottom={3}>
          <Typography variant="omega" fontWeight="bold" marginBottom={1}>
            Дата начала:
          </Typography>
          {renderSimpleDiff(diff.dateFrom)}
        </Box>
      )}

      {diff.dateTo && (
        <Box marginBottom={3}>
          <Typography variant="omega" fontWeight="bold" marginBottom={1}>
            Дата окончания:
          </Typography>
          {renderSimpleDiff(diff.dateTo)}
        </Box>
      )}

      {/* Content blocks diff */}
      {diff.content_blocks && diff.content_blocks.length > 0 && (
        <Box>
          <Typography variant="omega" fontWeight="bold" marginBottom={2}>
            Блоки контента:
          </Typography>
          {diff.content_blocks.map((change, index) =>
            renderBlockChange(change, index)
          )}
        </Box>
      )}
    </Box>
  );
};

export default DiffViewer;
