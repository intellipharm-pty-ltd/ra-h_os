"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Filter, ChevronDown, X, ArrowUpDown, GripVertical, Inbox, Check } from 'lucide-react';
import type { ContextSummary, Node } from '@/types/database';
import { getNodeIcon } from '@/utils/nodeIcons';
import { useDimensionIcons } from '@/context/DimensionIconsContext';
import { usePersistentState } from '@/hooks/usePersistentState';
import type { PendingNode } from '@/components/layout/ThreePanelLayout';
import { getNodeProcessedState } from '@/services/nodes/metadata';

type SortOrder = 'updated' | 'edges' | 'created' | 'custom' | 'processed' | 'not_processed';
type ProcessedFilter = 'all' | 'processed' | 'not_processed';

const SORT_LABELS: Record<SortOrder, string> = {
  updated: 'Updated',
  edges: 'Edges',
  created: 'Created',
  custom: 'Custom',
  processed: 'Processed',
  not_processed: 'Not Processed',
};

const DOCUMENT_MAX_WIDTH = '980px';

const pickerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '7px 10px',
  background: 'transparent',
  border: 'none',
  borderRadius: '5px',
  color: 'var(--rah-text-secondary)',
  fontSize: '12px',
  cursor: 'pointer',
  textAlign: 'left',
};

const pickerCountStyle: React.CSSProperties = {
  color: 'var(--rah-text-muted)',
  fontSize: '10px',
  background: 'var(--rah-bg-active)',
  padding: '1px 6px',
  borderRadius: '10px',
};

interface ColumnFilter {
  id: string;
  dimension: string;
}

interface DimensionSummary {
  dimension: string;
  count: number;
  isPriority: boolean;
  description?: string | null;
}

interface ViewsOverlayProps {
  onNodeClick: (nodeId: number) => void;
  onNodeOpenInOtherPane?: (nodeId: number) => void;
  refreshToken?: number;
  pendingNodes?: PendingNode[];
  onDismissPending?: (id: string) => void;
  externalContextFilterId?: number | null;
  externalDimensionFilter?: string | null;
  onContextFilterSelect?: (contextId: number | null, contextName?: string | null) => void;
  onClearExternalContextFilter?: () => void;
  onClearExternalDimensionFilter?: () => void;
  toolbarHost?: HTMLDivElement | null;
}

const INPUT_TYPE_LABELS: Record<string, string> = {
  youtube: 'Extracting YouTube video...',
  website: 'Extracting webpage...',
  pdf: 'Processing PDF...',
  note: 'Creating note...',
  chat: 'Importing transcript...',
};

