import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useViewportStore } from '../../state/viewportStore';
import { useWorkspaceStore } from '../../state/workspaceStore';

function readTerrainSurfaceY(scene: THREE.Scene, x: number, z: number): number | null {
  const terrain = scene.getObjectByName('heightnet-generated-terrain');
  if (!terrain) return null;

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(x, 10000, z),
    new THREE.Vector3(0, -1, 0),
  );
  const hit = raycaster.intersectObject(terrain, true)[0];
  return hit?.point.y ?? null;
}

interface CameraControllerProps {
  paneId?: string;
}

export const CameraController: React.FC<CameraControllerProps> = ({ paneId = 'terrain' }) => {
  const { camera, gl, scene } = useThree();
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const fittedTerrain = useRef<THREE.Object3D | null>(null);
  const fitTarget = useRef<THREE.Vector3 | null>(null);

  const {
    cameraMode,
    cameraFov,
    cameraSpeed,
    autoOrbit,
  } = useViewportStore((state) => state.viewport3D);

  const resetTrigger = useViewportStore((state) => state.resetTrigger3D);
  const setCamera3DReadout = useViewportStore((state) => state.setCamera3DReadout);
  const setCameraFov3D = useViewportStore((state) => state.setCameraFov3D);
  const setAutoOrbitPaused3D = useViewportStore((state) => state.setAutoOrbitPaused3D);
  const syncCameras = useWorkspaceStore((state) => state.syncCameras);
  const activePaneId = useWorkspaceStore((state) => state.activePaneId);
  const syncStamp = useRef({ signature: '', time: 0 });
  const applyingSync = useRef(false);

  const broadcastCamera = useCallback(() => {
    if (!syncCameras || applyingSync.current) return;
    const target = orbitRef.current?.target;
    const detail = {
      sourceId: paneId,
      position: [camera.position.x, camera.position.y, camera.position.z] as [number, number, number],
      quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w] as [number, number, number, number],
      target: target ? [target.x, target.y, target.z] as [number, number, number] : null,
      fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : 45,
    };
    const signature = `${detail.position.map((value) => value.toFixed(2)).join(',')}|${detail.quaternion.map((value) => value.toFixed(3)).join(',')}`;
    const now = performance.now();
    if (signature === syncStamp.current.signature && now - syncStamp.current.time < 80) return;
    syncStamp.current = { signature, time: now };
    window.dispatchEvent(new CustomEvent('heightnet:camera-sync', { detail }));
  }, [camera, paneId, syncCameras]);

  useEffect(() => {
    const handleCameraSync = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        sourceId?: string;
        position?: [number, number, number];
        quaternion?: [number, number, number, number];
        target?: [number, number, number] | null;
        fov?: number;
      };
      if (!syncCameras || detail.sourceId === paneId || !detail.position || !detail.quaternion) return;
      applyingSync.current = true;
      camera.position.fromArray(detail.position);
      camera.quaternion.fromArray(detail.quaternion);
      if (camera instanceof THREE.PerspectiveCamera && detail.fov) {
        camera.fov = detail.fov;
        camera.updateProjectionMatrix();
      }
      if (orbitRef.current && detail.target) {
        orbitRef.current.target.fromArray(detail.target);
        orbitRef.current.update();
      }
      window.setTimeout(() => { applyingSync.current = false; }, 0);
    };

    window.addEventListener('heightnet:camera-sync', handleCameraSync);
    return () => window.removeEventListener('heightnet:camera-sync', handleCameraSync);
  }, [camera, paneId, syncCameras]);

  const fitCameraToTerrain = (force = false) => {
    const terrain = scene.getObjectByName('heightnet-generated-terrain');
    if (!terrain || !terrain.visible) return false;
    if (!force && fittedTerrain.current === terrain) {
      if (orbitRef.current && fitTarget.current) {
        orbitRef.current.target.copy(fitTarget.current);
        orbitRef.current.update();
      }
      return false;
    }

    let meshCount = 0;
    terrain.traverse((node) => {
      if ('isMesh' in node && (node as THREE.Mesh).isMesh) meshCount += 1;
    });
    if (!meshCount) return false;

    terrain.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(terrain);
    if (bounds.isEmpty()) return false;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 20);
    const distance = Math.max(radius * 1.45, 90);
    const target = center.clone();
    target.y += Math.max(size.y * 0.08, 2);
    fitTarget.current = target.clone();

    // Start walkthrough at the terrain surface instead of leaving the user
    // inside the default orbit camera. The first-person modes should feel
    // like a deliberate entry point into the generated scene.
    if (cameraMode === 'walkthrough') {
      const groundY = readTerrainSurfaceY(scene, center.x, center.z) ?? bounds.min.y;
      const entryDistance = Math.max(size.z * 0.32, 28);
      camera.position.set(center.x, groundY + 3.2, center.z + entryDistance);
      camera.lookAt(center.x, groundY + 3.2, center.z);
      camera.near = 0.05;
      camera.far = Math.max(radius * 20, 2000);
      camera.updateProjectionMatrix();
      mouseLook.current.pitch = 0;
      // The camera starts just beyond the near edge of the terrain and should
      // face back toward its centre. In this coordinate system yaw 0 looks
      // along -Z.
      mouseLook.current.yaw = 0;
      fittedTerrain.current = terrain;
      return true;
    }

    camera.position.set(
      center.x + distance * 0.78,
      center.y + distance * 0.58,
      center.z + distance * 0.78,
    );
    camera.lookAt(target);
    camera.near = Math.max(radius / 1000, 0.05);
    camera.far = Math.max(radius * 20, 2000);
    camera.updateProjectionMatrix();

    mouseLook.current.pitch = -0.32;
    mouseLook.current.yaw = 0.72;
    if (orbitRef.current) {
      orbitRef.current.target.copy(target);
      orbitRef.current.minDistance = Math.max(radius * 0.08, 4);
      orbitRef.current.maxDistance = Math.max(radius * 8, 800);
      orbitRef.current.update();
    }
    fittedTerrain.current = terrain;
    return true;
  };

  // Keyboard keys state for Flythrough and Walkthrough
  const keys = useRef<{
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    boost: boolean;
  }>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false,
  });

  // Mouse drag state for Fly / Walk look around
  const mouseLook = useRef<{
    isMouseDown: boolean;
    lastX: number;
    lastY: number;
    pitch: number;
    yaw: number;
  }>({
    isMouseDown: false,
    lastX: 0,
    lastY: 0,
    pitch: -0.35,
    yaw: 0.75,
  });

  // FPS calculation variables
  const fpsStats = useRef<{ frames: number; prevTime: number; fps: number }>({
    frames: 0,
    prevTime: performance.now(),
    fps: 60,
  });

  // Update FOV when store changes
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = cameraFov;
      camera.updateProjectionMatrix();
    }
  }, [camera, cameraFov]);

  // Handle Camera Reset
  useEffect(() => {
    if (resetTrigger > 0) {
      fittedTerrain.current = null;
      fitCameraToTerrain(true);
    }
  }, [resetTrigger, camera, scene]);

  // The mesh is loaded asynchronously. A reset can happen before React has
  // mounted the primitive, so also fit on the first frame where the real OBJ
  // is actually present in the scene.
  useEffect(() => {
    fittedTerrain.current = null;
    fitTarget.current = null;
  }, [cameraMode]);

  // Key event listeners for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in text input
      if (activePaneId !== paneId || ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keys.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keys.current.right = true;
          break;
        case 'Space':
          keys.current.up = true;
          e.preventDefault();
          break;
        case 'KeyC':
        case 'ControlLeft':
        case 'ControlRight':
          keys.current.down = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.current.boost = true;
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keys.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keys.current.right = false;
          break;
        case 'Space':
          keys.current.up = false;
          break;
        case 'KeyC':
        case 'ControlLeft':
        case 'ControlRight':
          keys.current.down = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.current.boost = false;
          break;
      }
    };

    const handleBlur = () => {
      keys.current.forward = false;
      keys.current.backward = false;
      keys.current.left = false;
      keys.current.right = false;
      keys.current.up = false;
      keys.current.down = false;
      keys.current.boost = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [activePaneId, paneId]);

  // Mouse look around for Flythrough & Walkthrough
  useEffect(() => {
    const dom = gl.domElement;
    dom.tabIndex = 0;
    const focusCanvas = () => dom.focus();

    const onMouseDown = (e: MouseEvent) => {
      if (cameraMode === 'orbit' || cameraMode === 'auto-orbit') return;
      mouseLook.current.isMouseDown = true;
      mouseLook.current.lastX = e.clientX;
      mouseLook.current.lastY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!mouseLook.current.isMouseDown || cameraMode === 'orbit' || cameraMode === 'auto-orbit') return;
      const dx = e.clientX - mouseLook.current.lastX;
      const dy = e.clientY - mouseLook.current.lastY;
      mouseLook.current.lastX = e.clientX;
      mouseLook.current.lastY = e.clientY;

      const sensitivity = 0.003;
      mouseLook.current.yaw -= dx * sensitivity;
      mouseLook.current.pitch -= dy * sensitivity;

      // Limit pitch to avoid flipping over
      mouseLook.current.pitch = Math.max(
        -Math.PI / 2.05,
        Math.min(Math.PI / 2.05, mouseLook.current.pitch)
      );
    };

    const onMouseUp = () => {
      mouseLook.current.isMouseDown = false;
    };

    dom.addEventListener('pointerdown', focusCanvas);
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      dom.removeEventListener('pointerdown', focusCanvas);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [gl, cameraMode, broadcastCamera]);

  // Auto Orbit: Gracefully suspend auto-rotation when user manually clicks & drags the camera
  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;

    const onStart = () => {
      if (cameraMode === 'auto-orbit' && !autoOrbit.paused) {
        setAutoOrbitPaused3D(true);
      }
    };

    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [cameraMode, autoOrbit.paused, setAutoOrbitPaused3D]);

  // Auto Orbit: Target sync
  useEffect(() => {
    if ((cameraMode === 'orbit' || cameraMode === 'auto-orbit') && orbitRef.current) {
      orbitRef.current.target.set(
        autoOrbit.targetPos[0],
        autoOrbit.targetPos[1],
        autoOrbit.targetPos[2]
      );
      orbitRef.current.update();
    }
  }, [cameraMode, autoOrbit.targetPos]);

  // Auto Orbit: Elevation sync without snapping
  const prevElevation = useRef(autoOrbit.elevation);
  useEffect(() => {
    if (cameraMode === 'auto-orbit' && prevElevation.current !== autoOrbit.elevation) {
      const deltaY = autoOrbit.elevation - prevElevation.current;
      camera.position.y += deltaY;
      prevElevation.current = autoOrbit.elevation;
      if (orbitRef.current) {
        orbitRef.current.update();
      }
    } else {
      prevElevation.current = autoOrbit.elevation;
    }
  }, [cameraMode, autoOrbit.elevation, camera]);

  // Mouse wheel listener for 3D navigation (Dolly zoom in fly/walk, optical FOV zoom with Ctrl)
  useEffect(() => {
    const dom = gl.domElement;

    const onWheel = (e: WheelEvent) => {
      // In orbit or auto-orbit mode without Ctrl, OrbitControls handles wheel zooming
      if ((cameraMode === 'orbit' || cameraMode === 'auto-orbit') && !e.ctrlKey) {
        return;
      }

      e.preventDefault();

      // Ctrl + Wheel: Optical FOV zoom across all modes
      if (e.ctrlKey) {
        const delta = e.deltaY < 0 ? -2.5 : 2.5;
        const currentFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45;
        const newFov = Math.max(15, Math.min(105, currentFov + delta));
        setCameraFov3D(newFov);
        return;
      }

      // Flythrough: 6-DOF dolly forward/backward along camera look vector
      if (cameraMode === 'flythrough') {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const dollySpeed = (keys.current.boost ? 14 : 6) * cameraSpeed;
        const dollyDir = e.deltaY < 0 ? 1 : -1;
        camera.position.addScaledVector(forward, dollyDir * dollySpeed);

        // Clamp to avoid subterranean clipping
        const terrainHeight = readTerrainSurfaceY(scene, camera.position.x, camera.position.z);
        if (terrainHeight !== null && camera.position.y < terrainHeight + 1.0) {
          camera.position.y = terrainHeight + 1.0;
        }
      } else if (cameraMode === 'walkthrough') {
        // Walkthrough: Ground-level step forward / backward
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();
        const stepSpeed = (keys.current.boost ? 9 : 4) * cameraSpeed;
        const stepDir = e.deltaY < 0 ? 1 : -1;
        camera.position.addScaledVector(forward, stepDir * stepSpeed);

        // Maintain eye-level elevation
        const terrainHeight = readTerrainSurfaceY(scene, camera.position.x, camera.position.z);
        if (terrainHeight !== null) camera.position.y = terrainHeight + 3.2;
      }
    };

    dom.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      dom.removeEventListener('wheel', onWheel);
    };
  }, [gl, camera, cameraMode, cameraSpeed, scene, setCameraFov3D]);

  // Frame update loop
  useFrame((_, delta) => {
    fitCameraToTerrain();

    // 1. Calculate FPS
    fpsStats.current.frames++;
    const now = performance.now();
    if (now >= fpsStats.current.prevTime + 500) {
      fpsStats.current.fps = Math.round(
        (fpsStats.current.frames * 1000) / (now - fpsStats.current.prevTime)
      );
      fpsStats.current.frames = 0;
      fpsStats.current.prevTime = now;
    }

    // 2. Navigation Movement (Orbit, Auto-Orbit, Flythrough & Walkthrough)
    if (cameraMode === 'orbit' || cameraMode === 'auto-orbit') {
      const { forward, backward, left, right, boost } = keys.current;
      if (forward || backward || left || right) {
        const speedMultiplier = (boost ? 2.5 : 1.0) * cameraSpeed;
        const moveSpeed = 55 * delta * speedMultiplier;
        const target = orbitRef.current ? orbitRef.current.target : new THREE.Vector3(0, 15, 0);
        const dir = new THREE.Vector3().subVectors(target, camera.position);
        const dist = dir.length();
        dir.normalize();

        // Forward (W) / Backward (S) = dolly zoom in/out towards target
        if (forward && dist > 10) {
          camera.position.addScaledVector(dir, moveSpeed);
        }
        if (backward && dist < 480) {
          camera.position.addScaledVector(dir, -moveSpeed);
        }

        // Left (A) / Right (D) = pan camera and target horizontally
        const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        rightVec.y = 0;
        rightVec.normalize();
        if (right) {
          const pan = rightVec.clone().multiplyScalar(moveSpeed * 0.7);
          camera.position.add(pan);
          if (orbitRef.current) orbitRef.current.target.add(pan);
        }
        if (left) {
          const pan = rightVec.clone().multiplyScalar(-moveSpeed * 0.7);
          camera.position.add(pan);
          if (orbitRef.current) orbitRef.current.target.add(pan);
        }

        if (orbitRef.current) {
          orbitRef.current.update();
        }
      }
    } else if (cameraMode === 'flythrough' || cameraMode === 'walkthrough') {
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.y = mouseLook.current.yaw;
      euler.x = mouseLook.current.pitch;
      camera.quaternion.setFromEuler(euler);

      const speedMultiplier = (keys.current.boost ? 2.5 : 1.0) * cameraSpeed;
      const moveSpeed = (cameraMode === 'flythrough' ? 45 : 25) * delta * speedMultiplier;

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

      if (cameraMode === 'walkthrough') {
        // Flat movement on ground plane
        forward.y = 0;
        forward.normalize();
        right.y = 0;
        right.normalize();
      }

      const moveDelta = new THREE.Vector3(0, 0, 0);
      if (keys.current.forward) moveDelta.add(forward.multiplyScalar(moveSpeed));
      if (keys.current.backward) moveDelta.add(forward.multiplyScalar(-moveSpeed));
      if (keys.current.right) moveDelta.add(right.multiplyScalar(moveSpeed));
      if (keys.current.left) moveDelta.add(right.multiplyScalar(-moveSpeed));

      if (cameraMode === 'flythrough') {
        if (keys.current.up) moveDelta.y += moveSpeed;
        if (keys.current.down) moveDelta.y -= moveSpeed;
      }

      camera.position.add(moveDelta);

      // Walkthrough ground collision clamping
      const terrainHeight = readTerrainSurfaceY(scene, camera.position.x, camera.position.z);

      if (cameraMode === 'walkthrough') {
        // Keep camera at ground height + 3.0 units eye level
        if (terrainHeight !== null) {
          const targetY = terrainHeight + 3.2;
          camera.position.y += (targetY - camera.position.y) * 0.15;
        }
      } else if (terrainHeight !== null) {
        // Prevent flythrough from sinking into subterranean abyss
        if (camera.position.y < terrainHeight + 1.0) {
          camera.position.y = terrainHeight + 1.0;
        }
      }
    }

    // 3. Update telemetry readout
    const pos = camera.position;
    setCamera3DReadout({
      posX: Math.round(pos.x),
      posY: Math.round(pos.y),
      posZ: Math.round(pos.z),
      pitch: Math.round((camera.rotation.x * 180) / Math.PI),
      yaw: Math.round((camera.rotation.y * 180) / Math.PI),
      fps: fpsStats.current.fps || 60,
    });
    broadcastCamera();
  });

  if (cameraMode === 'orbit' || cameraMode === 'auto-orbit') {
    const isAutoRotating = cameraMode === 'auto-orbit' && !autoOrbit.paused;
    const dirSign = autoOrbit.direction === 'clockwise' ? -1 : 1;
    const rotateSpeed = 2.2 * autoOrbit.speed * dirSign;

    return (
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.06}
        enableZoom={true}
        zoomSpeed={1.2}
        autoRotate={isAutoRotating}
        autoRotateSpeed={rotateSpeed}
        maxDistance={480}
        minDistance={8}
        maxPolarAngle={Math.PI / 2.05} // don't go below ground
        onChange={broadcastCamera}
      />
    );
  }

  return null;
};
