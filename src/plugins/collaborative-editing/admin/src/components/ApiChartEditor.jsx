import React, { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Typography, Button, Loader } from '@strapi/design-system';
import { Download } from '@strapi/icons';
import { useDomSync } from '../hooks/useDomSync';

const ApiChartEditor = ({ name, value, onChange, disabled }) => {
  const initialData = { charts: [] };

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Parse value on mount
  useEffect(() => {
    if (value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (parsed && typeof parsed === 'object') {
          setData(parsed);
        }
      } catch (e) {
        console.error('Failed to parse api-chart data:', e);
      }
    }
  }, []);

  // DOM sync for real-time collaboration
  const handleRemoteUpdate = useCallback((newData) => {
    setData(newData);
    onChange({
      target: { name, value: newData, type: 'json' },
    });
  }, [name, onChange]);

  const { updateValue: broadcastUpdate } = useDomSync(
    `api-chart:${name}`,
    data,
    handleRemoteUpdate
  );

  const updateValue = (newData) => {
    setData(newData);
    broadcastUpdate(newData);
    onChange({
      target: { name, value: newData, type: 'json' },
    });
  };

  // Get documentId from URL
  const getDocumentId = () => {
    const match = window.location.pathname.match(/\/api::report\.report\/([^/]+)/);
    return match ? match[1] : null;
  };

  // Transform revenue API response to pie chart data
  const transformRevenueToCharts = (apiData) => {
    const charts = [];

    const { current } = apiData;
    if (!current) return { charts: [] };

    // One pie chart per platform
    if (current.platforms && Array.isArray(current.platforms)) {
      current.platforms.forEach((platform) => {
        charts.push({
          title: platform.platform,
          labels: ['Subs', 'Tips', 'Messages'],
          values: [
            platform.subs || 0,
            platform.tips || 0,
            platform.messages || 0,
          ],
        });
      });
    }

    // Total pie chart — only if multiple platforms
    if (current.total && charts.length > 1) {
      charts.push({
        title: current.total.platform || 'TOTAL',
        labels: ['Subs', 'Tips', 'Messages'],
        values: [
          current.total.subs || 0,
          current.total.tips || 0,
          current.total.messages || 0,
        ],
      });
    }

    return { charts, period: current.period || '' };
  };

  // Fetch data from analytics API
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const documentId = getDocumentId();
      if (!documentId) {
        setError('Сначала сохраните отчёт');
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/revenue/report/${documentId}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      if (result.success !== false) {
        const chartData = transformRevenueToCharts(result);
        updateValue(chartData);
      } else {
        setError(result.error || 'Не удалось загрузить данные');
      }
    } catch (err) {
      console.error('Failed to fetch chart data:', err);
      setError('Ошибка загрузки данных. Проверьте подключение к API.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (num) => {
    if (!num && num !== 0) return '$0';
    return '$' + new Intl.NumberFormat('en-US').format(num);
  };

  const hasData = data.charts && data.charts.length > 0;

  // Simple pie chart preview (SVG)
  const renderMiniPie = (chart) => {
    const total = chart.values.reduce((s, v) => s + v, 0);
    if (total === 0) return null;

    const colors = ['#ec4899', '#a855f7', '#8b5cf6'];
    const size = 80;
    const cx = size / 2;
    const cy = size / 2;
    const r = 30;

    let startAngle = -90;
    const slices = chart.values.map((val, i) => {
      const angle = (val / total) * 360;
      const endAngle = startAngle + angle;
      const largeArc = angle > 180 ? 1 : 0;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);

      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      startAngle = endAngle;

      return (
        <path key={i} d={path} fill={colors[i % colors.length]} opacity={0.85} />
      );
    });

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices}
      </svg>
    );
  };

  const cellStyle = {
    padding: '8px 12px',
    borderBottom: '1px solid #32324d',
    fontSize: '13px',
    color: '#a5a5ba',
  };

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
          Диаграммы оборотов
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

      {/* Charts preview */}
      {hasData ? (
        <Box
          style={{
            padding: '16px',
            backgroundColor: '#212134',
            border: '1px solid #32324d',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
          }}
        >
          {data.period && (
            <Typography variant="sigma" style={{ color: '#a5a5ba', marginBottom: '12px', display: 'block' }}>
              Период: {data.period}
            </Typography>
          )}
          <Flex gap={4} wrap="wrap">
            {data.charts.map((chart, index) => (
              <Box
                key={index}
                style={{
                  border: '1px solid #32324d',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#1a1a2e',
                  minWidth: '180px',
                  flex: '1 1 180px',
                  maxWidth: '250px',
                }}
              >
                <Typography
                  variant="sigma"
                  style={{
                    color: '#ffffff',
                    marginBottom: '8px',
                    display: 'block',
                    textAlign: 'center',
                    fontWeight: 600,
                  }}
                >
                  {chart.title}
                </Typography>
                <Flex justifyContent="center" style={{ marginBottom: '8px' }}>
                  {renderMiniPie(chart)}
                </Flex>
                {chart.labels.map((label, li) => (
                  <Flex key={li} justifyContent="space-between" style={{ padding: '2px 0' }}>
                    <Typography variant="omega" style={{ color: '#a5a5ba', fontSize: '12px' }}>
                      {label}
                    </Typography>
                    <Typography variant="omega" style={{ color: '#ffffff', fontSize: '12px', fontWeight: 500 }}>
                      {formatCurrency(chart.values[li])}
                    </Typography>
                  </Flex>
                ))}
              </Box>
            ))}
          </Flex>
        </Box>
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

export default ApiChartEditor;
