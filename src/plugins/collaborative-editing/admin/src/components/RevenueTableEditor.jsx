import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Flex, Typography, Button, Loader } from '@strapi/design-system';
import { Download } from '@strapi/icons';
import { useYjsJson } from '../contexts/YjsContext';

const RevenueTableEditor = ({ name, value, onChange, disabled }) => {
  const initialData = {
    current: { period: '', platforms: [], total: null },
    previous: { period: '', platforms: [], total: null },
  };

  const [localData, setLocalData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isInitializedRef = useRef(false);

  // Parse initial value
  const parsedInitial = React.useMemo(() => {
    if (value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse revenue data:', e);
      }
    }
    return initialData;
  }, []);

  // Yjs sync for real-time collaboration
  const handleRemoteUpdate = useCallback((newData) => {
    setLocalData(newData);
    // Also update Strapi form
    onChange({
      target: {
        name,
        value: newData,
        type: 'json',
      },
    });
  }, [name, onChange]);

  const { value: yjsData, updateValue: yjsUpdateValue, synced } = useYjsJson(
    `revenue-table:${name}`,
    parsedInitial,
    handleRemoteUpdate
  );

  // Initialize local data from Yjs or prop value
  useEffect(() => {
    if (!isInitializedRef.current) {
      if (yjsData && Object.keys(yjsData).length > 0) {
        setLocalData(yjsData);
      } else if (parsedInitial) {
        setLocalData(parsedInitial);
      }
      isInitializedRef.current = true;
    }
  }, [yjsData, parsedInitial]);

  // Use Yjs data if available, otherwise local
  const data = synced && yjsData ? yjsData : localData;

  // Update parent form and Yjs
  const updateValue = (newData) => {
    setLocalData(newData);
    // Update Yjs (will sync to other users)
    if (synced) {
      yjsUpdateValue(newData);
    }
    // Update Strapi form
    onChange({
      target: {
        name,
        value: newData,
        type: 'json',
      },
    });
  };

  // Get documentId from URL
  const getDocumentId = () => {
    // URL format: /admin/content-manager/collection-types/api::report.report/{documentId}
    const match = window.location.pathname.match(/\/api::report\.report\/([^/]+)/);
    if (match) {
      return match[1];
    }
    return null;
  };

  // Fetch data from analytics API using report's documentId
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const documentId = getDocumentId();
      console.log('[RevenueTableEditor] Document ID:', documentId);

      if (!documentId) {
        setError('Сначала сохраните отчёт');
        setLoading(false);
        return;
      }

      // Fetch from Strapi API using documentId (server will get model from report)
      const response = await fetch(`/api/revenue/report/${documentId}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[RevenueTableEditor] API result:', result);

      if (result.success) {
        console.log('[RevenueTableEditor] Updating with:', result.current, result.previous);
        updateValue({
          current: result.current,
          previous: result.previous,
        });
      } else {
        setError(result.error || 'Не удалось загрузить данные');
      }
    } catch (err) {
      console.error('Failed to fetch revenue data:', err);
      setError('Ошибка загрузки данных. Проверьте подключение к API.');
    } finally {
      setLoading(false);
    }
  };

  // Format currency
  const formatCurrency = (num) => {
    if (!num && num !== 0) return '$0';
    return '$' + new Intl.NumberFormat('en-US').format(num);
  };

  // Parse currency input (remove $ and commas)
  const parseCurrencyInput = (value) => {
    const cleaned = value.replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // Handle cell value change
  const handleCellChange = (tableKey, platformIndex, field, value) => {
    const numValue = parseCurrencyInput(value);

    const newData = { ...data };
    const tableData = { ...newData[tableKey] };
    const platforms = [...tableData.platforms];
    const platform = { ...platforms[platformIndex] };

    // Update the field
    platform[field] = numValue;

    // Recalculate platform total
    platform.total = (platform.subs || 0) + (platform.tips || 0) + (platform.messages || 0);

    platforms[platformIndex] = platform;
    tableData.platforms = platforms;

    // Recalculate grand total
    if (tableData.total) {
      tableData.total = {
        ...tableData.total,
        subs: platforms.reduce((sum, p) => sum + (p.subs || 0), 0),
        tips: platforms.reduce((sum, p) => sum + (p.tips || 0), 0),
        messages: platforms.reduce((sum, p) => sum + (p.messages || 0), 0),
        total: platforms.reduce((sum, p) => sum + (p.total || 0), 0),
      };
    }

    newData[tableKey] = tableData;
    updateValue(newData);
  };

  // Editable input style
  const inputStyle = {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '4px',
    color: '#a5a5ba',
    textAlign: 'right',
    width: '100%',
    padding: '4px 8px',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  const cellStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid #32324d',
    verticalAlign: 'middle',
    fontSize: '13px',
    height: '40px',
  };

  const headerStyle = {
    ...cellStyle,
    backgroundColor: '#1a1a2e',
    fontWeight: 600,
    fontSize: '11px',
    color: '#a5a5ba',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const totalRowStyle = {
    ...cellStyle,
    backgroundColor: '#2a2a4a',
    fontWeight: 700,
    color: '#ffffff',
  };

  // Render editable cell
  const renderEditableCell = (tableKey, platformIndex, field, value) => (
    <input
      type="text"
      value={formatCurrency(value)}
      onChange={(e) => handleCellChange(tableKey, platformIndex, field, e.target.value)}
      disabled={disabled}
      style={{
        ...inputStyle,
        cursor: disabled ? 'not-allowed' : 'text',
      }}
      onFocus={(e) => {
        e.target.style.borderColor = '#4945ff';
        e.target.select();
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'transparent';
      }}
    />
  );

  const renderTable = (tableData, title, tableKey) => {
    if (!tableData || !tableData.platforms || tableData.platforms.length === 0) {
      return (
        <Box style={{ width: '100%' }}>
          <Typography variant="sigma" style={{ color: '#a5a5ba', marginBottom: '8px', display: 'block' }}>
            {title}
          </Typography>
          <Box
            style={{
              border: '1px dashed #32324d',
              borderRadius: '4px',
              padding: '24px',
              textAlign: 'center',
              backgroundColor: '#212134',
            }}
          >
            <Typography variant="omega" style={{ color: '#666687' }}>
              Нет данных
            </Typography>
          </Box>
        </Box>
      );
    }

    return (
      <Box style={{ width: '100%' }}>
        <Typography variant="sigma" style={{ color: '#a5a5ba', marginBottom: '8px', display: 'block' }}>
          {title} {tableData.period && `(${tableData.period})`}
        </Typography>
        <Box
          style={{
            border: '1px solid #32324d',
            borderRadius: '4px',
            overflow: 'auto',
            backgroundColor: '#212134',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
            <thead>
              <tr>
                <th style={{ ...headerStyle, textAlign: 'left' }}>Платформа</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Subs</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Tips</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Messages</th>
                <th style={{ ...headerStyle, textAlign: 'right' }}>Итого</th>
              </tr>
            </thead>
            <tbody>
              {tableData.platforms.map((platform, index) => (
                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#212134' : '#1a1a2e' }}>
                  <td style={{ ...cellStyle, color: '#ffffff', fontWeight: 500 }}>
                    {platform.platform}
                  </td>
                  <td style={{ ...cellStyle, padding: '4px 8px' }}>
                    {renderEditableCell(tableKey, index, 'subs', platform.subs)}
                  </td>
                  <td style={{ ...cellStyle, padding: '4px 8px' }}>
                    {renderEditableCell(tableKey, index, 'tips', platform.tips)}
                  </td>
                  <td style={{ ...cellStyle, padding: '4px 8px' }}>
                    {renderEditableCell(tableKey, index, 'messages', platform.messages)}
                  </td>
                  <td style={{ ...cellStyle, color: '#ffffff', textAlign: 'right', fontWeight: 600 }}>
                    {formatCurrency(platform.total)}
                  </td>
                </tr>
              ))}
              {tableData.total && (
                <tr>
                  <td style={{ ...totalRowStyle, textAlign: 'left' }}>
                    {tableData.total.platform}
                  </td>
                  <td style={{ ...totalRowStyle, textAlign: 'right' }}>
                    {formatCurrency(tableData.total.subs)}
                  </td>
                  <td style={{ ...totalRowStyle, textAlign: 'right' }}>
                    {formatCurrency(tableData.total.tips)}
                  </td>
                  <td style={{ ...totalRowStyle, textAlign: 'right' }}>
                    {formatCurrency(tableData.total.messages)}
                  </td>
                  <td style={{ ...totalRowStyle, textAlign: 'right' }}>
                    {formatCurrency(tableData.total.total)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Box>
      </Box>
    );
  };

  const hasData = data.current?.platforms?.length > 0 || data.previous?.platforms?.length > 0;

  return (
    <Box>
      {/* Header with load button */}
      <Flex
        style={{
          backgroundColor: '#1a1a2e',
          padding: '12px 16px',
          borderRadius: '4px 4px 0 0',
          border: '1px solid #32324d',
          borderBottom: hasData ? '1px solid #32324d' : 'none',
        }}
        alignItems="center"
        justifyContent="space-between"
      >
        <Typography
          variant="beta"
          fontWeight="bold"
          style={{ color: '#ffffff', fontSize: '16px' }}
        >
          Сравнение оборотов
        </Typography>
        <Button
          startIcon={loading ? <Loader small /> : <Download />}
          variant="secondary"
          size="S"
          onClick={fetchData}
          disabled={disabled || loading}
        >
          {loading ? 'Загрузка...' : 'Загрузить данные'}
        </Button>
      </Flex>

      {/* Error message */}
      {error && (
        <Box
          style={{
            backgroundColor: 'rgba(208, 43, 32, 0.1)',
            border: '1px solid #d02b20',
            borderTop: 'none',
            padding: '12px 16px',
          }}
        >
          <Typography variant="omega" style={{ color: '#ee5e52' }}>
            {error}
          </Typography>
        </Box>
      )}

      {/* Tables */}
      {hasData ? (
        <Flex
          direction="column"
          gap={4}
          style={{
            padding: '16px',
            backgroundColor: '#212134',
            border: '1px solid #32324d',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
          }}
        >
          {renderTable(data.current, 'Текущий месяц', 'current')}
          {renderTable(data.previous, 'Прошлый месяц', 'previous')}
        </Flex>
      ) : (
        <Box
          style={{
            padding: '32px',
            backgroundColor: '#212134',
            border: '1px solid #32324d',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            textAlign: 'center',
          }}
        >
          <Typography variant="omega" style={{ color: '#666687' }}>
            Нажмите "Загрузить данные" для получения данных из API
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default RevenueTableEditor;
