import React, { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Typography, Button, IconButton, SingleSelect, SingleSelectOption } from '@strapi/design-system';
import { Plus, Trash } from '@strapi/icons';

const DEFAULT_METRICS = [
  'Охваты',
  'Подписчики',
  'Вовлечённость',
  'Переходы',
];

const PLATFORMS = ['Twitter', 'Reddit', 'Instagram'];
const MONTH_OPTIONS = [2, 3];

const MAX_VALUE = 999999999;

const SocialMetricsTable = ({ name, value, onChange, disabled }) => {
  const [data, setData] = useState({ platform: 'Twitter', metrics: [], monthCount: 2, month_headers: [] });
  const [errors, setErrors] = useState({});

  // Parse value on mount
  useEffect(() => {
    if (value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (parsed && typeof parsed === 'object') {
          // Convert old format (prev_value, current_value) to new format (month_values)
          const migratedMetrics = Array.isArray(parsed.metrics)
            ? parsed.metrics.map(metric => {
                // If month_values exists, use it; otherwise migrate from old format
                if (metric.month_values && Array.isArray(metric.month_values)) {
                  return metric;
                }
                return {
                  ...metric,
                  month_values: [metric.current_value || 0, metric.prev_value || 0],
                };
              })
            : [];

          setData({
            platform: parsed.platform || 'Twitter',
            metrics: migratedMetrics,
            monthCount: parsed.monthCount || 2,
            month_headers: parsed.month_headers || [],
          });
        }
      } catch (e) {
        setData({ platform: 'Twitter', metrics: [], monthCount: 2, month_headers: [] });
      }
    }
  }, []);

  // Validate number (supports decimals with dot or comma)
  const validateNumber = (str) => {
    if (!str && str !== 0) return { valid: true, value: 0 };
    const cleaned = String(str).replace(/\s/g, '');
    if (cleaned === '') return { valid: true, value: 0 };
    // Allow integers and decimals with dot or comma
    if (!/^\d+([.,]\d+)?$/.test(cleaned)) {
      return { valid: false, error: 'Только числа' };
    }
    // Replace comma with dot for parsing
    const num = parseFloat(cleaned.replace(',', '.'));
    if (num < 0) {
      return { valid: false, error: 'Минимум: 0' };
    }
    if (num > MAX_VALUE) {
      return { valid: false, error: 'Максимум: 999 999 999' };
    }
    return { valid: true, value: num };
  };

  // Calculate change percentage (between first and second month values)
  const calculateChange = (monthValues) => {
    if (!Array.isArray(monthValues) || monthValues.length < 2) return 0;
    const current = Number(monthValues[0]) || 0;
    const prev = Number(monthValues[1]) || 0;
    if (prev === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prev) / prev) * 1000) / 10;
  };

  // Get indicator emoji
  const getIndicator = (change) => {
    if (change > 0) return '📈';
    if (change < 0) return '📉';
    return '➡️';
  };

  // Format number with spaces (supports decimals)
  const formatNumber = (num) => {
    if (!num && num !== 0) return '';
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Check if there are any errors
  const hasErrors = useCallback(() => {
    return Object.values(errors).some(e => e !== null);
  }, [errors]);

  // Update parent form
  const updateValue = (newData, newErrors = errors) => {
    setData(newData);

    // Block form submission if there are errors
    const formHasErrors = Object.values(newErrors).some(e => e !== null);

    onChange({
      target: {
        name,
        value: formHasErrors ? null : newData,
        type: 'json',
      },
    });
  };

  // Change platform
  const changePlatform = (newPlatform) => {
    updateValue({ ...data, platform: newPlatform });
  };

  // Change month count
  const changeMonthCount = (newCount) => {
    const count = parseInt(newCount, 10);
    if (count < 2 || count > 3) return;

    // Adjust month_values arrays in metrics
    const adjustedMetrics = data.metrics.map(metric => {
      const currentValues = metric.month_values || [0, 0];
      const newValues = [...currentValues];

      // Add or remove values to match new count
      while (newValues.length < count) {
        newValues.push(0);
      }
      if (newValues.length > count) {
        newValues.length = count;
      }

      return { ...metric, month_values: newValues };
    });

    updateValue({ ...data, monthCount: count, metrics: adjustedMetrics, month_headers: [] });
  };

  // Get month headers (actual month names, oldest to newest)
  const getMonthHeaders = () => {
    if (data.month_headers && data.month_headers.length >= data.monthCount) {
      return data.month_headers.slice(0, data.monthCount).reverse();
    }

    // Generate month names starting from oldest to current
    const headers = [];
    const now = new Date();
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    // Start from oldest month (monthCount - 1 months ago) to current
    for (let i = data.monthCount - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleDateString('ru-RU', { month: 'long' });
      headers.push(capitalize(monthName));
    }

    return headers;
  };

  // Get display index for month values (reverse order: oldest first)
  const getDisplayMonthIndex = (displayIdx) => {
    return data.monthCount - 1 - displayIdx;
  };

  // Create empty month_values array based on monthCount
  const createEmptyMonthValues = () => {
    return Array(data.monthCount).fill(0);
  };

  // Add new row
  const addRow = () => {
    const newMetrics = [
      ...data.metrics,
      {
        metric_name: '',
        month_values: createEmptyMonthValues(),
        change_percent: '0.0%',
        change_indicator: '➡️',
      },
    ];
    updateValue({ ...data, metrics: newMetrics });
  };

  // Add default metrics
  const addDefaults = () => {
    const newMetrics = DEFAULT_METRICS.map((metricName) => ({
      metric_name: metricName,
      month_values: createEmptyMonthValues(),
      change_percent: '0.0%',
      change_indicator: '➡️',
    }));
    setErrors({});
    updateValue({ ...data, metrics: newMetrics }, {});
  };

  // Remove row
  const removeRow = (index) => {
    const newMetrics = data.metrics.filter((_, i) => i !== index);
    const newErrors = { ...errors };
    // Remove all error keys for this row
    for (let i = 0; i < data.monthCount; i++) {
      delete newErrors[`${index}_month_${i}`];
    }
    setErrors(newErrors);
    updateValue({ ...data, metrics: newMetrics }, newErrors);
  };

  // Update cell
  const updateCell = (index, field, rawValue, monthIndex = null) => {
    const newMetrics = [...data.metrics];
    const metric = { ...newMetrics[index] };
    const newErrors = { ...errors };

    if (field === 'metric_name') {
      metric.metric_name = rawValue;
    } else if (field === 'month_value' && monthIndex !== null) {
      const validation = validateNumber(rawValue);
      const errorKey = `${index}_month_${monthIndex}`;

      if (!metric.month_values) {
        metric.month_values = createEmptyMonthValues();
      }
      const monthValues = [...metric.month_values];

      if (validation.valid) {
        monthValues[monthIndex] = validation.value;
        newErrors[errorKey] = null;
      } else {
        monthValues[monthIndex] = rawValue;
        newErrors[errorKey] = validation.error;
      }

      metric.month_values = monthValues;

      // Recalculate change based on first two values
      const allValid = monthValues.slice(0, 2).every(v => validateNumber(v).valid);
      if (allValid && monthValues.length >= 2) {
        const change = calculateChange(monthValues);
        metric.change_percent = change.toFixed(1) + '%';
        metric.change_indicator = getIndicator(change);
      }
    }

    newMetrics[index] = metric;
    setErrors(newErrors);
    updateValue({ ...data, metrics: newMetrics }, newErrors);
  };

  const cellStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid #32324d',
    verticalAlign: 'middle',
  };

  const headerStyle = {
    ...cellStyle,
    backgroundColor: '#212134',
    fontWeight: 600,
    fontSize: '12px',
    color: '#a5a5ba',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    textAlign: 'left',
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

  const inputErrorStyle = {
    ...inputStyle,
    backgroundColor: 'rgba(208, 43, 32, 0.2)',
    borderRadius: '4px',
  };

  const inputValidStyle = {
    ...inputStyle,
    backgroundColor: 'transparent',
  };

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
        {/* Platform header with selectors */}
        <Flex
          style={{
            backgroundColor: '#1a1a2e',
            padding: '12px 16px',
            borderBottom: '1px solid #32324d',
          }}
          alignItems="center"
          gap={3}
        >
          <Typography
            variant="beta"
            fontWeight="bold"
            style={{ color: '#ffffff', fontSize: '16px' }}
          >
            Статистика
          </Typography>
          <select
            value={data.platform}
            onChange={(e) => changePlatform(e.target.value)}
            disabled={disabled}
            style={{
              backgroundColor: '#32324d',
              color: '#ffffff',
              border: '1px solid #4a4a6a',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <Typography
            variant="omega"
            style={{ color: '#a5a5ba', marginLeft: '16px' }}
          >
            Месяцев:
          </Typography>
          <select
            value={data.monthCount}
            onChange={(e) => changeMonthCount(e.target.value)}
            disabled={disabled}
            style={{
              backgroundColor: '#32324d',
              color: '#ffffff',
              border: '1px solid #4a4a6a',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {MONTH_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Flex>

        {data.metrics.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headerStyle, width: '25%' }}>Метрика</th>
                {getMonthHeaders().map((header, i) => (
                  <th key={i} style={{ ...headerStyle, width: `${40 / data.monthCount}%` }}>{header}</th>
                ))}
                <th style={{ ...headerStyle, width: '15%' }}>Изменение</th>
                <th style={{ ...headerStyle, width: '8%' }}></th>
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((metric, index) => {
                const monthValues = metric.month_values || createEmptyMonthValues();
                const change = calculateChange(monthValues);
                const isPositive = change > 0;
                const isNegative = change < 0;

                return (
                  <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#212134' : '#1a1a2e' }}>
                    <td style={cellStyle}>
                      <input
                        type="text"
                        value={metric.metric_name || ''}
                        onChange={(e) => updateCell(index, 'metric_name', e.target.value)}
                        style={inputStyle}
                        placeholder="Название метрики"
                        disabled={disabled}
                      />
                    </td>
                    {Array.from({ length: data.monthCount }).map((_, displayIdx) => {
                      // Reverse: display oldest first, so map display index to data index
                      const dataIdx = getDisplayMonthIndex(displayIdx);
                      const monthError = errors[`${index}_month_${dataIdx}`];
                      const monthValue = monthValues[dataIdx];

                      return (
                        <td key={displayIdx} style={cellStyle}>
                          <Box>
                            <input
                              type="text"
                              value={typeof monthValue === 'number' ? formatNumber(monthValue) : monthValue}
                              onChange={(e) => updateCell(index, 'month_value', e.target.value, dataIdx)}
                              style={monthError ? inputErrorStyle : inputValidStyle}
                              placeholder="0"
                              disabled={disabled}
                            />
                            {monthError && (
                              <Typography variant="pi" style={{ color: '#d02b20', fontSize: '11px', marginTop: '2px' }}>
                                {monthError}
                              </Typography>
                            )}
                          </Box>
                        </td>
                      );
                    })}
                    <td
                      style={{
                        ...cellStyle,
                        fontWeight: 600,
                        color: isPositive ? '#5cb176' : isNegative ? '#ee5e52' : '#a5a5ba',
                      }}
                    >
                      {metric.change_indicator} {isPositive ? '+' : ''}{metric.change_percent}
                    </td>
                    <td style={cellStyle}>
                      <IconButton
                        onClick={() => removeRow(index)}
                        label="Удалить"
                        variant="ghost"
                        disabled={disabled}
                        style={{ color: '#a5a5ba' }}
                      >
                        <Trash />
                      </IconButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Box
            padding={4}
            style={{ textAlign: 'center' }}
          >
            <Typography variant="omega" style={{ color: '#a5a5ba' }}>
              Нет метрик. Нажмите "Добавить стандартные" или "Добавить".
            </Typography>
          </Box>
        )}
      </Box>

      <Flex justifyContent="flex-start" alignItems="center" marginTop={3} gap={2}>
        {data.metrics.length === 0 && (
          <Button variant="secondary" size="S" onClick={addDefaults} disabled={disabled}>
            Добавить стандартные
          </Button>
        )}
        <Button startIcon={<Plus />} variant="secondary" size="S" onClick={addRow} disabled={disabled}>
          Добавить
        </Button>
      </Flex>

      {hasErrors() && (
        <Box marginTop={2}>
          <Typography variant="pi" textColor="danger600">
            Исправьте ошибки перед сохранением
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SocialMetricsTable;
