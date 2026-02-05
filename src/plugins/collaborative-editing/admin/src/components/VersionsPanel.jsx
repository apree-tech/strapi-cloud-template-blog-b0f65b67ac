import React, { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Typography, Button, Loader, Badge } from '@strapi/design-system';
import { ArrowLeft, Eye } from '@strapi/icons';
import { useCurrentUser } from '../hooks/useCurrentUser';
import DiffViewer from './DiffViewer';

const VersionsPanel = ({ documentId }) => {
  const { user: currentUser } = useCurrentUser();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [total, setTotal] = useState(0);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);

  // Diff state (inline, not modal)
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [diff, setDiff] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const [restoring, setRestoring] = useState(null);

  const fetchVersions = useCallback(async () => {
    if (!documentId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showAll) {
        params.set('all', 'true');
      }
      if (dateFrom) {
        params.set('dateFrom', dateFrom.toISOString());
      }
      if (dateTo) {
        params.set('dateTo', dateTo.toISOString());
      }

      const response = await fetch(`/api/report-versions/${documentId}?${params}`);
      const data = await response.json();

      if (data.success) {
        setVersions(data.versions || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('[Versions] Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId, showAll, dateFrom, dateTo]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleViewDiff = async (version) => {
    if (selectedVersion?.id === version.id) {
      // Toggle off if clicking same version
      setSelectedVersion(null);
      setDiff(null);
      return;
    }

    setSelectedVersion(version);
    setDiffLoading(true);
    setDiff(null);

    try {
      const response = await fetch(
        `/api/report-versions/${documentId}/diff/${version.id}`
      );
      const data = await response.json();

      if (data.success) {
        setDiff(data.diff);
      }
    } catch (error) {
      console.error('[Versions] Failed to fetch diff:', error);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRestore = async (version) => {
    if (!currentUser || restoring) return;

    const confirmed = window.confirm(
      `Восстановить версию ${version.version_number}? Текущее состояние будет сохранено как новая версия.`
    );
    if (!confirmed) return;

    setRestoring(version.id);
    try {
      const response = await fetch('/api/report-versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: version.id,
          userId: currentUser.id,
          userName: currentUser.firstname || currentUser.username || 'User',
        }),
      });

      const data = await response.json();
      if (data.success) {
        fetchVersions();
        window.location.reload();
      } else {
        alert('Ошибка при восстановлении версии');
      }
    } catch (error) {
      console.error('[Versions] Restore failed:', error);
      alert('Ошибка при восстановлении версии');
    } finally {
      setRestoring(null);
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

  if (!documentId) {
    return (
      <Box padding={4}>
        <Typography variant="pi" textColor="neutral600">
          Сохраните документ для просмотра версий
        </Typography>
      </Box>
    );
  }

  return (
    <Box padding={2}>
      {/* Header */}
      <Flex justifyContent="space-between" alignItems="center" marginBottom={2}>
        <Typography variant="pi" fontWeight="bold" style={{ fontSize: '12px' }}>
          Версии
        </Typography>
        <Button variant="ghost" size="S" onClick={fetchVersions} style={{ padding: '4px 8px', minWidth: 'auto' }}>
          ↻
        </Button>
      </Flex>

      {/* Show all toggle */}
      {total > 10 && (
        <Box marginBottom={2}>
          <Button
            variant="tertiary"
            size="S"
            onClick={() => setShowAll(!showAll)}
            style={{ padding: '4px 8px', fontSize: '10px' }}
          >
            {showAll ? `10 последних` : `Все (${total})`}
          </Button>
        </Box>
      )}

      {/* Date filter (only when showing all) */}
      {showAll && (
        <Flex gap={1} marginBottom={2}>
          <Box style={{ flex: 1 }}>
            <input
              type="date"
              value={dateFrom ? dateFrom.toISOString().split('T')[0] : ''}
              onChange={(e) => setDateFrom(e.target.value ? new Date(e.target.value) : null)}
              placeholder="С"
              style={{
                width: '100%',
                padding: '4px',
                border: '1px solid #dcdce4',
                borderRadius: '4px',
                fontSize: '10px',
              }}
            />
          </Box>
          <Box style={{ flex: 1 }}>
            <input
              type="date"
              value={dateTo ? dateTo.toISOString().split('T')[0] : ''}
              onChange={(e) => setDateTo(e.target.value ? new Date(e.target.value) : null)}
              placeholder="По"
              style={{
                width: '100%',
                padding: '4px',
                border: '1px solid #dcdce4',
                borderRadius: '4px',
                fontSize: '10px',
              }}
            />
          </Box>
        </Flex>
      )}

      {/* Versions List */}
      {loading ? (
        <Flex justifyContent="center" padding={2}>
          <Loader small />
        </Flex>
      ) : versions.length === 0 ? (
        <Typography variant="pi" textColor="neutral500" style={{ fontSize: '11px' }}>
          Нет версий
        </Typography>
      ) : (
        <Flex direction="column" gap={1}>
          {versions.map((version, index) => (
            <React.Fragment key={version.id}>
              <Box
                padding={2}
                background={index === 0 ? 'primary100' : 'neutral0'}
                hasRadius
                style={{
                  border: `1px solid ${index === 0 ? '#7b79ff' : '#dcdce4'}`,
                }}
              >
                <Flex direction="column" gap={1}>
                  {/* Version label */}
                  <Flex alignItems="center" gap={1} style={{ flexWrap: 'wrap' }}>
                    <Typography variant="pi" fontWeight="bold" style={{ fontSize: '11px' }}>
                      {version.version_label || `v${version.version_number}`}
                    </Typography>
                    {index === 0 && (
                      <Badge backgroundColor="primary100" textColor="primary600" size="S" style={{ fontSize: '9px' }}>
                        Текущая
                      </Badge>
                    )}
                    {version.is_auto_save && (
                      <Badge backgroundColor="neutral100" textColor="neutral600" size="S" style={{ fontSize: '9px' }}>
                        Авто
                      </Badge>
                    )}
                  </Flex>

                  {/* Date and user */}
                  <Typography variant="pi" textColor="neutral500" style={{ fontSize: '10px' }}>
                    {formatDate(version.created_at_snapshot)} — {version.user_names}
                  </Typography>

                  {/* Actions (not for current version) */}
                  {index !== 0 && (
                    <Flex gap={1} marginTop={1}>
                      <Button
                        variant={selectedVersion?.id === version.id ? 'secondary' : 'ghost'}
                        size="S"
                        onClick={() => handleViewDiff(version)}
                        style={{ padding: '2px 6px', fontSize: '10px', flex: 1 }}
                      >
                        {selectedVersion?.id === version.id ? 'Скрыть' : '👁 Сравнить'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="S"
                        onClick={() => handleRestore(version)}
                        disabled={restoring === version.id}
                        style={{ padding: '2px 6px', fontSize: '10px', flex: 1 }}
                      >
                        {restoring === version.id ? '...' : '↩ Восст.'}
                      </Button>
                    </Flex>
                  )}
                </Flex>
              </Box>

              {/* Inline Diff View */}
              {selectedVersion?.id === version.id && (
                <Box
                  padding={2}
                  background="neutral100"
                  hasRadius
                  style={{ border: '1px solid #dcdce4' }}
                >
                  <Typography variant="pi" fontWeight="bold" style={{ fontSize: '10px', marginBottom: '4px' }}>
                    Сравнение
                  </Typography>
                  {diffLoading ? (
                    <Flex justifyContent="center" padding={2}>
                      <Loader small />
                    </Flex>
                  ) : (
                    <DiffViewer diff={diff} />
                  )}
                </Box>
              )}
            </React.Fragment>
          ))}
        </Flex>
      )}
    </Box>
  );
};

export default VersionsPanel;
