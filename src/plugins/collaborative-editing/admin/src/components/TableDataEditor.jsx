import React, { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Typography, Button, IconButton } from '@strapi/design-system';
import { Plus, Trash } from '@strapi/icons';
import { useDomSync } from '../hooks/useDomSync';

const TableDataEditor = ({ name, value, onChange, disabled }) => {
  const [data, setData] = useState({ title: '', headers: [], rows: [], totals: [], autoTotals: true, changeColumn: false });

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

  // Calculate change percentage between two values
  const calculateChange = (current, prev) => {
    const cur = parseNumber(current);
    const prv = parseNumber(prev);
    if (cur === null || prv === null) return null;
    if (prv === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prv) / prv) * 1000) / 10;
  };

  // Get indicator emoji
  const getIndicator = (change) => {
    if (change > 0) return '📈';
    if (change < 0) return '📉';
    return '➡️';
  };

  // Format change value for display
  const formatChangeValue = (change) => {
    if (change === null) return '';
    const indicator = getIndicator(change);
    const sign = change > 0 ? '+' : '';
    return `${indicator} ${sign}${change.toFixed(1)}%`;
  };

  // Calculate column totals from rows
  const calculateTotals = useCallback((rows, headers, hasChangeColumn) => {
    if (!rows || rows.length === 0 || !headers || headers.length === 0) return [];

    const totals = headers.map((_, colIndex) => {
      if (colIndex === 0) return 'Итого';

      // Skip change column — calculated separately
      if (hasChangeColumn && colIndex === headers.length - 1) return '';

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

    // Calculate change for totals row
    if (hasChangeColumn && headers.length >= 3) {
      const changeIdx = headers.length - 1;
      const currentIdx = changeIdx - 1;
      const prevIdx = changeIdx - 2;
      const change = calculateChange(totals[currentIdx], totals[prevIdx]);
      totals[changeIdx] = change !== null ? formatChangeValue(change) : '';
    }

    return totals;
  }, []);

  // Calculate change column values for all rows
  const calculateChangeColumn = (rows, headers) => {
    if (!rows || headers.length < 3) return rows;
    const changeIdx = headers.length - 1;
    const currentIdx = changeIdx - 1;
    const prevIdx = changeIdx - 2;

    return rows.map(row => {
      const newRow = [...row];
      const change = calculateChange(row[currentIdx], row[prevIdx]);
      newRow[changeIdx] = change !== null ? formatChangeValue(change) : '';
      return newRow;
    });
  };

  // Parse value on mount
  useEffect(() => {
    if (value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (parsed && typeof parsed === 'object') {
          setData({
            title: parsed.title || '',
            headers: Array.isArray(parsed.headers) ? parsed.headers : [],
            rows: Array.isArray(parsed.rows) ? parsed.rows : [],
            totals: Array.isArray(parsed.totals) ? parsed.totals : [],
            autoTotals: parsed.autoTotals !== false,
            changeColumn: parsed.changeColumn || false,
          });
        }
      } catch (e) {
        // ignore
      }
    }
  }, []);

  // DOM sync for real-time collaboration
  const handleRemoteUpdate = useCallback((newData) => {
    setData(prevData => {
      const prevJson = JSON.stringify(prevData);
      const newJson = JSON.stringify(newData);
      if (prevJson === newJson) {
        return prevData;
      }
      onChange({
        target: {
          name,
          value: newData,
          type: 'json',
        },
      });
      return newData;
    });
  }, [name, onChange]);

  const { updateValue: broadcastUpdate } = useDomSync(
    `table-editor:${name}`,
    data,
    handleRemoteUpdate
  );

  // Update parent form and broadcast
  const updateValue = (newData) => {
    let finalData = { ...newData };

    // Auto-calculate change column values
    if (finalData.changeColumn && finalData.headers.length >= 3) {
      finalData.rows = calculateChangeColumn(finalData.rows, finalData.headers);
    }

    // Auto-calculate totals if enabled
    if (finalData.autoTotals && finalData.totals.length > 0) {
      finalData.totals = calculateTotals(finalData.rows, finalData.headers, finalData.changeColumn);
    }

    setData(finalData);
    broadcastUpdate(finalData);
    onChange({
      target: {
        name,
        value: finalData,
        type: 'json',
      },
    });
  };

  // Add column (before change column if it exists)
  const addColumn = () => {
    const insertAt = data.changeColumn ? data.headers.length - 1 : data.headers.length;
    const newHeaders = [...data.headers];
    newHeaders.splice(insertAt, 0, `Колонка ${data.headers.length + 1}`);
    const newRows = data.rows.map(row => {
      const newRow = [...row];
      newRow.splice(insertAt, 0, '');
      return newRow;
    });
    const newTotals = data.totals.length > 0
      ? (() => { const t = [...data.totals]; t.splice(insertAt, 0, ''); return t; })()
      : [];
    updateValue({ ...data, headers: newHeaders, rows: newRows, totals: newTotals });
  };

  // Remove column
  const removeColumn = (colIndex) => {
    if (data.headers.length <= 1) return;
    // Don't allow removing change column via this button
    if (data.changeColumn && colIndex === data.headers.length - 1) return;

    const newHeaders = data.headers.filter((_, i) => i !== colIndex);
    const newRows = data.rows.map(row => row.filter((_, i) => i !== colIndex));
    const newTotals = data.totals.length > 0 ? data.totals.filter((_, i) => i !== colIndex) : [];

    // If removing leaves < 3 columns total and change is enabled, disable it
    let changeColumn = data.changeColumn;
    if (changeColumn && newHeaders.length < 3) {
      const finalHeaders = newHeaders.slice(0, -1);
      const finalRows = newRows.map(row => row.slice(0, -1));
      const finalTotals = newTotals.length > 0 ? newTotals.slice(0, -1) : [];
      updateValue({ ...data, headers: finalHeaders, rows: finalRows, totals: finalTotals, changeColumn: false });
      return;
    }

    updateValue({ ...data, headers: newHeaders, rows: newRows, totals: newTotals, changeColumn });
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
  const updateHeader = (colIndex, val) => {
    const newHeaders = [...data.headers];
    newHeaders[colIndex] = val;
    updateValue({ ...data, headers: newHeaders });
  };

  // Update cell
  const updateCell = (rowIndex, colIndex, val) => {
    const newRows = [...data.rows];
    newRows[rowIndex] = [...newRows[rowIndex]];
    newRows[rowIndex][colIndex] = val;
    updateValue({ ...data, rows: newRows });
  };

  // Toggle totals row
  const toggleTotals = () => {
    if (data.totals.length > 0) {
      updateValue({ ...data, totals: [], autoTotals: true });
    } else {
      const calculatedTotals = calculateTotals(data.rows, data.headers, data.changeColumn);
      updateValue({ ...data, totals: calculatedTotals, autoTotals: true });
    }
  };

  // Toggle change column
  const toggleChangeColumn = () => {
    if (data.changeColumn) {
      // Remove change column
      const newHeaders = data.headers.slice(0, -1);
      const newRows = data.rows.map(row => row.slice(0, -1));
      const newTotals = data.totals.length > 0 ? data.totals.slice(0, -1) : [];
      updateValue({ ...data, headers: newHeaders, rows: newRows, totals: newTotals, changeColumn: false });
    } else {
      // Add change column (need at least 2 existing columns: label + value)
      if (data.headers.length < 2) return;
      const newHeaders = [...data.headers, 'Изменение'];
      const newRows = data.rows.map(row => [...row, '']);
      const newTotals = data.totals.length > 0 ? [...data.totals, ''] : [];
      updateValue({ ...data, headers: newHeaders, rows: newRows, totals: newTotals, changeColumn: true });
    }
  };

  // Update table title
  const updateTitle = (newTitle) => {
    updateValue({ ...data, title: newTitle });
  };

  // Add default structure
  const addDefaults = () => {
    updateValue({
      title: '',
      headers: ['Название', 'Значение'],
      rows: [['', '']],
      totals: [],
      changeColumn: false,
    });
  };

  // Check if a column is the change column
  const isChangeCol = (colIndex) => data.changeColumn && colIndex === data.headers.length - 1;

  // Parse change value for coloring
  const getChangeColor = (cellValue) => {
    if (!cellValue || typeof cellValue !== 'string') return '#a5a5ba';
    if (cellValue.includes('+')) return '#5cb176';
    if (cellValue.includes('📉')) return '#ee5e52';
    return '#a5a5ba';
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
        {/* Header with title input and controls */}
        {hasData && (
          <Flex
            style={{
              backgroundColor: '#1a1a2e',
              padding: '8px 16px',
              borderBottom: '1px solid #32324d',
            }}
            alignItems="center"
            justifyContent="space-between"
            gap={3}
          >
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateTitle(e.target.value)}
              placeholder="Введите название таблицы"
              disabled={disabled}
              style={{
                flex: 1,
                border: '1px solid #32324d',
                borderRadius: '4px',
                background: '#212134',
                padding: '6px 10px',
                fontSize: '14px',
                color: '#ffffff',
                outline: 'none',
              }}
            />
            <Flex gap={2}>
              <Button
                variant="secondary"
                size="S"
                onClick={toggleTotals}
                disabled={disabled}
              >
                {data.totals.length > 0 ? 'Убрать итого' : 'Добавить итого'}
              </Button>
              {data.headers.length >= 2 && (
                <Button
                  variant={data.changeColumn ? 'danger-light' : 'secondary'}
                  size="S"
                  onClick={toggleChangeColumn}
                  disabled={disabled}
                >
                  {data.changeColumn ? 'Убрать прирост' : 'Добавить прирост'}
                </Button>
              )}
            </Flex>
          </Flex>
        )}

        {hasData ? (
          <Box style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
              {/* Headers row */}
              <thead>
                <tr>
                  {data.headers.map((header, colIndex) => (
                    <th key={colIndex} style={{ ...headerStyle, minWidth: isChangeCol(colIndex) ? '100px' : '120px' }}>
                      <Flex alignItems="center" gap={1}>
                        <input
                          type="text"
                          value={header}
                          onChange={(e) => updateHeader(colIndex, e.target.value)}
                          style={{ ...inputStyle, fontWeight: 600, color: '#a5a5ba', textTransform: 'uppercase', fontSize: '12px' }}
                          placeholder="Заголовок"
                          disabled={disabled || isChangeCol(colIndex)}
                        />
                        {data.headers.length > 1 && !isChangeCol(colIndex) && (
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
                        {isChangeCol(colIndex) ? (
                          <span style={{
                            padding: '6px 8px',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: getChangeColor(cell),
                            display: 'block',
                          }}>
                            {cell || '—'}
                          </span>
                        ) : (
                          <input
                            type="text"
                            value={cell || ''}
                            onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                            style={inputStyle}
                            placeholder="—"
                            disabled={disabled}
                          />
                        )}
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

                {/* Totals row */}
                {data.totals.length > 0 && (
                  <tr style={{ backgroundColor: '#1a2e1a' }}>
                    {data.totals.map((total, colIndex) => (
                      <td key={colIndex} style={{ ...cellStyle, backgroundColor: 'rgba(92, 177, 118, 0.1)' }}>
                        {isChangeCol(colIndex) ? (
                          <span style={{
                            ...totalsInputStyle,
                            padding: '6px 8px',
                            display: 'block',
                            color: getChangeColor(total),
                          }}>
                            {total || '—'}
                          </span>
                        ) : (
                          <div style={{ ...totalsInputStyle, padding: '6px 8px', minHeight: '32px' }}>
                            {total || (colIndex === 0 ? 'Итого' : '—')}
                          </div>
                        )}
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
