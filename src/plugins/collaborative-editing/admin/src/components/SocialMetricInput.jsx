import React, { useMemo } from 'react';
import { Box, Flex, Typography, TextInput, Field } from '@strapi/design-system';

/**
 * Custom input component for Social Metric that shows calculated change percentage
 */
const SocialMetricInput = ({
  attribute,
  disabled,
  error,
  intlLabel,
  labelAction,
  name,
  onChange,
  required,
  value,
  ...props
}) => {
  // Parse the value - it should be an object with metric_name, prev_value, current_value
  const metricData = useMemo(() => {
    if (!value) return { metric_name: '', prev_value: 0, current_value: 0 };
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { metric_name: '', prev_value: 0, current_value: 0 };
      }
    }
    return value;
  }, [value]);

  // Calculate change percentage
  const changePercent = useMemo(() => {
    const prev = Number(metricData.prev_value) || 0;
    const current = Number(metricData.current_value) || 0;

    if (prev === 0) {
      return current > 0 ? 100 : 0;
    }

    const change = ((current - prev) / prev) * 100;
    return Math.round(change * 10) / 10;
  }, [metricData.prev_value, metricData.current_value]);

  // Get change indicator
  const getChangeStyle = () => {
    if (changePercent > 0) return { color: '#328048', icon: '📈' };
    if (changePercent < 0) return { color: '#d02b20', icon: '📉' };
    return { color: '#666687', icon: '➡️' };
  };

  const changeStyle = getChangeStyle();

  // Format number with spaces as thousand separators
  const formatNumber = (num) => {
    if (!num && num !== 0) return '';
    return new Intl.NumberFormat('ru-RU').format(num);
  };

  // Parse formatted number
  const parseNumber = (str) => {
    if (!str) return 0;
    return parseInt(String(str).replace(/\s/g, ''), 10) || 0;
  };

  // Handle field changes
  const handleChange = (field, fieldValue) => {
    const newValue = {
      ...metricData,
      [field]: field === 'metric_name' ? fieldValue : parseNumber(fieldValue),
    };

    onChange({
      target: {
        name,
        value: newValue,
        type: attribute.type,
      },
    });
  };

  return (
    <Box>
      <Flex gap={3} alignItems="flex-end">
        {/* Metric name */}
        <Box style={{ flex: 2 }}>
          <Field.Root>
            <Field.Label>Метрика</Field.Label>
            <TextInput
              placeholder="Название метрики"
              value={metricData.metric_name || ''}
              onChange={(e) => handleChange('metric_name', e.target.value)}
              disabled={disabled}
            />
          </Field.Root>
        </Box>

        {/* Previous value */}
        <Box style={{ flex: 1 }}>
          <Field.Root>
            <Field.Label>Пред. месяц</Field.Label>
            <TextInput
              placeholder="0"
              value={formatNumber(metricData.prev_value)}
              onChange={(e) => handleChange('prev_value', e.target.value)}
              disabled={disabled}
            />
          </Field.Root>
        </Box>

        {/* Current value */}
        <Box style={{ flex: 1 }}>
          <Field.Root>
            <Field.Label>Текущий</Field.Label>
            <TextInput
              placeholder="0"
              value={formatNumber(metricData.current_value)}
              onChange={(e) => handleChange('current_value', e.target.value)}
              disabled={disabled}
            />
          </Field.Root>
        </Box>

        {/* Change percentage indicator */}
        <Box
          style={{
            width: '100px',
            paddingBottom: '8px',
            textAlign: 'center',
          }}
        >
          <Typography
            variant="omega"
            fontWeight="bold"
            style={{ color: changeStyle.color }}
          >
            {changeStyle.icon} {changePercent > 0 ? '+' : ''}{changePercent}%
          </Typography>
        </Box>
      </Flex>

      {error && (
        <Typography variant="pi" textColor="danger600">
          {error}
        </Typography>
      )}
    </Box>
  );
};

export default SocialMetricInput;
