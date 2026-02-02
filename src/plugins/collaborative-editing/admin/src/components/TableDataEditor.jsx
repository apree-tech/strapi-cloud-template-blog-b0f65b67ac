import React, { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Typography, Button, IconButton } from '@strapi/design-system';
import { Plus, Trash } from '@strapi/icons';

const TableDataEditor = ({ name, value, onChange, disabled }) => {
  const [data, setData] = useState({ headers: [], rows: [], totals: [], autoTotals: true });

  // Parse number from string (handles spaces, commas)
  const parseNumber = (str) => {
    if (!str && str !== 0) return null;
    const cleaned = String(str).replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  // Format number with spaces
  const formatNumber = (num) => {
    if (num === null || num === undefined) return '';
    return new Intl.NumberFormat('ru-RU').format(num);
  };

  // Calculate column totals from rows
  const calculateTotals = useCallback((rows, headers) => {
    if (!rows || rows.length === 0 || !headers || headers.length === 0) return [];

    return headers.map((_, colIndex) => {
      // First column is usually labels, skip summing
      if (colIndex === 0) return 'Итого';

      let sum = 0;
      let hasNumbers = false;

      rows.forEach(row => {
        const cellValue = row[colIndex];
        const num = parseNumber(cellValue);
        if (num !== null) {
          sum += num;
          hasNumbers = true;
        }
      });

      return hasNumbers ? formatNumber(sum) : '';
    });
  }, []);

  // Parse value on mount
  useEffect(() => {
    if (value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (parsed && typeof parsed === 'object') {
          const autoTotals = parsed.autoTotals !== false; // default true
          setData({
            headers: Array.isArray(parsed.headers) ? parsed.headers : [],
            rows: Array.isArray(parsed.rows) ? parsed.rows : [],
            totals: Array.isArray(parsed.totals) ? parsed.totals : [],
            autoTotals: autoTotals,
          });
        }
      } catch (e) {
        setData({ headers: [], rows: [], totals: [], autoTotals: true });
      }
    }
  }, []);

  // Update parent form
  const updateValue = (newData) => {
    // Auto-calculate totals if enabled and totals row exists
    let finalData = newData;
    if (newData.autoTotals && newData.totals.length > 0) {
      finalData = {
        ...newData,
        totals: calculateTotals(newData.rows, newData.headers),
      };
    }

    setData(finalData);
    onChange({
      target: {
        name,
        value: finalData,
        type: 'json',
      },
    });
  };

  // Add column
  const addColumn = () => {
    const newHeaders = [...data.headers, `Колонка ${data.headers.length + 1}`];
    const newRows = data.rows.map(row => [...row, '']);
    const newTotals = data.totals.length > 0 ? [...data.totals, ''] : [];
    updateValue({ ...data, headers: newHeaders, rows: newRows, totals: newTotals });
  };

  // Remove column
  const removeColumn = (colIndex) => {
    if (data.headers.length <= 1) return;
    const newHeaders = data.headers.filter((_, i) => i !== colIndex);
    const newRows = data.rows.map(row => row.filter((_, i) => i !== colIndex));
    const newTotals = data.totals.length > 0 ? data.totals.filter((_, i) => i !== colIndex) : [];
    updateValue({ ...data, headers: newHeaders, rows: newRows, totals: newTotals });
  };

  // Add row
  const addRow = () => {
    const colCount = data.headers.length || 1;
    const newRow = Array(colCount).fill('');
    updateValue({ ...data, rows: [...data.rows, newRow] });
  };

  // Remove row
  const removeRow = (rowIndex) => {
    const newRows = data.rows.filter((_, i) => i !== rowIndex);
    updateValue({ ...data, rows: newRows });
  };

  // Update header
  const updateHeader = (colIndex, value) => {
    const newHeaders = [...data.headers];
    newHeaders[colIndex] = value;
    updateValue({ ...data, headers: newHeaders });
  };

  // Update cell
  const updateCell = (rowIndex, colIndex, value) => {
    const newRows = [...data.rows];
    newRows[rowIndex] = [...newRows[rowIndex]];
    newRows[rowIndex][colIndex] = value;
    updateValue({ ...data, rows: newRows });
  };

  // Update total
  const updateTotal = (colIndex, value) => {
    const newTotals = [...data.totals];
    newTotals[colIndex] = value;
    updateValue({ ...data, totals: newTotals });
  };

  // Toggle totals row
  const toggleTotals = () => {
    if (data.totals.length > 0) {
      updateValue({ ...data, totals: [], autoTotals: true });
    } else {
      // Initialize with calculated totals
      const calculatedTotals = calculateTotals(data.rows, data.headers);
      updateValue({ ...data, totals: calculatedTotals, autoTotals: true });
    }
  };

  // Add default structure
  const addDefaults = () => {
    updateValue({
      headers: ['Название', 'Значение'],
      rows: [['', '']],
      totals: [],
    });
  };

  const cellStyle = {
    padding: '8px 10px',
    borderBottom: '1px solid #32324d',
    borderRight: '1px solid #32324d',
    verticalAlign: 'middle',
  };

  const headerStyle = {
    ...cellStyle,
    backgroundColor: '#212134',
    fontWeight: 600,
    fontSize: '12px',
    color: '#a5a5ba',
  };

  const inputStyle = {
    border: 'none',
    background: 'transparent',
    width: '100%',
    padding: '6px 8px',
    fontSize: '14px',
    color: '#ffffff',
    outline: 'none',
  };

  const totalsInputStyle = {
    ...inputStyle,
    fontWeight: 600,
    backgroundColor: 'rgba(92, 177, 118, 0.1)',
  };

  const hasData = data.headers.length > 0;

  return (
    <Box>
      <Box
        style={{
          border: '1px solid #32324d',
          borderRadius: '4px',
          overflow: 'hidden',
          backgroundColor: '#212134',
        }}
      >
        {/* Header */}
        <Flex
          style={{
            backgroundColor: '#1a1a2e',
            padding: '12px 16px',
            borderBottom: '1px solid #32324d',
          }}
          alignItems="center"
          justifyContent="space-between"
        >
          <Typography
            variant="beta"
            fontWeight="bold"
            style={{ color: '#ffffff', fontSize: '16px' }}
          >
            Таблица данных
          </Typography>
          {hasData && (
            <Flex gap={2}>
              <Button
                variant="secondary"
                size="S"
                onClick={toggleTotals}
                disabled={disabled}
              >
                {data.totals.length > 0 ? 'Убрать итого' : 'Добавить итого'}
              </Button>
            </Flex>
          )}
        </Flex>

        {hasData ? (
          <Box style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
              {/* Headers row */}
              <thead>
                <tr>
                  {data.headers.map((header, colIndex) => (
                    <th key={colIndex} style={{ ...headerStyle, minWidth: '120px' }}>
                      <Flex alignItems="center" gap={1}>
                        <input
                          type="text"
                          value={header}
                          onChange={(e) => updateHeader(colIndex, e.target.value)}
                          style={{ ...inputStyle, fontWeight: 600, color: '#a5a5ba', textTransform: 'uppercase', fontSize: '12px' }}
                          placeholder="Заголовок"
                          disabled={disabled}
                        />
                        {data.headers.length > 1 && (
                          <IconButton
                            onClick={() => removeColumn(colIndex)}
                            label="Удалить колонку"
                            variant="ghost"
                            disabled={disabled}
                            style={{ color: '#ee5e52', padding: '2px' }}
                          >
                            <Trash width={12} height={12} />
                          </IconButton>
                        )}
                      </Flex>
                    </th>
                  ))}
                  <th style={{ ...headerStyle, width: '50px', borderRight: 'none' }}>
                    <IconButton
                      onClick={addColumn}
                      label="Добавить колонку"
                      variant="ghost"
                      disabled={disabled}
                      style={{ color: '#5cb176' }}
                    >
                      <Plus width={16} height={16} />
                    </IconButton>
                  </th>
                </tr>
              </thead>

              {/* Data rows */}
              <tbody>
                {data.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} style={{ backgroundColor: rowIndex % 2 === 0 ? '#212134' : '#1a1a2e' }}>
                    {row.map((cell, colIndex) => (
                      <td key={colIndex} style={cellStyle}>
                        <input
                          type="text"
                          value={cell || ''}
                          onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                          style={inputStyle}
                          placeholder="—"
                          disabled={disabled}
                        />
                      </td>
                    ))}
                    <td style={{ ...cellStyle, borderRight: 'none', width: '50px' }}>
                      <IconButton
                        onClick={() => removeRow(rowIndex)}
                        label="Удалить строку"
                        variant="ghost"
                        disabled={disabled}
                        style={{ color: '#a5a5ba' }}
                      >
                        <Trash width={14} height={14} />
                      </IconButton>
                    </td>
                  </tr>
                ))}

                {/* Totals row - auto-calculated */}
                {data.totals.length > 0 && (
                  <tr style={{ backgroundColor: '#1a2e1a' }}>
                    {data.totals.map((total, colIndex) => (
                      <td key={colIndex} style={{ ...cellStyle, backgroundColor: 'rgba(92, 177, 118, 0.1)' }}>
                        <div style={{ ...totalsInputStyle, padding: '6px 8px', minHeight: '32px' }}>
                          {total || (colIndex === 0 ? 'Итого' : '—')}
                        </div>
                      </td>
                    ))}
                    <td style={{ ...cellStyle, borderRight: 'none', backgroundColor: 'rgba(92, 177, 118, 0.1)' }}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </Box>
        ) : (
          <Box padding={4} style={{ textAlign: 'center' }}>
            <Typography variant="omega" style={{ color: '#a5a5ba' }}>
              Нет данных. Нажмите "Создать таблицу" для начала.
            </Typography>
          </Box>
        )}
      </Box>

      <Flex justifyContent="flex-start" alignItems="center" marginTop={3} gap={2}>
        {!hasData && (
          <Button variant="secondary" size="S" onClick={addDefaults} disabled={disabled}>
            Создать таблицу
          </Button>
        )}
        {hasData && (
          <Button startIcon={<Plus />} variant="secondary" size="S" onClick={addRow} disabled={disabled}>
            Добавить строку
          </Button>
        )}
      </Flex>
    </Box>
  );
};

export default TableDataEditor;
