import React, { useState, useEffect } from 'react';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { Box, Typography, Button, Flex, SingleSelect, SingleSelectOption, Loader } from '@strapi/design-system';

const CopyFromPreviousPanel = ({ documentId }) => {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingSources, setLoadingSources] = useState(true);
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();

  // Load available source reports
  useEffect(() => {
    const fetchSources = async () => {
      if (!documentId) {
        setLoadingSources(false);
        return;
      }

      try {
        const response = await get(`/api/reports/${documentId}/available-sources`);
        setSources(response.data?.sources || []);
      } catch (error) {
        console.error('Failed to fetch sources:', error);
      } finally {
        setLoadingSources(false);
      }
    };

    fetchSources();
  }, [documentId, get]);

  const handleCopy = async () => {
    if (!documentId) return;

    setLoading(true);
    try {
      const response = await post(`/api/reports/${documentId}/copy-from-previous`, {
        sourceReportId: selectedSource || undefined,
      });

      if (response.data?.success) {
        toggleNotification({
          type: 'success',
          message: response.data.message || 'Данные успешно скопированы',
        });
        // Reload the page to show updated data
        window.location.reload();
      } else {
        toggleNotification({
          type: 'warning',
          message: response.data?.message || 'Не удалось скопировать данные',
        });
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message ||
                          error.response?.data?.message ||
                          'Ошибка при копировании данных';
      toggleNotification({
        type: 'danger',
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAutoDetect = async () => {
    setSelectedSource(null);
    await handleCopy();
  };

  if (!documentId) {
    return (
      <Box padding={4}>
        <Typography variant="pi" textColor="neutral600">
          Сохраните отчёт для активации копирования
        </Typography>
      </Box>
    );
  }

  if (loadingSources) {
    return (
      <Box padding={4}>
        <Flex justifyContent="center">
          <Loader small />
        </Flex>
      </Box>
    );
  }

  return (
    <Box padding={2} style={{ overflow: 'hidden' }}>
      <Flex direction="column" gap={2}>
        {sources.length > 0 ? (
          <>
            <Flex alignItems="center" gap={1} style={{ flexWrap: 'wrap' }}>
              <Box style={{ flex: 1, minWidth: '80px' }}>
                <SingleSelect
                  placeholder="Авто"
                  value={selectedSource}
                  onChange={setSelectedSource}
                  onClear={() => setSelectedSource(null)}
                  size="S"
                >
                  {sources.map((source) => (
                    <SingleSelectOption key={source.id} value={source.id}>
                      {source.monthName}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Box>
              <Typography variant="pi" textColor="neutral500" style={{ fontSize: '11px' }}>
                → Прошлый
              </Typography>
            </Flex>

            <Button
              variant="secondary"
              onClick={handleCopy}
              loading={loading}
              disabled={loading}
              fullWidth
              size="S"
              style={{ minWidth: 0 }}
            >
              Копировать
            </Button>
          </>
        ) : (
          <Typography variant="pi" textColor="neutral500" style={{ fontSize: '12px' }}>
            Нет отчётов для копирования
          </Typography>
        )}
      </Flex>
    </Box>
  );
};

export default CopyFromPreviousPanel;
