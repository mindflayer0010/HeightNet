import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { RemoteTerrainMesh } from './RemoteTerrainMesh';
import { SunLight } from './SunLight';
import { GisGridHelper } from './GisGridHelper';
import { CameraController } from './CameraController';
import { useProjectStore } from '../../state/projectStore';
import { useViewportStore } from '../../state/viewportStore';
import { useLayerStore } from '../../state/layerStore';
import { artifactUrl, type PipelineResult } from '../../integration/api';

interface TerrainSceneProps {
  paneId?: string;
  resultOverride?: PipelineResult | null;
}

export const TerrainScene: React.FC<TerrainSceneProps> = ({ paneId, resultOverride = null }) => {
  const projectOutputs = useProjectStore((state) => state.project.outputs);
  const outputs = resultOverride
    ? {
        mesh: artifactUrl(resultOverride.mesh),
        texture: artifactUrl(resultOverride.texture),
        meshMetadata: artifactUrl(resultOverride.mesh_metadata),
      }
    : projectOutputs;
  const resetCamera3D = useViewportStore((state) => state.resetCamera3D);
  const hasGeneratedMesh = Boolean(outputs.mesh);
  const layers = useLayerStore((state) => state.layers);
  const terrainVisible = layers.find((layer) => layer.id === 'layer-terrain-mesh')?.visible ?? true;
  const textureVisible = layers.find((layer) => layer.id === 'layer-surface-texture')?.visible ?? true;
  const terrainOpacity = layers.find((layer) => layer.id === 'layer-terrain-mesh')?.opacity ?? 1;
  const textureOpacity = layers.find((layer) => layer.id === 'layer-surface-texture')?.opacity ?? 1;
  const [terrainStatus, setTerrainStatus] = useState<'empty' | 'loading' | 'ready' | 'error'>(hasGeneratedMesh ? 'loading' : 'empty');
  const [terrainError, setTerrainError] = useState('');

  useEffect(() => {
    setTerrainStatus(hasGeneratedMesh ? 'loading' : 'empty');
    setTerrainError('');
  }, [hasGeneratedMesh, outputs.mesh]);

  const handleTerrainStatus = useCallback((status: 'loading' | 'ready' | 'error', message?: string) => {
    setTerrainStatus(status);
    setTerrainError(message ?? '');
  }, []);

  return (
    <div className="three-canvas-container" tabIndex={0}>
      <Canvas
        camera={{ position: [130, 95, 150], fov: 45, near: 0.5, far: 1200 }}
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor('#172126');
          scene.fog = new THREE.FogExp2('#172126', 0.0016);
        }}
      >
        <Suspense fallback={null}>
          <SunLight />
          {hasGeneratedMesh && outputs.mesh ? (
            <RemoteTerrainMesh
              objUrl={outputs.mesh}
              textureUrl={outputs.texture}
              metadataUrl={outputs.meshMetadata}
              visible={terrainVisible}
              textureVisible={textureVisible}
              terrainOpacity={terrainOpacity}
              textureOpacity={textureOpacity}
              onReady={resetCamera3D}
              onStatus={handleTerrainStatus}
            />
          ) : null}
          {hasGeneratedMesh ? <GisGridHelper /> : null}
          <CameraController paneId={paneId} />

          {/* Orientation Gizmo in bottom right */}
          <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
            <GizmoViewport
              axisColors={['#ef4444', '#10b981', '#3b82f6']}
              labelColor="#ffffff"
            />
          </GizmoHelper>
        </Suspense>
      </Canvas>
      {terrainStatus === 'loading' ? (
        <div className="terrain-load-state" role="status">
          <span className="terrain-load-dot" />
          <span>Loading the generated terrain...</span>
        </div>
      ) : null}
      {terrainStatus === 'error' ? (
        <div className="terrain-load-state terrain-load-error" role="alert">
          <strong>Terrain could not be displayed</strong>
          <span>{terrainError || 'The OBJ or texture could not be loaded.'}</span>
          <span>Check that the HeightNet server is still running, then refresh.</span>
        </div>
      ) : null}
    </div>
  );
};
