import React, { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Typography, Badge } from '@strapi/design-system';
import { useFetchClient } from '@strapi/admin/strapi-admin';

const CommentsPanel = ({ documentId }) => {
  const { get } = useFetchClient();
  const [commentsWithContext, setCommentsWithContext] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get human-readable component name
  const getComponentLabel = (component) => {
    const labels = {
      'report-components.metric-group': 'Метрики',
      'report-components.image-section': 'Изображения',
      'report-components.analysis-block': 'Анализ',
      'report-components.text-block': 'Текст',
      'report-components.chart-block': 'График',
      'report-components.table-data': 'Таблица',
      'report-components.section': 'Секция',
      'report-components.social-media-stats': 'Соцсети',
    };
    return labels[component] || component?.split('.').pop() || 'Блок';
  };

  // Fetch comment blocks with context
  const fetchComments = useCallback(async () => {
    if (!documentId) return;

    setLoading(true);
    try {
      const { data } = await get(`/content-manager/collection-types/api::report.report/${documentId}`);

      if (data?.data?.content_blocks && Array.isArray(data.data.content_blocks)) {
        const blocks = data.data.content_blocks;
        const result = [];

        blocks.forEach((block, index) => {
          if (block.__component === 'report-components.comment-block' && block.messages) {
            // Filter messages that have mentions
            const messagesWithMentions = block.messages.filter(msg =>
              (msg.mentions && msg.mentions.length > 0) ||
              (msg.content && msg.content.includes('@'))
            );

            if (messagesWithMentions.length > 0) {
              // Find previous non-comment block
              let prevBlock = null;
              for (let i = index - 1; i >= 0; i--) {
                if (blocks[i].__component !== 'report-components.comment-block') {
                  prevBlock = blocks[i];
                  break;
                }
              }

              // Get context label
              let contextLabel = 'Общий';
              if (prevBlock) {
                contextLabel = prevBlock.title ||
                               prevBlock.section_title ||
                               getComponentLabel(prevBlock.__component);
              }

              result.push({
                index,
                contextLabel,
                messages: messagesWithMentions,
              });
            }
          }
        });

        setCommentsWithContext(result);
      }
    } catch (error) {
      console.error('[CommentsPanel] Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId, get]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getUserTypeColor = (type) => {
    const colors = {
      admin: 'secondary600',
      user: 'primary600',
      head_pm: 'success600',
    };
    return colors[type] || 'neutral600';
  };

  // Highlight @mentions
  const renderContent = (content) => {
    const parts = content.split(/(@[а-яА-ЯёЁa-zA-Z0-9_\s]+?)(?=\s@|\s|$|[.,!?;:])/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <Typography
            key={index}
            variant="pi"
            textColor="primary600"
            fontWeight="semiBold"
            tag="span"
          >
            {part}
          </Typography>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Total count
  const totalMentions = commentsWithContext.reduce((sum, block) => sum + block.messages.length, 0);

  if (!documentId) {
    return (
      <Box padding={2}>
        <Typography variant="pi" textColor="neutral600" style={{ fontSize: '11px' }}>
          Сохраните документ для просмотра комментариев
        </Typography>
      </Box>
    );
  }

  return (
    <Box padding={2}>
      {/* Header */}
      <Flex justifyContent="space-between" alignItems="center" marginBottom={2}>
        <Flex alignItems="center" gap={1}>
          <Typography variant="pi" fontWeight="bold" style={{ fontSize: '12px' }}>
            Упоминания
          </Typography>
          {totalMentions > 0 && (
            <Badge backgroundColor="warning100" textColor="warning700" size="S" style={{ fontSize: '9px' }}>
              {totalMentions}
            </Badge>
          )}
        </Flex>
      </Flex>

      {/* Comments List */}
      {loading ? (
        <Typography variant="pi" textColor="neutral500" style={{ fontSize: '11px' }}>
          Загрузка...
        </Typography>
      ) : commentsWithContext.length === 0 ? (
        <Typography variant="pi" textColor="neutral500" style={{ fontSize: '11px' }}>
          Нет упоминаний
        </Typography>
      ) : (
        <Flex direction="column" gap={2}>
          {commentsWithContext.map((block) => (
            <Box key={block.index}>
              <Badge backgroundColor="neutral100" textColor="neutral700" size="S" style={{ marginBottom: '4px', fontSize: '9px' }}>
                {block.contextLabel}
              </Badge>
              <Flex direction="column" gap={1}>
                {block.messages.map((msg, msgIndex) => (
                  <Box
                    key={msg.id || msgIndex}
                    padding={2}
                    background="neutral0"
                    hasRadius
                    style={{
                      border: '1px solid #eaeaef',
                      borderLeft: '2px solid #f59e0b',
                    }}
                  >
                    {/* Header */}
                    <Flex justifyContent="space-between" alignItems="center" marginBottom={1}>
                      <Typography variant="pi" fontWeight="semiBold" style={{ fontSize: '11px' }}>
                        {msg.author_name}
                      </Typography>
                      <Typography variant="pi" textColor="neutral500" style={{ fontSize: '10px' }}>
                        {formatDate(msg.created_at)}
                      </Typography>
                    </Flex>

                    {/* Content */}
                    <Typography variant="pi" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '11px' }}>
                      {renderContent(msg.content)}
                    </Typography>
                  </Box>
                ))}
              </Flex>
            </Box>
          ))}
        </Flex>
      )}
    </Box>
  );
};

export default CommentsPanel;
