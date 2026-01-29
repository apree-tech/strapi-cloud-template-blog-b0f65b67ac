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

const MAX_VALUE = 999999999;

const SocialMetricsTable = ({ name, value, onChange, disabled }) => {
  const [data, setData] = useState({ platform: 'Twitter', metrics: [] });
  const [errors, setErrors] = useState({});

  // Parse value on mount
  useEffect(() => {
    if (value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (parsed && typeof parsed === 'object') {
          setData({
            platform: parsed.platform || 'Twitter',
            metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
          });
        }
      } catch (e) {
        setData({ platform: 'Twitter', metrics: [] });
      }
    }
  }, []);

  // Validate number
  const validateNumber = (str) => {
    if (!str && str !== 0) return { valid: true, value: 0 };
    const cleaned = String(str).replace(/\s/g, '');
    if (cleaned === '') return { valid: true, value: 0 };
    if (!/^\d+$/.test(cleaned)) {
      return { valid: false, error: 'Только числа' };
    }
    const num = parseInt(cleaned, 10);
    if (num < 0) {
      return { valid: false, error: 'Минимум: 0' };
    }
    if (num > MAX_VALUE) {
      return { valid: false, error: 'Максимум: 999 999 999' };
    }
    return { valid: true, value: num };
  };

  // Calculate change percentage
  const calculateChange = (prev, current) => {
    const p = Number(prev) || 0;
    const c = Number(current) || 0;
    if (p === 0) return c > 0 ? 100 : 0;
    return Math.round(((c - p) / p) * 1000) / 10;
  };

  // Get indicator emoji
  const getIndicator = (change) => {
    if (change > 0) return '📈';
    if (change < 0) return '📉';
    return '➡️';
  };

  // Format number with spaces
  const formatNumber = (num) => {
    if (!num && num !== 0) return '';
    return new Intl.NumberFormat('ru-RU').format(num);
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

  // Add new row
  const addRow = () => {
    const newMetrics = [
      ...data.metrics,
      { metric_name: '', prev_value: 0, current_value: 0, change_percent: '0.0%', change_indicator: '➡️' },
    ];
    updateValue({ ...data, metrics: newMetrics });
  };

  // Add default metrics
  const addDefaults = () => {
    const newMetrics = DEFAULT_METRICS.map((metricName) => ({
      metric_name: metricName,
      prev_value: 0,
      current_value: 0,
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
    delete newErrors[`${index}_prev`];
    delete newErrors[`${index}_current`];
    setErrors(newErrors);
    updateValue({ ...data, metrics: newMetrics }, newErrors);
  };

  // Update cell
  const updateCell = (index, field, rawValue) => {
    const newMetrics = [...data.metrics];
    const metric = { ...newMetrics[index] };
    const newErrors = { ...errors };

    if (field === 'metric_name') {
      metric.metric_name = rawValue;
    } else if (field === 'prev_value' || field === 'current_value') {
      const validation = validateNumber(rawValue);
      const errorKey = `${index}_${field === 'prev_value' ? 'prev' : 'current'}`;

      if (validation.valid) {
        metric[field] = validation.value;
        newErrors[errorKey] = null;
      } else {
        metric[field] = rawValue;
        newErrors[errorKey] = validation.error;
      }

      // Recalculate if both values are valid
      const prevValid = validateNumber(metric.prev_value);
      const currentValid = validateNumber(metric.current_value);

      if (prevValid.valid && currentValid.valid) {
        const change = calculateChange(prevValid.value, currentValid.value);
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
        {/* Platform header with selector */}
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
        </Flex>

        {data.metrics.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headerStyle, width: '30%' }}>Метрика</th>
                <th style={{ ...headerStyle, width: '20%' }}>Пред. период</th>
                <th style={{ ...headerStyle, width: '20%' }}>Текущий</th>
                <th style={{ ...headerStyle, width: '15%' }}>Изменение</th>
                <th style={{ ...headerStyle, width: '10%' }}></th>
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((metric, index) => {
                const prevValidation = validateNumber(metric.prev_value);
                const currentValidation = validateNumber(metric.current_value);
                const change = (prevValidation.valid && currentValidation.valid)
                  ? calculateChange(prevValidation.value, currentValidation.value)
                  : 0;
                const isPositive = change > 0;
                const isNegative = change < 0;
                const prevError = errors[`${index}_prev`];
                const currentError = errors[`${index}_current`];

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
                    <td style={cellStyle}>
                      <Box>
                        <input
                          type="text"
                          value={typeof metric.prev_value === 'number' ? formatNumber(metric.prev_value) : metric.prev_value}
                          onChange={(e) => updateCell(index, 'prev_value', e.target.value)}
                          style={prevError ? inputErrorStyle : inputValidStyle}
                          placeholder="0"
                          disabled={disabled}
                        />
                        {prevError && (
                          <Typography variant="pi" style={{ color: '#d02b20', fontSize: '11px', marginTop: '2px' }}>
                            {prevError}
                          </Typography>
                        )}
                      </Box>
                    </td>
                    <td style={cellStyle}>
                      <Box>
                        <input
                          type="text"
                          value={typeof metric.current_value === 'number' ? formatNumber(metric.current_value) : metric.current_value}
                          onChange={(e) => updateCell(index, 'current_value', e.target.value)}
                          style={currentError ? inputErrorStyle : inputValidStyle}
                          placeholder="0"
                          disabled={disabled}
                        />
                        {currentError && (
                          <Typography variant="pi" style={{ color: '#d02b20', fontSize: '11px', marginTop: '2px' }}>
                            {currentError}
                          </Typography>
                        )}
                      </Box>
                    </td>
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
