import React from 'react';
import { Node } from '@/types/database';

export type SlotId = 'A' | 'B' | 'C';
export type NavigablePaneType = Exclude<PaneType, 'node'>;

// Stub type for delegation (delegation system removed in rah-light)
export type AgentDelegation = {
  id: number;
  sessionId: string;
  task: string;
  context: string[];
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  summary?: string | null;
  agentType: string;
  createdAt: string;
  updatedAt: string;
};

// Pane types (chat removed in rah-light)
export type PaneType = 'node' | 'contexts' | 'dimensions' | 'map' | 'views' | 'table' | 'skills';

// State for each slot
export interface SlotState {
  type: PaneType;
  // NodePane state
  nodeTabs?: number[];
  activeNodeTab?: number | null;
  // DimensionsPane state
  selectedDimension?: string | null;
  viewMode?: 'grid' | 'list' | 'kanban';
}

// Actions panes can emit to the layout
export type PaneAction =
  | { type: 'open-node'; nodeId: number; targetSlot?: SlotId }
  | { type: 'open-context'; contextId: number | null; contextName?: string | null; targetSlot?: SlotId }
  | { type: 'open-dimension'; dimension: string; targetSlot?: SlotId }
  | { type: 'switch-pane-type'; paneType: PaneType }
  | { type: 'close-pane' };

// Common props for all panes
export interface BasePaneProps {
  slot: SlotId;
  isActive: boolean;
  onPaneAction?: (action: PaneAction) => void;
  onCollapse?: () => void;
  onSwapPanes?: (source: SlotId, target: SlotId) => void;
  tabBar?: React.ReactNode;
}

// NodePane specific props
export interface NodePaneProps extends BasePaneProps {
  openTabs: number[];
  activeTab: number | null;
  onTabSelect: (nodeId: number) => void;
  onTabClose: (nodeId: number) => void;
  onNodeClick?: (nodeId: number) => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  refreshTrigger?: number;
  onOpenInOtherSlot?: (nodeId: number) => void;
  onTextSelect?: (nodeId: number, nodeTitle: string, text: string) => void;
  highlightedPassage?: HighlightedPassage | null;
}

// Highlighted passage for source awareness
export interface HighlightedPassage {
  nodeId: number;
  nodeTitle: string;
  selectedText: string;
}

// ChatPaneProps removed in rah-light

// DimensionsPane specific props
export interface DimensionsPaneProps extends BasePaneProps {
  onNodeOpen: (nodeId: number) => void;
  refreshToken: number;
  onDataChanged?: () => void;
  onDimensionSelect?: (dimensionName: string | null) => void;
}

// MapPane specific props
export interface MapPaneProps extends BasePaneProps {
  onNodeClick?: (nodeId: number) => void;
  activeTabId?: number | null;
}

// ViewsPane specific props
export interface ViewsPaneProps extends BasePaneProps {
  onNodeClick: (nodeId: number) => void;
  onNodeOpenInOtherPane?: (nodeId: number) => void;
  refreshToken?: number;
  externalContextFilterId?: number | null;
  externalDimensionFilter?: string | null;
  onContextFilterSelect?: (contextId: number | null, contextName?: string | null) => void;
  onClearExternalContextFilter?: () => void;
  onClearExternalDimensionFilter?: () => void;
}

export interface ContextsPaneProps extends BasePaneProps {
  onContextSelect?: (contextId: number | null, contextName?: string | null) => void;
}

// TablePane specific props
export interface TablePaneProps extends BasePaneProps {
  onNodeClick: (nodeId: number) => void;
  refreshToken?: number;
}

// Pane header props
export interface PaneHeaderProps {
  slot?: SlotId;
  onCollapse?: () => void;
  onSwapPanes?: (source: SlotId, target: SlotId) => void;
  tabBar?: React.ReactNode;
  children?: React.ReactNode;
  toolbarHostRef?: (node: HTMLDivElement | null) => void;
}

// Labels for pane types
export const PANE_LABELS: Record<PaneType, string> = {
  node: 'Nodes',
  contexts: 'Contexts',
  dimensions: 'Dimensions',
  map: 'Map',
  views: 'Feed',
  table: 'Table',
  skills: 'Skills',
};

// Default slot states
export const DEFAULT_SLOT_A: SlotState = {
  type: 'node',
  nodeTabs: [],
  activeNodeTab: null,
};

export const DEFAULT_SLOT_B: SlotState = {
  type: 'views',
};
