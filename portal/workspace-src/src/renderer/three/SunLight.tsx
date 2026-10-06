import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useViewportStore } from '../../state/viewportStore';

export const SunLight: React.FC = () => {
  const { sunAzimuth, sunAltitude, sunIntensity } = useViewportStore(
    (state) => state.viewport3D
  );

  const sunPosition = useMemo(() => {
    const azRad = (sunAzimuth * Math.PI) / 180;
    const altRad = (sunAltitude * Math.PI) / 180;
    const distance = 250;

    const x = distance * Math.cos(altRad) * Math.sin(azRad);
    const y = distance * Math.sin(altRad);
    const z = distance * Math.cos(altRad) * Math.cos(azRad);

    return new THREE.Vector3(x, y, z);
  }, [sunAzimuth, sunAltitude]);

  return (
    <>
      {/* Sky & Ground Ambient fill */}
      <ambientLight intensity={0.4} color="#f8fafc" />
      <hemisphereLight
        color="#bae6fd"
        groundColor="#1e293b"
        intensity={0.45}
      />

      {/* Main Directional Sun */}
      <directionalLight
        position={sunPosition}
        intensity={sunIntensity * 1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={10}
        shadow-camera-far={600}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
        shadow-bias={-0.0003}
      />
    </>
  );
};
