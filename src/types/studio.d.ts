// src/types/studio.d.ts
/**
 * MANNSEJRO STUDIO 1.0 TYPE CONTRACTS
 */

export interface Point2D {
  x: number;
  y: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
}

export type ShadingMode = 'normal' | 'shadow' | 'highlight';
export type InterpolationMode = 'both' | 'start' | 'end' | 'none';

export interface BrushSettings {
  size: number;
  opacity: number;
  color: string;
  secondaryColor?: string;
  hardness: number;
  shadingMode: ShadingMode;
  interpolationMode: InterpolationMode;
  taperLength: number;
  smoothing: number;
  assistantStabilizer: boolean;
  assistantWeight: number;
  leashRadius: number;
  smartLineGuard: boolean;
  lineartMargin: number;
  pressure: boolean;
  pressureCurve: number;
}

export interface VectorStroke {
  id: string;
  tool: string;
  points: Point2D[];
  settings: Partial<BrushSettings>;
  isShape?: boolean;
  isPerspectiveShape?: boolean;
  shapeData?: {
    start: Point2D;
    end: Point2D;
    shiftKey: boolean;
  };
  nodes?: Point2D[]; // For perspective quads
}

export interface FrameLayerData {
  strokes: VectorStroke[];
  tiles: Record<string, boolean | string>; // Tile key -> presence/data
}

export interface AnimationFrame {
  id: string;
  duration: number;
  tag?: string | null;
  layerData: Record<string, FrameLayerData>; // layerId -> FrameLayerData
}

export interface AnimationLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  persistent: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  clippingMask: boolean;
  alphaLocked: boolean;
  colorTag: string | null;
}

export interface CameraKeyframe {
  frame: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export interface StudioProject {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  camera: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    locked?: boolean;
  };
  cameraTrack?: {
    enabled: boolean;
    keyframes: CameraKeyframe[];
  };
  layers: AnimationLayer[];
  frames: AnimationFrame[];
}

export interface ICommand {
  execute(): Promise<void> | void;
  undo(): Promise<void> | void;
  redo(): Promise<void> | void;
  dispose?(): void;
}
