import React from 'react';
import { useGameStore } from '../../hooks/useGameStore';

interface TableTabProps {
  tableId: string;
  tableName: string;
  handNumber: number;
  phase: string;
  isActive: boolean;
  isInProgress: boolean;
  onClick: () => void;
}

const TableTab: React.FC<TableTabProps> = ({
  tableId,
  tableName,
  handNumber,
  phase,
  isActive,
  isInProgress,
  onClick,
}) => {
  const getPhaseBadgeColor = (phase: string): string => {
    switch (phase?.toLowerCase()) {
      case 'preflop':
        return 'bg-purple-500/20 text-purple-300';
      case 'flop':
        return 'bg-pink-500/20 text-pink-300';
      case 'turn':
        return 'bg-blue-500/20 text-blue-300';
      case 'river':
        return 'bg-cyan-500/20 text-cyan-300';
      case 'showdown':
        return 'bg-green-500/20 text-green-300';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <button
      onClick={onClick}
      className={`
        relative px-4 py-2.5 text-xs font-medium transition-all duration-200
        border-b-2 flex items-center gap-2 min-w-[140px]
        ${
          isActive
            ? 'border-[#836EF9] text-white bg-gradient-to-b from-[#836EF9]/10 to-transparent'
            : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-white/5'
        }
      `}
    >
      {/* Status indicator dot */}
      <div
        className={`
          w-2 h-2 rounded-full flex-shrink-0
          ${isInProgress ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}
        `}
      />

      {/* Table info */}
      <div className="flex flex-col items-start gap-0.5">
        <div className="font-semibold">{tableName}</div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">
            Hand #{handNumber}
          </span>
          {phase && (
            <>
              <span className="text-gray-600">•</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${getPhaseBadgeColor(
                  phase
                )}`}
              >
                {phase}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
};

export const TableTabBar: React.FC = () => {
  const { state, dispatch } = useGameStore();
  const { arenaTables, activeTableId } = state;

  const tableIds = Object.keys(arenaTables || {}).sort();

  if (tableIds.length === 0) {
    return null;
  }

  const getTableName = (tableId: string): string => {
    const match = tableId.match(/table[-_]?(\d+)/i);
    if (match) {
      return `Table ${match[1]}`;
    }
    return tableId.charAt(0).toUpperCase() + tableId.slice(1);
  };

  const isHandInProgress = (phase: string | null | undefined): boolean => {
    if (!phase) return false;
    const lowerPhase = phase.toLowerCase();
    return ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(lowerPhase);
  };

  const handleTabClick = (tableId: string) => {
    if (tableIds.length === 1) return; // No switching if only one table
    dispatch({ type: 'SET_ACTIVE_TABLE', payload: tableId });
  };

  return (
    <div
      className="glass-panel border-b border-[rgba(131,110,249,0.12)]"
      style={{
        backgroundColor: 'rgba(15, 12, 46, 0.7)',
      }}
    >
      <div className="flex items-stretch overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {tableIds.map((tableId) => {
          const tableData = arenaTables[tableId];
          if (!tableData) return null;

          return (
            <TableTab
              key={tableId}
              tableId={tableId}
              tableName={getTableName(tableId)}
              handNumber={tableData.handNumber || 0}
              phase={tableData.phase || 'Idle'}
              isActive={activeTableId === tableId}
              isInProgress={isHandInProgress(tableData.phase)}
              onClick={() => handleTabClick(tableId)}
            />
          );
        })}
      </div>

      {/* Gradient underline for active tab effect */}
      <div
        className="h-px bg-gradient-to-r from-transparent via-[#836EF9] to-transparent opacity-30"
        style={{
          width: '100%',
        }}
      />
    </div>
  );
};

export default TableTabBar;
