import React from 'react';
import { useViewportStore } from '../../state/viewportStore';

export const GisGridHelper: React.FC = () => {
  const gridVisible = useViewportStore((state) => state.viewport3D.gridVisible);
  if (!gridVisible) return null;

  return (
    <group position={[0, -0.05, 0]}>
      <gridHelper args={[260, 26, '#58636c', '#293138']} position={[0, 0, 0]} />
    </group>
  );
};
