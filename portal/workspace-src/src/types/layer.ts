export type LayerType =
  | 'raster'
  | 'depth'
  | 'terrain'
  | 'texture'
  | 'wireframe'
  | 'contours'
  | 'water'
  | 'grid';

export type ViewTarget = 'MAP' | '2D' | '3D' | 'both';

export interface LayerItemData {
  id: string;
  name: string;
  type: LayerType;
  viewTarget: ViewTarget;
  visible: boolean;
  opacity: number; // 0 to 1
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
  color?: string;
  locked?: boolean;
  description: string;
  typeBadge: string;
}
