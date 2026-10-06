import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { useViewportStore } from '../../state/viewportStore';

type RenderMaterial = THREE.Material & {
  map?: THREE.Texture | null;
  color?: THREE.Color;
  wireframe?: boolean;
};

interface RemoteTerrainMeshProps {
  objUrl: string;
  textureUrl?: string | null;
  metadataUrl?: string | null;
  visible?: boolean;
  textureVisible?: boolean;
  terrainOpacity?: number;
  textureOpacity?: number;
  onReady?: () => void;
  onStatus?: (status: 'loading' | 'ready' | 'error', message?: string) => void;
}

/**
 * Loads the real OBJ produced by the Python pipeline into the main React
 * workspace. The old portal used a separate iframe for this, which made the
 * map, pipeline and 3D scene feel like unrelated products.
 */
export const RemoteTerrainMesh: React.FC<RemoteTerrainMeshProps> = ({
  objUrl,
  textureUrl,
  metadataUrl,
  visible = true,
  textureVisible = true,
  terrainOpacity = 1,
  textureOpacity = 1,
  onReady,
  onStatus,
}) => {
  const [terrain, setTerrain] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terrainRef = useRef<THREE.Group | null>(null);
  const originalMaps = useRef(new WeakMap<THREE.Material, THREE.Texture | null>());
  const baseHorizontalScale = useRef(1);
  const sourceVerticalExaggeration = useRef(1);
  const relativeVisualScale = useRef(1);
  const wireframeVisible = useViewportStore((state) => state.viewport3D.wireframeVisible);
  const materialMode = useViewportStore((state) => state.viewport3D.materialMode);
  const verticalExaggeration = useViewportStore((state) => state.viewport3D.verticalExaggeration);

  useEffect(() => {
    let cancelled = false;
    let loaded: THREE.Group | null = null;
    let loadedTexture: THREE.Texture | null = null;
    sourceVerticalExaggeration.current = 1;
    relativeVisualScale.current = 1;
    setTerrain(null);
    setError(null);
    onStatus?.('loading');

    const disposeObject = (object: THREE.Group | null) => {
      if (!object) return;
      object.traverse((node) => {
        if (!('geometry' in node) || !('material' in node)) return;
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((rawMaterial) => {
          const material = rawMaterial as RenderMaterial;
          if (!material) return;
          if (material.map) material.map.dispose();
          material.dispose();
        });
      });
    };

    const load = async () => {
      try {
        // Load the OBJ and the generated texture independently. The MTL file
        // is kept as an export, but it must not be a runtime dependency: a
        // missing relative texture path in an MTL can leave the whole scene
        // black even though the OBJ itself loaded correctly.
        loaded = await new OBJLoader().loadAsync(objUrl);
        if (cancelled || !loaded) {
          disposeObject(loaded);
          return;
        }

        // The exporter writes X/Y as map coordinates and Z as elevation.
        // Move those coordinates into Three.js's Y-up convention directly in
        // the geometry. This avoids a hidden parent rotation affecting the
        // camera fit and keeps raycasts consistent for Walk mode.
        loaded.traverse((node) => {
          if (!('isMesh' in node) || !(node as THREE.Mesh).isMesh) return;
          const mesh = node as THREE.Mesh;
          mesh.geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        });
        loaded.rotation.set(0, 0, 0);
        loaded.position.set(0, 0, 0);
        loaded.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(loaded);
        const size = bounds.getSize(new THREE.Vector3());
        const horizontalSize = Math.max(size.x, size.z, 1);
        baseHorizontalScale.current = 240 / horizontalSize;
        if (metadataUrl) {
          try {
            const metadata = await fetch(metadataUrl).then((response) => response.json()) as {
              vertical_exaggeration?: number;
              metric_scale?: boolean;
              recommended_vertical_exaggeration?: number;
            };
            const sourceScale = Number(metadata.vertical_exaggeration);
            if (Number.isFinite(sourceScale) && sourceScale > 0) sourceVerticalExaggeration.current = sourceScale;
            if (metadata.metric_scale === false) {
              const suggestedScale = Number(metadata.recommended_vertical_exaggeration);
              if (Number.isFinite(suggestedScale) && suggestedScale > 0) {
                relativeVisualScale.current = suggestedScale;
              }
            }
          } catch {
            sourceVerticalExaggeration.current = 1;
          }
        }
        loaded.scale.set(
          baseHorizontalScale.current,
          baseHorizontalScale.current,
          baseHorizontalScale.current,
        );
        loaded.updateMatrixWorld(true);

        // Center only after scaling. Group transforms also scale the group's
        // position, so centering before scale throws the mesh far away from
        // the camera and leaves only the origin helpers visible.
        const scaledBounds = new THREE.Box3().setFromObject(loaded);
        const scaledCenter = scaledBounds.getCenter(new THREE.Vector3());
        loaded.position.sub(scaledCenter);
        loaded.updateMatrixWorld(true);

        loaded.traverse((node) => {
          if (!('isMesh' in node) || !(node as THREE.Mesh).isMesh) return;
          const mesh = node as THREE.Mesh;
          // The OBJ is transformed as a group after loading. Keep the real
          // terrain visible while the parent transform settles and rebuild
          // normals because the exporter intentionally writes a compact OBJ
          // without a separate normal stream.
          mesh.frustumCulled = false;
          mesh.geometry.computeVertexNormals();
          mesh.geometry.computeBoundingBox();
          mesh.geometry.computeBoundingSphere();
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          meshMaterials.forEach((rawMaterial) => rawMaterial?.dispose());
          // MeshBasicMaterial deliberately ignores scene lighting. It keeps
          // satellite texture readable in the dark presentation workspace and
          // makes rendering independent of whether a browser supports the
          // same light/shadow path as the standalone viewer.
          const material = new THREE.MeshBasicMaterial({
            // Mount geometry immediately. The satellite texture is loaded
            // below so a slow or failed image request cannot blank the scene.
            color: '#a7b7bd',
            side: THREE.DoubleSide,
          });
          material.fog = false;
          material.depthTest = true;
          material.depthWrite = true;
          originalMaps.current.set(material, null);
          mesh.material = material;
          mesh.visible = true;
          mesh.renderOrder = 1;
        });

        terrainRef.current = loaded;
        loaded.name = 'heightnet-generated-terrain';
        loaded.visible = true;
        loaded.renderOrder = 1;
        loaded.updateMatrixWorld(true);
        setTerrain(loaded);
        onStatus?.('ready');
        // React mounts <primitive> on the next render. Reset after that
        // render so the camera fits the actual object, not an empty scene.
        window.requestAnimationFrame(() => {
          if (!cancelled) onReady?.();
        });

        if (textureUrl) {
          try {
            loadedTexture = await new THREE.TextureLoader().loadAsync(textureUrl);
            if (cancelled || terrainRef.current !== loaded) {
              loadedTexture.dispose();
              loadedTexture = null;
              return;
            }
            loadedTexture.colorSpace = THREE.SRGBColorSpace;
            loadedTexture.anisotropy = 8;
            loadedTexture.needsUpdate = true;
            loaded.traverse((node) => {
              if (!('isMesh' in node) || !(node as THREE.Mesh).isMesh) return;
              const mesh = node as THREE.Mesh;
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              materials.forEach((rawMaterial) => {
                const material = rawMaterial as RenderMaterial;
                if (!material) return;
                originalMaps.current.set(material, loadedTexture);
                material.map = loadedTexture;
                material.color?.set('#ffffff');
                material.needsUpdate = true;
              });
            });
          } catch {
            // The neutral geometry material remains visible when the optional
            // texture cannot be decoded or downloaded.
            loadedTexture = null;
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Could not load the generated terrain.';
          console.error('[HeightNet] terrain load failed', message);
          setError(message);
          onStatus?.('error', message);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      terrainRef.current = null;
      loadedTexture?.dispose();
      disposeObject(loaded);
    };
  }, [objUrl, textureUrl, metadataUrl, onReady, onStatus]);

  useEffect(() => {
    if (!terrainRef.current) return;
    terrainRef.current.visible = visible;
  }, [terrain, visible]);

  useEffect(() => {
    if (!terrainRef.current) return;
    terrainRef.current.scale.y =
      baseHorizontalScale.current
      * verticalExaggeration
      * relativeVisualScale.current
      / sourceVerticalExaggeration.current;
  }, [terrain, verticalExaggeration]);

  useEffect(() => {
    if (!terrain) return;
    terrain.traverse((node) => {
      if (!('isMesh' in node) || !(node as THREE.Mesh).isMesh) return;
      const mesh = node as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((rawMaterial) => {
        const material = rawMaterial as RenderMaterial;
        if (!material) return;
        material.wireframe = wireframeVisible;
        const originalMap = originalMaps.current.get(material) ?? null;
        material.map = materialMode === 'satellite' && textureVisible ? originalMap : null;
        if (materialMode === 'hypsometric') material.color?.set('#6ee7b7');
        else if (materialMode === 'shaded-relief') material.color?.set('#a9b5bd');
        else if (materialMode === 'surface') material.color?.set('#778792');
        else if (!originalMap) material.color?.set('#a7b7bd');
        material.transparent = terrainOpacity < 1 || textureOpacity < 1;
        material.opacity = terrainOpacity * (materialMode === 'satellite' && textureVisible ? textureOpacity : 1);
        material.needsUpdate = true;
      });
    });
  }, [terrain, wireframeVisible, materialMode, textureVisible, terrainOpacity, textureOpacity]);

  // Loading and errors are reported by the surrounding workspace status bar.
  // Do not mount an Html portal inside the 3D scene here: swapping that portal
  // during an OBJ load can trigger a removeChild race in React and blank the
  // canvas in some browsers.
  if (error || !terrain) return null;

  return <primitive object={terrain} />;
};
