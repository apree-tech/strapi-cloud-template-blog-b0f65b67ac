import React, { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Typography, Button, Loader } from '@strapi/design-system';
import { Download } from '@strapi/icons';
import { useDomSync } from '../hooks/useDomSync';

const MODES = [
  { value: 'by_platforms', label: 'По платформам' },
  { value: 'by_sales_types', label: 'По типам продаж' },
];

const COLORS = ['#ec4899', '#a855f7', '#8b5cf6', '#f472b6', '#c084fc', '#a78bfa', '#f9a8d4', '#d8b4fe'];

// Auto-detect mode from chart data structure
const detectMode = (charts) => {
  if (!charts || charts.length === 0) return 'by_platforms';
  // Multiple charts = by_sales_types (one chart per platform)
  if (charts.length > 1) return 'by_sales_types';
  // Single chart with Subs/Tips/Messages labels = by_sales_types
  const labels = charts[0]?.labels || [];
  const salesLabels = ['Subs', 'Tips', 'Messages'];
  if (labels.every((l) => salesLabels.includes(l))) return 'by_sales_types';
  return 'by_platforms';
};

const ApiChartEditor = ({ name, value, onChange, disabled }) => {
  const initialData = { charts: [], mode: 'by_platforms' };

  const [data, setData] = useState(initialData);
  const [rawApiData, setRawApiData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Parse value on mount
  useEffect(() => {
    if (value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (parsed && typeof parsed === 'object') {
          // If mode not explicitly set, auto-detect from chart data
          const mode = parsed.mode || detectMode(parsed.charts);
          setData({ ...parsed, mode });
          if (parsed._rawApiData) {
            setRawApiData(parsed._rawApiData);
          }
        }
      } catch (e) {
        console.error('Failed to parse api-chart data:', e);
      }
    }
  }, []);

  // DOM sync for real-time collaboration
  const handleRemoteUpdate = useCallback((newData) => {
    setData(newData);
    if (newData._rawApiData) {
      setRawApiData(newData._rawApiData);
    }
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

  // Transform revenue API response to pie chart data — by platforms
  const transformByPlatforms = (apiData) => {
    const { current } = apiData;
    if (!current) return { charts: [], mode: 'by_platforms' };

    const labels = [];
    const values = [];

    if (current.platforms && Array.isArray(current.platforms)) {
      current.platforms.forEach((platform) => {
        labels.push(platform.platform);
        values.push(platform.total || (platform.subs || 0) + (platform.tips || 0) + (platform.messages || 0));
      });
    }

    const charts = labels.length > 0
      ? [{ title: 'Оборот по платформам', labels, values }]
      : [];

    return { charts, mode: 'by_platforms', period: current.period || '', _rawApiData: apiData };
  };

  // Transform revenue API response to pie chart data — by sales types
  const transformBySalesTypes = (apiData) => {
    const charts = [];

    const { current } = apiData;
    if (!current) return { charts: [], mode: 'by_sales_types' };

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

    return { charts, mode: 'by_sales_types', period: current.period || '', _rawApiData: apiData };
  };

  // Transform based on current mode
  const transformData = (apiData, mode) => {
    if (mode === 'by_sales_types') {
      return transformBySalesTypes(apiData);
    }
    return transformByPlatforms(apiData);
  };

  // Fetch data from analytics API (accepts optional mode override)
  const fetchData = async (modeOverride) => {
    setLoading(true);
    setError(null);

    const targetMode = modeOverride || data.mode || 'by_platforms';

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
        setRawApiData(result);
        const chartData = transformData(result, targetMode);
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

  // Reconstruct raw API data from by_sales_types charts
  const reconstructRawFromSalesCharts = (charts) => {
    if (!charts || charts.length === 0) return null;
    const platformCharts = charts.filter(
      (c) => c.title !== 'TOTAL' && c.title !== 'Сумма'
    );
    if (platformCharts.length === 0) return null;
    // Verify these are sales-type charts (labels are Subs/Tips/Messages)
    const salesLabels = ['Subs', 'Tips', 'Messages'];
    if (!platformCharts[0].labels?.every((l) => salesLabels.includes(l))) return null;

    const platforms = platformCharts.map((c) => ({
      platform: c.title,
      subs: c.values[0] || 0,
      tips: c.values[1] || 0,
      messages: c.values[2] || 0,
      total: (c.values[0] || 0) + (c.values[1] || 0) + (c.values[2] || 0),
    }));

    return {
      current: {
        platforms,
        total: {
          platform: 'Сумма',
          subs: platforms.reduce((s, p) => s + p.subs, 0),
          tips: platforms.reduce((s, p) => s + p.tips, 0),
          messages: platforms.reduce((s, p) => s + p.messages, 0),
          total: platforms.reduce((s, p) => s + p.total, 0),
        },
      },
    };
  };

  // Switch mode and re-transform existing data
  const switchMode = (newMode) => {
    // Try existing raw API data first
    const apiSource = rawApiData || data._rawApiData;
    if (apiSource) {
      const chartData = transformData(apiSource, newMode);
      updateValue(chartData);
      return;
    }

    // Try to reconstruct raw data from existing charts
    const reconstructed = reconstructRawFromSalesCharts(data.charts);
    if (reconstructed) {
      setRawApiData(reconstructed);
      const chartData = transformData(reconstructed, newMode);
      updateValue(chartData);
      return;
    }

    // No data to re-transform — auto-fetch from API in new mode
    if (data.charts && data.charts.length > 0) {
      fetchData(newMode);
    } else {
      updateValue({ ...data, mode: newMode, charts: [] });
    }
  };

  const formatCurrency = (num) => {
    if (!num && num !== 0) return '$0';
    return '$' + new Intl.NumberFormat('en-US').format(num);
  };

  const hasData = data.charts && data.charts.length > 0;

  // Mini doughnut pie chart (SVG) with hole
  const renderMiniPie = (chart, big = false) => {
    const total = chart.values.reduce((s, v) => s + v, 0);
    if (total === 0) return null;

    const size = big ? 120 : 80;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = big ? 50 : 30;
    const innerR = big ? 30 : 16;

    let startAngle = -90;
    const slices = chart.values.map((val, i) => {
      const angle = (val / total) * 360;
      if (angle === 0) return null;

      const endAngle = startAngle + angle;
      const largeArc = angle > 180 ? 1 : 0;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const ox1 = cx + outerR * Math.cos(startRad);
      const oy1 = cy + outerR * Math.sin(startRad);
      const ox2 = cx + outerR * Math.cos(endRad);
      const oy2 = cy + outerR * Math.sin(endRad);

      const ix1 = cx + innerR * Math.cos(endRad);
      const iy1 = cy + innerR * Math.sin(endRad);
      const ix2 = cx + innerR * Math.cos(startRad);
      const iy2 = cy + innerR * Math.sin(startRad);

      const path = [
        `M ${ox1} ${oy1}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2}`,
        `L ${ix1} ${iy1}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
        'Z',
      ].join(' ');

      startAngle = endAngle;

      return (
        <path key={i} d={path} fill={COLORS[i % COLORS.length]} opacity={0.85} />
      );
    });

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices}
      </svg>
    );
  };

  // Render "by platforms" preview — one big chart
  const renderByPlatformsPreview = () => {
    const chart = data.charts[0];
    if (!chart) return null;
    const total = chart.values.reduce((s, v) => s + v, 0);

    return (
      <Box style={{ padding: '16px', textAlign: 'center' }}>
        <Flex justifyContent="center" style={{ marginBottom: '12px' }}>
          {renderMiniPie(chart, true)}
        </Flex>
        <Flex gap={3} wrap="wrap" justifyContent="center">
          {chart.labels.map((label, i) => {
            const pct = total > 0 ? ((chart.values[i] / total) * 100).toFixed(1) : '0';
            return (
              <Flex key={i} alignItems="center" gap={1} style={{ fontSize: '12px' }}>
                <Box
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: COLORS[i % COLORS.length],
                    flexShrink: 0,
                  }}
                />
                <Typography variant="omega" style={{ color: '#ffffff', fontSize: '12px' }}>
                  {label}
                </Typography>
                <Typography variant="omega" style={{ color: '#a5a5ba', fontSize: '12px' }}>
                  {formatCurrency(chart.values[i])} ({pct}%)
                </Typography>
              </Flex>
            );
          })}
        </Flex>
        {total > 0 && (
          <Typography variant="omega" style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600, marginTop: '8px', display: 'block' }}>
            Итого: {formatCurrency(total)}
          </Typography>
        )}
      </Box>
    );
  };

  // Render "by sales types" preview — multiple small charts
  const renderBySalesTypesPreview = () => (
    <Flex gap={4} wrap="wrap" style={{ padding: '16px' }}>
      {data.charts.map((chart, index) => {
        const total = chart.values.reduce((s, v) => s + v, 0);
        return (
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
            {chart.labels.map((label, li) => {
              const pct = total > 0 ? ((chart.values[li] / total) * 100).toFixed(1) : '0';
              return (
                <Flex key={li} justifyContent="space-between" style={{ padding: '2px 0' }}>
                  <Typography variant="omega" style={{ color: '#a5a5ba', fontSize: '12px' }}>
                    {label}
                  </Typography>
                  <Typography variant="omega" style={{ color: '#ffffff', fontSize: '12px', fontWeight: 500 }}>
                    {formatCurrency(chart.values[li])} <span style={{ color: '#a5a5ba' }}>({pct}%)</span>
                  </Typography>
                </Flex>
              );
            })}
            {total > 0 && (
              <Flex justifyContent="space-between" style={{ padding: '4px 0 0', borderTop: '1px solid #32324d', marginTop: '4px' }}>
                <Typography variant="omega" style={{ color: '#ffffff', fontSize: '12px', fontWeight: 600 }}>
                  Итого
                </Typography>
                <Typography variant="omega" style={{ color: '#ffffff', fontSize: '12px', fontWeight: 700 }}>
                  {formatCurrency(total)}
                </Typography>
              </Flex>
            )}
          </Box>
        );
      })}
    </Flex>
  );

  return (
    <Box>
      {/* Header with mode selector and load button */}
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
        <Flex alignItems="center" gap={3}>
          <Typography
            variant="beta"
            fontWeight="bold"
            style={{ color: '#ffffff', fontSize: '16px' }}
          >
            Диаграммы оборотов
          </Typography>

          {/* Mode selector */}
          <select
            value={data.mode || 'by_platforms'}
            onChange={(e) => switchMode(e.target.value)}
            disabled={disabled}
            style={{
              backgroundColor: '#32324d',
              color: '#ffffff',
              border: '1px solid #4a4a6a',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </Flex>

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
            backgroundColor: '#212134',
            border: '1px solid #32324d',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
          }}
        >
          {data.period && (
            <Typography variant="sigma" style={{ color: '#a5a5ba', padding: '12px 16px 0', display: 'block' }}>
              Период: {data.period}
            </Typography>
          )}
          {data.mode === 'by_sales_types'
            ? renderBySalesTypesPreview()
            : renderByPlatformsPreview()
          }
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