function PendingNodeCard({ pending, onDismiss }: { pending: PendingNode; onDismiss?: () => void }) {
  const isError = pending.status === 'error';
  const label = isError
    ? pending.error || 'Processing failed'
    : INPUT_TYPE_LABELS[pending.inputType] || 'Processing...';

  // Truncate input for display
  const displayInput = pending.input.length > 80
    ? pending.input.slice(0, 77) + '...'
    : pending.input;

  return (
    <div
      style={{
        padding: '10px 12px',
        background: isError ? 'rgba(239, 68, 68, 0.04)' : 'rgba(34, 197, 94, 0.03)',
        borderBottom: '1px solid var(--rah-border)',
        borderLeft: isError ? '3px solid rgba(239, 68, 68, 0.4)' : '3px solid rgba(34, 197, 94, 0.3)',
        borderTop: '2px solid transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: isError ? 'rgba(239, 68, 68, 0.1)' : 'var(--rah-bg-panel)',
          border: isError ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid var(--rah-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {isError ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            <span className="pending-node-spinner" />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '2px',
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 500,
              color: isError ? '#ef4444' : 'var(--rah-text-active)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              minWidth: 0,
            }}>
              {displayInput}
            </span>
            {isError && onDismiss && (
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--rah-text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  fontSize: '11px',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--rah-text-muted)'; }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div style={{
            fontSize: '11px',
            color: isError ? 'rgba(239, 68, 68, 0.7)' : 'var(--rah-accent-green)',
            lineHeight: '1.4',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            {label}
          </div>
        </div>
      </div>
      <style jsx>{`
        .pending-node-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid var(--rah-accent-green);
          border-top-color: transparent;
          border-radius: 50%;
          animation: pendingSpin 0.8s linear infinite;
        }
        @keyframes pendingSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rah-skeleton"
      style={{
        padding: '12px 14px',
        border: '1px solid var(--rah-border)',
        borderLeft: '2px solid var(--rah-border)',
        borderRadius: '10px',
        background: 'var(--rah-bg-base)',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: 'var(--rah-bg-elevated)',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ height: '14px', width: '58%', borderRadius: '4px', background: 'var(--rah-bg-elevated)', marginBottom: '8px' }} />
        <div style={{ height: '12px', width: '82%', borderRadius: '4px', background: 'var(--rah-bg-elevated)', marginBottom: '6px' }} />
        <div style={{ height: '11px', width: '28%', borderRadius: '4px', background: 'var(--rah-bg-elevated)' }} />
      </div>
    </div>
  );
}

export default function ViewsOverlay({
  onNodeClick,
  onNodeOpenInOtherPane,
  refreshToken = 0,
  pendingNodes,
  onDismissPending,
  externalContextFilterId = null,
  externalDimensionFilter = null,
  onContextFilterSelect,
  onClearExternalContextFilter,
  onClearExternalDimensionFilter,
  toolbarHost,
}: ViewsOverlayProps) {
  const { dimensionIcons } = useDimensionIcons();

  // Dimensions for filter picker
  const [dimensions, setDimensions] = useState<DimensionSummary[]>([]);
  const [dimensionsLoading, setDimensionsLoading] = useState(true);
  const [contexts, setContexts] = useState<ContextSummary[]>([]);
  const [contextsLoading, setContextsLoading] = useState(true);

  // Sort order (persisted)
  const [sortOrder, setSortOrder] = usePersistentState<SortOrder>('ui.feedSortOrder', 'updated');

  // Custom order (persisted) — stores node IDs in user-defined order
  const [customOrder, setCustomOrder] = usePersistentState<number[]>('ui.feedCustomOrder', []);

  // Drag-to-reorder state
  const [reorderDragIndex, setReorderDragIndex] = useState<number | null>(null);
  const [reorderDropIndex, setReorderDropIndex] = useState<number | null>(null);

  // Filter system state
  const [columns, setColumns] = useState<ColumnFilter[]>([]);
  const [filteredNodes, setFilteredNodes] = useState<Node[]>([]);
  const [filteredNodesLoading, setFilteredNodesLoading] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [showDimensionPicker, setShowDimensionPicker] = useState(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const processedFilter: ProcessedFilter = sortOrder === 'processed'
    ? 'processed'
    : sortOrder === 'not_processed'
      ? 'not_processed'
      : 'all';

  // Derive selectedFilters for backward compatibility (unique dimensions)
  const selectedFilters = useMemo(() => {
    if (externalDimensionFilter) {
      return [externalDimensionFilter];
    }

    return [...new Set(columns.map(c => c.dimension))];
  }, [columns, externalDimensionFilter]);

  // Sorted dimensions (locked first)
  const sortedDimensions = useMemo(() => {
    return [...dimensions].sort((a, b) => {
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      return a.dimension.localeCompare(b.dimension);
    });
  }, [dimensions]);

  // Fetch functions
  const fetchDimensions = useCallback(async () => {
    setDimensionsLoading(true);
    try {
      const response = await fetch('/api/dimensions');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch dimensions');
      }
      setDimensions(data.data || []);
    } catch (error) {
      console.error('Error fetching dimensions:', error);
    } finally {
      setDimensionsLoading(false);
    }
  }, []);

  const fetchContexts = useCallback(async () => {
    setContextsLoading(true);
    try {
      const response = await fetch('/api/contexts');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch contexts');
      }
      setContexts(data.data || []);
    } catch (error) {
      console.error('Error fetching contexts:', error);
    } finally {
      setContextsLoading(false);
    }
  }, []);

  const applyProcessedFilter = useCallback((nodes: Node[]) => {
    if (processedFilter === 'all') return nodes;
    return nodes.filter((node) => getNodeProcessedState(node.metadata) === processedFilter);
  }, [processedFilter]);

  const fetchAllNodes = useCallback(async () => {
    setFilteredNodesLoading(true);
    try {
      // Custom sort fetches with 'updated' then reorders client-side
      const apiSort = sortOrder === 'custom' || sortOrder === 'processed' || sortOrder === 'not_processed'
        ? 'updated'
        : sortOrder;
      const response = await fetch(`/api/nodes?limit=500&sortBy=${apiSort}${externalContextFilterId ? `&contextId=${externalContextFilterId}` : ''}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      const nodes: Node[] = data.data || [];
      if (sortOrder === 'custom' && customOrder.length > 0) {
        // Reorder nodes based on saved custom order
        const orderMap = new Map(customOrder.map((id, idx) => [id, idx]));
        const ordered: Node[] = [];
        const unordered: Node[] = [];
        for (const node of nodes) {
          if (orderMap.has(node.id)) {
            ordered.push(node);
          } else {
            unordered.push(node); // New nodes not in custom order — append at bottom
          }
        }
        ordered.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        setFilteredNodes(applyProcessedFilter([...ordered, ...unordered]));
      } else {
        setFilteredNodes(applyProcessedFilter(nodes));
      }
    } catch (error) {
      console.error('Error fetching nodes:', error);
    } finally {
      setFilteredNodesLoading(false);
    }
  }, [sortOrder, customOrder, applyProcessedFilter, externalContextFilterId]);

  const fetchFilteredNodes = useCallback(async (filters: string[]) => {
    if (filters.length === 0) {
      fetchAllNodes();
      return;
    }
    setFilteredNodesLoading(true);
    try {
      const apiSort = sortOrder === 'custom' || sortOrder === 'processed' || sortOrder === 'not_processed'
        ? 'updated'
        : sortOrder;
      const response = await fetch(`/api/nodes?limit=500&sortBy=${apiSort}&dimensions=${encodeURIComponent(filters.join(','))}&dimensionsMatch=all${externalContextFilterId ? `&contextId=${externalContextFilterId}` : ''}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      const nodes: Node[] = data.data || [];
      if (sortOrder === 'custom' && customOrder.length > 0) {
        const orderMap = new Map(customOrder.map((id, idx) => [id, idx]));
        const ordered: Node[] = [];
        const unordered: Node[] = [];
        for (const node of nodes) {
          if (orderMap.has(node.id)) {
            ordered.push(node);
          } else {
            unordered.push(node);
          }
        }
        ordered.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        setFilteredNodes(applyProcessedFilter([...ordered, ...unordered]));
      } else {
        setFilteredNodes(applyProcessedFilter(nodes));
      }
    } catch (error) {
      console.error('Error fetching filtered nodes:', error);
    } finally {
      setFilteredNodesLoading(false);
    }
  }, [fetchAllNodes, sortOrder, customOrder, applyProcessedFilter, externalContextFilterId]);

  // Stringify filters for stable dependency
  const filtersKey = selectedFilters.join(',');

  // Fetch dimensions on mount
  useEffect(() => {
    fetchDimensions();
  }, [fetchDimensions]);

  useEffect(() => {
    fetchContexts();
  }, [fetchContexts]);

  // Fetch nodes on mount and when filters/sort/refreshToken change
  useEffect(() => {
    if (refreshToken > 0) {
      console.log('🔄 Feed refreshing due to SSE event (refreshToken:', refreshToken, ')');
    }
    if (selectedFilters.length > 0) {
      fetchFilteredNodes(selectedFilters);
    } else {
      fetchAllNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, sortOrder, refreshToken, externalContextFilterId]);

  // Also refresh dimensions when data changes (for filter picker counts)
  useEffect(() => {
    if (refreshToken > 0) {
      fetchDimensions();
      fetchContexts();
    }
  }, [refreshToken, fetchDimensions, fetchContexts]);

  // Column management
  const addColumn = (dimension: string) => {
    if (externalDimensionFilter) {
      return;
    }

    const newColumn: ColumnFilter = {
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dimension
    };
    setColumns([...columns, newColumn]);
    setShowFilterPicker(false);
    setFilterSearchQuery('');
  };

  const removeFilter = (dimension: string) => {
    if (externalDimensionFilter && dimension === externalDimensionFilter) {
      onClearExternalDimensionFilter?.();
      return;
    }

    const idx = columns.findIndex(c => c.dimension === dimension);
    if (idx !== -1) {
      setColumns(columns.filter((_, i) => i !== idx));
    }
  };

  const clearFilters = () => {
    if (externalContextFilterId) {
      onClearExternalContextFilter?.();
    }

    if (externalDimensionFilter) {
      onClearExternalDimensionFilter?.();
    }

    setColumns([]);
  };

  // Filter dimensions for picker
  const filterPickerDimensions = sortedDimensions.filter(d =>
    d.dimension.toLowerCase().includes(filterSearchQuery.toLowerCase())
  );

  // Close dropdowns on outside click
  const filterPickerRef = useRef<HTMLDivElement>(null);
  const dimensionPickerRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showFilterPicker && filterPickerRef.current && !filterPickerRef.current.contains(e.target as HTMLElement)) {
        setShowFilterPicker(false);
        setFilterSearchQuery('');
      }
      if (showDimensionPicker && dimensionPickerRef.current && !dimensionPickerRef.current.contains(e.target as HTMLElement)) {
        setShowDimensionPicker(false);
      }
      if (showSortDropdown && sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as HTMLElement)) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDimensionPicker, showFilterPicker, showSortDropdown]);

  // Reorder handlers
  const handleReorderDrop = useCallback((dropIdx: number) => {
    if (reorderDragIndex === null || reorderDragIndex === dropIdx) {
      setReorderDragIndex(null);
      setReorderDropIndex(null);
      return;
    }
    // Reorder filteredNodes and persist
    const newNodes = [...filteredNodes];
    const [moved] = newNodes.splice(reorderDragIndex, 1);
    newNodes.splice(dropIdx > reorderDragIndex ? dropIdx - 1 : dropIdx, 0, moved);
    setFilteredNodes(newNodes);
    setCustomOrder(newNodes.map(n => n.id));
    setReorderDragIndex(null);
    setReorderDropIndex(null);
  }, [reorderDragIndex, filteredNodes, setCustomOrder]);

  const toggleNodeProcessed = useCallback(async (node: Node) => {
    const nextState = getNodeProcessedState(node.metadata) === 'processed' ? 'not_processed' : 'processed';

    setFilteredNodes((prev) => prev.map((candidate) => (
      candidate.id === node.id
        ? {
            ...candidate,
            metadata: {
              ...(candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : {}),
              state: nextState,
            },
          }
        : candidate
    )));

    try {
      const response = await fetch(`/api/nodes/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: {
            state: nextState,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update processed state');
      }

      const result = await response.json();
      if (result.node) {
        setFilteredNodes((prev) => prev.map((candidate) => (
          candidate.id === node.id ? result.node as Node : candidate
        )));
      }
    } catch (error) {
      console.error('Error updating processed state from feed:', error);
      if (selectedFilters.length > 0) {
        void fetchFilteredNodes(selectedFilters);
      } else {
        void fetchAllNodes();
      }
    }
  }, [fetchAllNodes, fetchFilteredNodes, selectedFilters]);

  // Render node card
  const renderNodeCard = (node: Node, index: number) => {
    const nodeIcon = getNodeIcon(node, dimensionIcons, 14);
    const isCustomSort = sortOrder === 'custom';
    const isDragSource = reorderDragIndex === index;
    const isDropTarget = reorderDropIndex === index;
    const processedState = getNodeProcessedState(node.metadata);
    const isProcessed = processedState === 'processed';

    // Description preview — first meaningful line, truncated
    const descPreview = node.description && node.description.length > 10
      ? node.description.slice(0, 120) + (node.description.length > 120 ? '...' : '')
      : null;

    return (
      <div
        key={node.id}
        onClick={() => onNodeClick(node.id)}
        draggable
        onDragStart={(e) => {
          const title = node.title || 'Untitled';
          e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: node.id, title }));
          e.dataTransfer.setData('application/node-info', JSON.stringify({ id: node.id, title, dimensions: node.dimensions || [] }));
          e.dataTransfer.setData('text/plain', `[NODE:${node.id}:"${title}"]`);
        }}
        onDragOver={(e) => {
          if (!isCustomSort || reorderDragIndex === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setReorderDropIndex(index);
        }}
        onDragLeave={() => {
          if (!isCustomSort) return;
          setReorderDropIndex(null);
        }}
        onDrop={(e) => {
          if (!isCustomSort || reorderDragIndex === null) return;
          e.preventDefault();
          handleReorderDrop(index);
        }}
        style={{
          padding: '10px 12px',
          background: isProcessed ? 'rgba(74, 222, 128, 0.045)' : 'var(--rah-bg-base)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          border: '1px solid var(--rah-border)',
          borderLeft: `2px solid ${isProcessed ? 'rgba(74, 222, 128, 0.6)' : 'var(--rah-border-stronger)'}`,
          borderRadius: '10px',
          opacity: isDragSource ? 0.4 : 1,
          borderTop: isDropTarget ? '2px solid var(--rah-accent-green)' : '2px solid transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--rah-bg-surface)';
          e.currentTarget.style.borderColor = 'var(--rah-border-strong)';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = 'var(--rah-shadow-floating)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--rah-bg-base)';
          e.currentTarget.style.borderColor = 'var(--rah-border)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onNodeOpenInOtherPane) {
            onNodeOpenInOtherPane(node.id);
          }
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
          {/* Grip handle — only in custom sort mode */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            {isCustomSort && (
              <div
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  setReorderDragIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('application/x-rah-reorder', String(index));
                }}
                onDragEnd={() => {
                  setReorderDragIndex(null);
                  setReorderDropIndex(null);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '16px',
                  cursor: 'grab',
                  color: 'var(--rah-text-muted)',
                  flexShrink: 0,
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--rah-text-soft)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--rah-text-muted)'; }}
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical size={14} />
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void toggleNodeProcessed(node);
              }}
              title="Toggle processed"
              aria-label="Toggle processed"
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '999px',
                border: `1px solid ${isProcessed ? 'rgba(74, 222, 128, 0.55)' : 'var(--rah-border-strong)'}`,
                background: isProcessed ? 'rgba(74, 222, 128, 0.16)' : 'var(--rah-bg-panel)',
                color: isProcessed ? '#86efac' : 'transparent',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Check size={11} strokeWidth={2.8} />
            </button>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: 0,
              flex: 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--rah-text-active)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: 1,
                  minWidth: 0,
                }}>
                  {node.title || 'Untitled'}
                </span>
                {node.context?.name ? (
                  <span style={{
                    fontSize: '10px',
                    lineHeight: 1.2,
                    padding: '3px 7px',
                    borderRadius: '999px',
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.18)',
                    color: 'var(--rah-accent-green)',
                    flexShrink: 0,
                    maxWidth: '40%',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {node.context.name}
                  </span>
                ) : null}
              </div>
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'var(--rah-bg-panel)',
                border: '1px solid var(--rah-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {nodeIcon}
              </div>
              <span style={{
                fontSize: '10px',
                color: 'var(--rah-text-muted)',
                background: 'var(--rah-bg-panel)',
                padding: '2px 6px',
                borderRadius: '999px',
                fontFamily: 'monospace',
                flexShrink: 0,
                lineHeight: 1.2,
              }}>
                #{node.id}
              </span>
              {node.edge_count != null && node.edge_count > 0 && (
                <span style={{
                  minWidth: '18px',
                  height: '18px',
                  padding: '0 5px',
                  borderRadius: '999px',
                  background: 'var(--rah-accent-green-soft)',
                  border: '1px solid var(--rah-accent-green-soft-strong)',
                  color: 'var(--rah-accent-green)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '11px',
                  fontWeight: 600,
                }}>
                  {node.edge_count}
                </span>
              )}
            </div>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: 0,
          }}>
            <div style={{
              fontSize: '12px',
              color: 'var(--rah-text-muted)',
              lineHeight: '1.35',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}>
              {descPreview || 'No description'}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              minWidth: 0,
              maxWidth: '46%',
              overflow: 'hidden',
              flexShrink: 1,
              whiteSpace: 'nowrap',
            }}>
              {node.dimensions && node.dimensions.length > 0 ? (
                <>
                  {node.dimensions.map(d => (
                    <span
                      key={d}
                      style={{
                        fontSize: '10px',
                        padding: '2px 7px',
                        background: 'var(--rah-bg-active)',
                        border: '1px solid var(--rah-border-strong)',
                        color: 'var(--rah-text-base)',
                        borderRadius: '999px',
                        flexShrink: 0,
                      }}
                    >
                      {d}
                    </span>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const toolbar = (
    <div style={{ width: '100%', maxWidth: DOCUMENT_MAX_WIDTH, margin: '0 auto' }}>
      <div style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative' }} ref={filterPickerRef}>
            <button
              onClick={() => setShowFilterPicker(!showFilterPicker)}
              title="Context"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid var(--rah-border)',
                borderRadius: '5px',
                color: 'var(--rah-text-soft)',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Filter size={11} />
              {externalContextFilterId
                ? (contexts.find((context) => context.id === externalContextFilterId)?.name || 'Context')
                : 'Context'}
              <ChevronDown size={10} />
            </button>

            {showFilterPicker && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: 'var(--rah-bg-panel)',
                border: '1px solid var(--rah-border)',
                borderRadius: '10px',
                padding: '6px',
                minWidth: '220px',
                maxHeight: '320px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
              }}>
                {contextsLoading ? (
                  <div style={{ padding: '12px', color: 'var(--rah-text-muted)', fontSize: '12px', textAlign: 'center' }}>
                    Loading contexts...
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        onContextFilterSelect?.(null, null);
                        setShowFilterPicker(false);
                      }}
                      style={pickerRowStyle}
                    >
                      <span>All contexts</span>
                    </button>
                    {contexts.map((context) => (
                      <button
                        key={context.id}
                        onClick={() => {
                          onContextFilterSelect?.(context.id, context.name);
                          setShowFilterPicker(false);
                        }}
                        style={{
                          ...pickerRowStyle,
                          background: externalContextFilterId === context.id ? 'rgba(255,255,255,0.04)' : 'transparent',
                          color: externalContextFilterId === context.id ? 'var(--rah-text-active)' : 'var(--rah-text-secondary)',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>
                          {context.name}
                        </span>
                        <span style={pickerCountStyle}>{context.count}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {externalContextFilterId ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                background: 'rgba(34, 197, 94, 0.06)',
                border: '1px solid rgba(34, 197, 94, 0.12)',
                borderRadius: '5px',
                fontSize: '11px',
                color: '#5a9'
              }}
            >
              {contexts.find((context) => context.id === externalContextFilterId)?.name || 'Context'}
              <button
                onClick={() => onClearExternalContextFilter?.()}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#5a9',
                  cursor: 'pointer',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={11} />
              </button>
            </div>
          ) : null}

          {selectedFilters.map(filter => (
            <div
              key={filter}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                background: 'rgba(34, 197, 94, 0.06)',
                border: '1px solid rgba(34, 197, 94, 0.12)',
                borderRadius: '5px',
                fontSize: '11px',
                color: '#5a9'
              }}
            >
              {filter}
              <button
                onClick={() => removeFilter(filter)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#5a9',
                  cursor: 'pointer',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#5a9'; }}
              >
                <X size={11} />
              </button>
            </div>
          ))}

          <div style={{ position: 'relative' }} ref={dimensionPickerRef}>
            <button
              onClick={() => {
                setShowDimensionPicker(!showDimensionPicker);
              }}
              title="Dimensions"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid var(--rah-border)',
                borderRadius: '5px',
                color: 'var(--rah-text-soft)',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'var(--rah-border-strong)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--rah-border)';
              }}
            >
              <Filter size={11} />
              Dimension
              <ChevronDown size={10} />
            </button>

            {showDimensionPicker && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: 'var(--rah-bg-panel)',
                border: '1px solid var(--rah-border)',
                borderRadius: '10px',
                padding: '6px',
                minWidth: '220px',
                maxHeight: '320px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
              }}>
                <input
                  type="text"
                  value={filterSearchQuery}
                  onChange={(e) => setFilterSearchQuery(e.target.value)}
                  placeholder="Search dimensions..."
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: 'var(--rah-bg-base)',
                    border: '1px solid transparent',
                    borderRadius: '6px',
                    color: 'var(--rah-text-active)',
                    fontSize: '12px',
                    marginBottom: '4px',
                    outline: 'none',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--rah-border-strong)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
                />
                {dimensionsLoading ? (
                  <div style={{ padding: '12px', color: 'var(--rah-text-muted)', fontSize: '12px', textAlign: 'center' }}>
                    Loading dimensions...
                  </div>
                ) : filterPickerDimensions.length === 0 ? (
                  <div style={{ padding: '12px', color: 'var(--rah-text-muted)', fontSize: '12px', textAlign: 'center' }}>
                    {filterSearchQuery ? 'No matching dimensions' : 'No dimensions available'}
                  </div>
                ) : (
                  filterPickerDimensions.map(d => (
                    <button
                      key={d.dimension}
                      onClick={() => addColumn(d.dimension)}
                      style={pickerRowStyle}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{d.dimension}</span>
                      <span style={pickerCountStyle}>{d.count}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {(selectedFilters.length > 0 || externalContextFilterId) && (
          <button
            onClick={clearFilters}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: 'none',
              color: 'var(--rah-text-muted)',
              fontSize: '11px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--rah-text-muted)'; }}
          >
            Clear all
          </button>
        )}

        {/* Sort dropdown */}
        <div style={{ position: 'relative' }} ref={sortDropdownRef}>
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              background: 'transparent',
              border: '1px solid var(--rah-border)',
              borderRadius: '5px',
              color: 'var(--rah-text-soft)',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.borderColor = 'var(--rah-border-strong)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--rah-border)';
            }}
          >
            <ArrowUpDown size={11} />
            {SORT_LABELS[sortOrder]}
            <ChevronDown size={10} />
          </button>

          {showSortDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: 'var(--rah-bg-panel)',
              border: '1px solid var(--rah-border)',
              borderRadius: '10px',
              padding: '4px',
              minWidth: '140px',
              zIndex: 1000,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
            }}>
              {(Object.keys(SORT_LABELS) as SortOrder[]).map(key => (
                <button
                  key={key}
                  onClick={() => {
                    setSortOrder(key);
                    setShowSortDropdown(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '7px 10px',
                    background: sortOrder === key ? 'rgba(255,255,255,0.04)' : 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: sortOrder === key ? 'var(--rah-text-active)' : 'var(--rah-text-soft)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = sortOrder === key ? 'rgba(255,255,255,0.04)' : 'transparent'; }}
                >
                  {sortOrder === key && <span style={{ color: 'var(--rah-accent-green)', fontSize: '12px' }}>✓</span>}
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'transparent'
    }}>
      {toolbarHost ? createPortal(toolbar, toolbarHost) : (
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--rah-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap'
        }}>
          {toolbar}
        </div>
      )}

      {/* Content area — list view */}
      {filteredNodesLoading ? (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
        }}>
          <div style={{ width: '100%', maxWidth: DOCUMENT_MAX_WIDTH, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        </div>
      ) : filteredNodes.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '40px 20px',
          color: 'var(--rah-text-muted)',
          textAlign: 'center',
        }}>
          <div style={{ width: '100%', maxWidth: DOCUMENT_MAX_WIDTH, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Inbox size={28} strokeWidth={1.5} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: '14px', color: 'var(--rah-text-secondary)' }}>
              {selectedFilters.length > 0 ? 'Nothing matches these filters' : 'Nothing here yet'}
            </span>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>
              {selectedFilters.length > 0 ? 'Try adjusting your filters, or add a node with ⌘N' : 'Add a node with ⌘N to get started'}
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
        }}>
          <div style={{ width: '100%', maxWidth: DOCUMENT_MAX_WIDTH, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingNodes && pendingNodes.length > 0 && pendingNodes.map(p => (
              <PendingNodeCard
                key={p.id}
                pending={p}
                onDismiss={onDismissPending ? () => onDismissPending(p.id) : undefined}
              />
            ))}
            {filteredNodes.map((node, index) => renderNodeCard(node, index))}
          </div>
        </div>
      )}
    </div>
  );
}
