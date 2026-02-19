// Core data model types — mirrors spec Section 4

export interface TuftColor {
  id: string;
  rgb: [number, number, number];
  hex: string;
  pixelCount: number;
  name?: string;
}

export interface Layer {
  colorId: string;
  bitmap: string; // base64 PNG
  vectorOutline?: string; // SVG path data
}

export interface YarnEstimate {
  colorId: string;
  area: number; // square inches
  estimatedYards: number;
  percentCoverage: number;
}

export interface TuftProject {
  id: string;
  originalImage: string; // base64
  width: number;
  height: number;
  unit: 'in' | 'cm';
  paletteSize: number;
  palette: TuftColor[];
  minThickness: number; // mm
  regionThreshold: number; // 0-1 percentage
  useYarnPalette: boolean;
  processedImage?: string; // base64
  processedLayers: Layer[];
  yarnEstimates: YarnEstimate[];
  outlineSvg?: string; // SVG markup for color boundaries
}

// API request/response types

export interface ProcessRequest {
  image: string; // base64
  width: number;
  height: number;
  unit: 'in' | 'cm';
  paletteSize: number;
  minThickness: number;
  regionThreshold: number;
  useYarnPalette: boolean;
}

export interface ProcessResponse {
  processedImage: string; // base64
  palette: TuftColor[];
  layers: Layer[];
  yarnEstimates: YarnEstimate[];
  outlineSvg: string;
}

// UI state types

export type EditorTab = 'palette' | 'settings' | 'export';

export type ProcessingStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}
