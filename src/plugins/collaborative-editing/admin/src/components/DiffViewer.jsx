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
      <Box style={{ lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
        {changes.map((part, index) => (
          <span
            key={index}
            style={{
              backgroundColor: part.added
                ? '#f0f0ff'
                : part.removed
                  ? '#f6ecf0'
                  : 'transparent',
              color: part.added
                ? '#4945ff'
                : part.removed
                  ? '#a5a0b8'
                  : 'inherit',
              textDecoration: part.removed ? 'line-through' : 'none',
              padding: part.added || part.removed ? '1px 3px' : '0',
              borderRadius: '4px',
            }}
          >
            {typeof part.value === 'string' ? part.value : JSON.stringify(part.value)}
          </span>
        ))}
      </Box>
    );
  };

  // Safely stringify a value for display
  const displayValue = (val) => {
    if (val === null || val === undefined) return '(пусто)';
    if (typeof val === 'string') return val || '(пусто)';
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return JSON.stringify(val).substring(0, 200);
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
          - {displayValue(change.old)}
        </Typography>
        <Typography variant="pi" textColor="success600">
          + {displayValue(change.new)}
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
      added: { text: 'Добавлен', accent: '#328048', textColor: 'success700' },
      removed: { text: 'Удалён', accent: '#d02b20', textColor: 'danger600' },
      modified: { text: 'Изменён', accent: '#7b79ff', textColor: 'primary600' },
    };

    const config = typeConfig[change.type] || typeConfig.modified;

    return (
      <Box
        key={index}
        padding={2}
        marginBottom={2}
        hasRadius
        background="neutral100"
        style={{
          borderLeft: `3px solid ${config.accent}`,
          border: '1px solid #dcdce4',
          borderLeftWidth: '3px',
          borderLeftColor: config.accent,
        }}
      >
        <Typography variant="pi" fontWeight="bold" textColor={config.textColor} style={{ fontSize: '11px' }}>
          {config.text}: {getComponentName(change.component)} (#{change.index + 1})
        </Typography>

        {/* Show added block info */}
        {change.type === 'added' && change.block && (
          <Box marginTop={1}>
            {change.block.title && (
              <Typography variant="pi" textColor="neutral700" style={{ fontSize: '10px' }}>
                Заголовок: {change.block.title}
              </Typography>
            )}
            {change.block.content && (
              <Typography variant="pi" textColor="neutral600" style={{ fontSize: '10px' }}>
                Содержимое: {typeof change.block.content === 'string'
                  ? change.block.content.substring(0, 100)
                  : JSON.stringify(change.block.content).substring(0, 100)}...
              </Typography>
            )}
          </Box>
        )}

        {/* Show removed block info */}
        {change.type === 'removed' && change.block && (
          <Box marginTop={1}>
            {change.block.title && (
              <Typography
                variant="pi"
                textColor="neutral500"
                style={{ textDecoration: 'line-through', fontSize: '10px' }}
              >
                Заголовок: {change.block.title}
              </Typography>
            )}
          </Box>
        )}

        {/* Show modified block changes */}
        {change.type === 'modified' && change.changes && (
          <Box marginTop={1}>
            {Object.entries(change.changes).map(([field, fieldDiff]) => (
              <Box key={field} marginBottom={1}>
                <Typography variant="pi" fontWeight="semiBold" textColor="neutral700" style={{ fontSize: '10px' }}>
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
        <Box marginBottom={3}>
          <Typography variant="pi" fontWeight="bold" textColor="neutral800" style={{ fontSize: '11px' }}>
            Заголовок:
          </Typography>
          {renderWordDiff(diff.title)}
        </Box>
      )}

      {/* Date diffs */}
      {diff.dateFrom && (
        <Box marginBottom={2}>
          <Typography variant="pi" fontWeight="bold" textColor="neutral800" style={{ fontSize: '11px' }}>
            Дата начала:
          </Typography>
          {renderSimpleDiff(diff.dateFrom)}
        </Box>
      )}

      {diff.dateTo && (
        <Box marginBottom={2}>
          <Typography variant="pi" fontWeight="bold" textColor="neutral800" style={{ fontSize: '11px' }}>
            Дата окончания:
          </Typography>
          {renderSimpleDiff(diff.dateTo)}
        </Box>
      )}

      {/* Content blocks diff */}
      {diff.content_blocks && diff.content_blocks.length > 0 && (
        <Box>
          <Typography variant="pi" fontWeight="bold" textColor="neutral800" style={{ fontSize: '11px', marginBottom: '4px' }}>
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
