import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';
import { useGameStore } from '../../hooks/useGameStore';

const COLORS = {
  fold: '#F87171',
  call: '#A78BFA',
  raise: '#FBBF24',
  check: '#34D399',
  'all-in': '#E84393',
  agent: '#836EF9',
  positive: '#10B981',
  negative: '#EF4444',
};

export const AnalyticsPanel: React.FC = () => {
  const { state } = useGameStore();

  // 1. Cumulative Profit Data
  const cumulativeProfitData = useMemo(() => {
    if (!state.winHistory || state.winHistory.length === 0) return [];

    // WinHistoryEntry has matchNumber and winRate, derive cumulative profit from win rate trend
    return state.winHistory.map((entry) => ({
      hand: entry.matchNumber,
      profit: Math.round((entry.winRate - 50) * entry.matchNumber * 0.1),
    }));
  }, [state.winHistory]);

  const isProfitPositive = useMemo(() => {
    if (cumulativeProfitData.length === 0) return true;
    return cumulativeProfitData[cumulativeProfitData.length - 1].profit >= 0;
  }, [cumulativeProfitData]);

  // 2. Action Distribution Data
  const actionDistribution = useMemo(() => {
    if (!state.actionLog || state.actionLog.length === 0) return [];

    const counts: Record<string, number> = {
      fold: 0,
      call: 0,
      raise: 0,
      check: 0,
      'all-in': 0,
    };

    state.actionLog.forEach((entry) => {
      const event = entry.event.toLowerCase();
      if (event.includes('fold')) counts.fold++;
      else if (event.includes('all-in') || event.includes('all in')) counts['all-in']++;
      else if (event.includes('raise') || event.includes('bet')) counts.raise++;
      else if (event.includes('call')) counts.call++;
      else if (event.includes('check')) counts.check++;
    });

    const total = Object.values(counts).reduce((sum, val) => sum + val, 0);
    if (total === 0) return [];

    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([action, count]) => ({
        name: action.charAt(0).toUpperCase() + action.slice(1),
        value: count,
        percentage: ((count / total) * 100).toFixed(1),
      }));
  }, [state.actionLog]);

  // 3. Player Performance Data
  const playerPerformance = useMemo(() => {
    if (!state.leaderboard || state.leaderboard.length === 0) return [];

    return state.leaderboard.map((player) => ({
      name: player.playerName.length > 10
        ? player.playerName.substring(0, 10) + '...'
        : player.playerName,
      fullName: player.playerName,
      winRate: parseFloat((player.winRate * 100).toFixed(1)),
      isAgent: player.playerType === 'agent',
    }));
  }, [state.leaderboard]);

  // 4. Win/Loss Streak Data
  const streakData = useMemo(() => {
    if (!state.leaderboard || state.leaderboard.length === 0) return [];

    return state.leaderboard.map((player) => ({
      name: player.playerName.length > 10
        ? player.playerName.substring(0, 10) + '...'
        : player.playerName,
      fullName: player.playerName,
      streak: player.currentStreak,
      isPositive: player.currentStreak >= 0,
    }));
  }, [state.leaderboard]);

  // Custom Tooltip Component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: 'rgba(15, 12, 46, 0.95)',
            border: '1px solid rgba(131, 110, 249, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
          }}
        >
          <p style={{ color: '#A78BFA', fontSize: '12px', marginBottom: '4px' }}>
            {label}
          </p>
          {payload.map((entry: any, index: number) => (
            <p
              key={index}
              style={{
                color: entry.color || '#FFFFFF',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              {entry.name}: {entry.value}
              {entry.payload.percentage && ` (${entry.payload.percentage}%)`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = (entry: any) => {
    return `${entry.name} (${entry.percentage}%)`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 1. Cumulative Profit Chart */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)', marginBottom: '16px' }}
        >
          Cumulative Profit
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={cumulativeProfitData}>
            <defs>
              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={isProfitPositive ? COLORS.positive : COLORS.negative}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={isProfitPositive ? COLORS.positive : COLORS.negative}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(131, 110, 249, 0.08)" />
            <XAxis
              dataKey="hand"
              stroke="#6B7280"
              style={{ fontSize: '12px' }}
              label={{ value: 'Hand #', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
            />
            <YAxis
              stroke="#6B7280"
              style={{ fontSize: '12px' }}
              label={{ value: 'Profit', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="profit"
              stroke={isProfitPositive ? COLORS.positive : COLORS.negative}
              strokeWidth={2}
              fill="url(#profitGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 2. Action Distribution */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)', marginBottom: '16px' }}
        >
          Action Distribution
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          {actionDistribution.length > 0 ? (
            <PieChart>
              <Pie
                data={actionDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {actionDistribution.map((entry, index) => {
                  const actionKey = entry.name.toLowerCase() as keyof typeof COLORS;
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[actionKey] || COLORS.agent}
                    />
                  );
                })}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6B7280',
                fontSize: '14px',
              }}
            >
              No action data available
            </div>
          )}
        </ResponsiveContainer>
      </div>

      {/* 3. Player Performance */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)', marginBottom: '16px' }}
        >
          Player Win Rate
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          {playerPerformance.length > 0 ? (
            <BarChart data={playerPerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(131, 110, 249, 0.08)" />
              <XAxis
                dataKey="name"
                stroke="#6B7280"
                style={{ fontSize: '11px' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                stroke="#6B7280"
                style={{ fontSize: '12px' }}
                label={{ value: 'Win Rate (%)', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="winRate" radius={[8, 8, 0, 0]}>
                {playerPerformance.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.isAgent
                        ? 'url(#agentGradient)'
                        : COLORS.agent
                    }
                  />
                ))}
              </Bar>
              <defs>
                <linearGradient id="agentGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" stopOpacity={1} />
                  <stop offset="100%" stopColor="#836EF9" stopOpacity={0.8} />
                </linearGradient>
              </defs>
            </BarChart>
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6B7280',
                fontSize: '14px',
              }}
            >
              No player data available
            </div>
          )}
        </ResponsiveContainer>
      </div>

      {/* 4. Win/Loss Streak */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)', marginBottom: '16px' }}
        >
          Current Win/Loss Streak
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          {streakData.length > 0 ? (
            <BarChart data={streakData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(131, 110, 249, 0.08)" />
              <XAxis type="number" stroke="#6B7280" style={{ fontSize: '12px' }} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#6B7280"
                style={{ fontSize: '11px' }}
                width={100}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="streak" radius={[0, 8, 8, 0]}>
                {streakData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.isPositive ? COLORS.positive : COLORS.negative}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6B7280',
                fontSize: '14px',
              }}
            >
              No streak data available
            </div>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
