import React, { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Typography, Button, Loader, SingleSelect, SingleSelectOption } from '@strapi/design-system';
import { ArrowLeft } from '@strapi/icons';
import { useCurrentUser } from '../hooks/useCurrentUser';

const HistoryPanel = ({ documentId }) => {
  const { user: currentUser } = useCurrentUser();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [rolling, setRolling] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!documentId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      });

      if (selectedUserId) {
        params.set('userId', selectedUserId);
      }

      const response = await fetch(`/api/collaborative/history/${documentId}?${params}`);
      const data = await response.json();

      if (data.success) {
        setHistory(data.operations || []);
        setUsers(data.users || []);
        setPagination(prev => ({
          ...prev,
          total: data.pagination?.total || 0,
          pageCount: data.pagination?.pageCount || 1,
        }));
      }
    } catch (error) {
      console.error('[History] Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId, pagination.page, pagination.pageSize, selectedUserId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRollback = async (operationId) => {
    if (!currentUser || rolling) return;

    const confirmed = window.confirm('Откатить это изменение? Текущее значение будет заменено на предыдущее.');
    if (!confirmed) return;

    setRolling(operationId);
    try {
      const response = await fetch('/api/collaborative/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId,
          userId: currentUser.id,
          userName: currentUser.firstname || currentUser.username || 'User',
        }),
      });

      const data = await response.json();
      if (data.success) {
        fetchHistory();
        window.location.reload();
      } else {
        alert('Ошибка при откате изменения');
      }
    } catch (error) {
      console.error('[History] Rollback failed:', error);
      alert('Ошибка при откате изменения');
    } finally {
      setRolling(null);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFieldPath = (path) => {
    if (!path) return 'Неизвестное поле';
    const parts = path.split('.');
    const fieldNames = {
      title: 'Заголовок',
      dateFrom: 'Дата начала',
      dateTo: 'Дата окончания',
      content_blocks: 'Блоки контента',
      content: 'Содержимое',
      description: 'Описание',
    };

    return parts.map((part, index) => {
      if (!isNaN(part)) {
        return `Блок ${parseInt(part) + 1}`;
      }
      return fieldNames[part] || part;
    }).join(' > ');
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') {
      return value.length > 50 ? value.substring(0, 50) + '...' : value;
    }
    const str = JSON.stringify(value);
    return str.length > 50 ? str.substring(0, 50) + '...' : str;
  };

  if (!documentId) {
    return (
      <Box padding={4}>
        <Typography variant="pi" textColor="neutral600">
          Сохраните документ для просмотра истории
        </Typography>
      </Box>
    );
  }

  return (
    <Box padding={2}>
      {/* Header */}
      <Flex justifyContent="space-between" alignItems="center" marginBottom={2}>
        <Typography variant="pi" fontWeight="bold" style={{ fontSize: '12px' }}>
          История
        </Typography>
        <Button variant="ghost" size="S" onClick={fetchHistory} style={{ padding: '4px 8px', minWidth: 'auto' }}>
          ↻
        </Button>
      </Flex>

      {/* Filter by user */}
      {users.length > 0 && (
        <Box marginBottom={2}>
          <SingleSelect
            placeholder="Все"
            value={selectedUserId}
            onChange={(value) => {
              setSelectedUserId(value);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            onClear={() => {
              setSelectedUserId('');
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            size="S"
          >
            {users.map(user => (
              <SingleSelectOption key={user.id} value={user.id.toString()}>
                {user.name}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
      )}

      {/* History List */}
      {loading ? (
        <Flex justifyContent="center" padding={2}>
          <Loader small />
        </Flex>
      ) : history.length === 0 ? (
        <Typography variant="pi" textColor="neutral500" style={{ fontSize: '11px' }}>
          Нет изменений
        </Typography>
      ) : (
        <Flex direction="column" gap={1}>
          {history.map((operation) => (
            <Box
              key={operation.id}
              padding={2}
              background="neutral0"
              hasRadius
              style={{ border: '1px solid #dcdce4' }}
            >
              <Flex direction="column" gap={1}>
                {/* User and time */}
                <Flex justifyContent="space-between" alignItems="center">
                  <Typography variant="pi" fontWeight="semiBold" style={{ fontSize: '11px' }}>
                    {operation.user_name}
                  </Typography>
                  <Typography variant="pi" textColor="neutral500" style={{ fontSize: '10px' }}>
                    {formatDate(operation.timestamp)}
                  </Typography>
                </Flex>

                {/* Field */}
                <Typography variant="pi" textColor="neutral600" style={{ fontSize: '10px' }}>
                  {formatFieldPath(operation.field_path)}
                </Typography>

                {/* Old → New value */}
                <Flex gap={1} style={{ fontSize: '10px' }}>
                  <Typography
                    variant="pi"
                    textColor="danger600"
                    style={{
                      textDecoration: 'line-through',
                      wordBreak: 'break-word',
                      fontSize: '10px',
                      flex: 1,
                    }}
                  >
                    {formatValue(operation.old_value)}
                  </Typography>
                  <Typography variant="pi" textColor="neutral400" style={{ fontSize: '10px' }}>→</Typography>
                  <Typography
                    variant="pi"
                    textColor="success600"
                    style={{ wordBreak: 'break-word', fontSize: '10px', flex: 1 }}
                  >
                    {formatValue(operation.new_value)}
                  </Typography>
                </Flex>

                {/* Rollback button */}
                <Button
                  variant="ghost"
                  size="S"
                  onClick={() => handleRollback(operation.id)}
                  disabled={rolling === operation.id}
                  style={{ padding: '2px 6px', fontSize: '10px', alignSelf: 'flex-end' }}
                >
                  {rolling === operation.id ? '...' : '↩ Откат'}
                </Button>
              </Flex>
            </Box>
          ))}

          {/* Pagination */}
          {pagination.pageCount > 1 && (
            <Flex justifyContent="center" alignItems="center" gap={1} marginTop={2}>
              <Button
                variant="tertiary"
                size="S"
                disabled={pagination.page === 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                style={{ padding: '2px 6px', minWidth: 'auto' }}
              >
                ←
              </Button>
              <Typography variant="pi" style={{ fontSize: '10px' }}>
                {pagination.page}/{pagination.pageCount}
              </Typography>
              <Button
                variant="tertiary"
                size="S"
                disabled={pagination.page === pagination.pageCount}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                style={{ padding: '2px 6px', minWidth: 'auto' }}
              >
                →
              </Button>
            </Flex>
          )}
        </Flex>
      )}
    </Box>
  );
};

export default HistoryPanel;
