import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useViewportStore } from '../../state/viewportStore';
import { useLayerStore } from '../../state/layerStore';
import { useProjectStore } from '../../state/projectStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { useUtilitiesStore } from '../../state/utilitiesStore';
import { inspectRaster, rasterPreviewUrl } from '../../integration/api';

interface RasterRendererProps {
  width?: number;
  height?: number;
  paneId?: string;
}

export const RasterRenderer: React.FC<RasterRendererProps> = ({ paneId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rasterRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const [, setRasterVersion] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const {
    viewport2D,
    setZoom2D,
    setPan2D,
    zoomAtPoint2D,
    setCursorReadout,
    addMeasurePoint2D,
  } = useViewportStore();

  const layers = useLayerStore((state) => state.layers);
  const activePaneId = useWorkspaceStore((state) => state.activePaneId);
  const analysisMode = useUtilitiesStore((state) => state.analysisMode);
  const addProfilePoint = useUtilitiesStore((state) => state.addProfilePoint);
  const setProbe = useUtilitiesStore((state) => state.setProbe);
  const liveRasterUrl = useProjectStore((state) => state.project.sourceRasterUrl);
  const project = useProjectStore((state) => state.project);
  const originalLayer = layers.find((l) => l.id === 'layer-raster-original');
  const dsmLayer = layers.find((l) => l.id === 'layer-depth-map');
  const aglLayer = layers.find((l) => l.id === 'layer-agl-map');
  const confidenceLayer = layers.find((l) => l.id === 'layer-confidence-map');
  const uncertaintyLayer = layers.find((l) => l.id === 'layer-uncertainty-map');
  const sceneRiskLayer = layers.find((l) => l.id === 'layer-scene-risk-map');
  const contoursLayer = layers.find((l) => l.id === 'layer-contours');
  const gridLayer = layers.find((l) => l.id === 'layer-grid-2d');

  useEffect(() => {
    const sources: Array<[string, string | null]> = [
      ['original', liveRasterUrl || null],
      ['dsm', project.depthMapUrl || rasterPreviewUrl(project.rawOutputPaths.dsm, 'elevation')],
      ['agl', rasterPreviewUrl(project.rawOutputPaths.agl, 'elevation')],
      ['confidence', rasterPreviewUrl(project.rawOutputPaths.confidence, 'confidence')],
      ['uncertainty', rasterPreviewUrl(project.rawOutputPaths.uncertainty, 'risk')],
      ['scene-risk', rasterPreviewUrl(project.rawOutputPaths.sceneRisk, 'risk')],
    ];
    let cancelled = false;
    rasterRefs.current = {};
    const pending = sources.filter(([, url]) => url);
    if (!pending.length) {
      setRasterVersion((value) => value + 1);
      return () => { cancelled = true; };
    }
    let remaining = pending.length;
    const markDone = () => {
      remaining -= 1;
      if (!cancelled && remaining === 0) setRasterVersion((value) => value + 1);
    };
    pending.forEach(([key, url]) => {
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        rasterRefs.current[key] = image;
        markDone();
      };
      image.onerror = markDone;
      image.src = url as string;
    });
    return () => {
      cancelled = true;
    };
  }, [liveRasterUrl, project.depthMapUrl, project.rawOutputPaths.dsm, project.rawOutputPaths.agl, project.rawOutputPaths.confidence, project.rawOutputPaths.uncertainty, project.rawOutputPaths.sceneRisk]);

  // Main 2D Render pass onto the visible canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.save();

    // Pan & Zoom transformations centered in viewport
    ctx.translate(w / 2 + viewport2D.panX, h / 2 + viewport2D.panY);
    ctx.scale(viewport2D.zoom, viewport2D.zoom);
    ctx.translate(-w / 2, -h / 2);

    const drawRaster = (key: string, visible: boolean, opacity: number, filtered = false) => {
      const image = rasterRefs.current[key];
      if (!image || !visible || opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha = opacity;
      if (filtered) {
        ctx.filter = `brightness(${viewport2D.brightness * 100}%) contrast(${viewport2D.contrast * 100}%)`;
      } else {
        ctx.filter = 'none';
      }
      ctx.drawImage(image, 0, 0, w, h);
      ctx.restore();
    };

    // Every generated output is a real switchable layer. The RGB image stays
    // underneath; toggling DSM, AGL, confidence, uncertainty, or risk adds a
    // colourised preview on top of it.
    drawRaster('original', originalLayer?.visible ?? true, viewport2D.opacity * (originalLayer?.opacity ?? 1), true);
    drawRaster('dsm', dsmLayer?.visible ?? false, dsmLayer?.opacity ?? 1);
    drawRaster('agl', aglLayer?.visible ?? false, aglLayer?.opacity ?? 1);
    drawRaster('confidence', confidenceLayer?.visible ?? false, confidenceLayer?.opacity ?? 1);
    drawRaster('uncertainty', uncertaintyLayer?.visible ?? false, uncertaintyLayer?.opacity ?? 1);
    drawRaster('scene-risk', sceneRiskLayer?.visible ?? false, sceneRiskLayer?.opacity ?? 1);

    // Contour lines overlay
    if (contoursLayer?.visible) {
      ctx.save();
      ctx.globalAlpha = contoursLayer.opacity;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = 1;
      const step = 48;
      for (let i = 0; i <= w; i += step) {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, i, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Coordinate Grid Overlay
    if (viewport2D.gridVisible && (gridLayer?.visible ?? true)) {
      ctx.save();
      ctx.globalAlpha = gridLayer ? gridLayer.opacity * 0.7 : 0.4;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      const gridSize = 128;
      for (let x = 0; x <= w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Active Measurement Polyline
    if (viewport2D.measurePoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.fillStyle = '#ffffff';

      ctx.beginPath();
      viewport2D.measurePoints.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      viewport2D.measurePoints.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    ctx.restore();
  }, [
    viewport2D,
    originalLayer?.visible,
    originalLayer?.opacity,
    contoursLayer?.visible,
    contoursLayer?.opacity,
    gridLayer?.visible,
    gridLayer?.opacity,
    gridLayer,
    dsmLayer?.visible,
    dsmLayer?.opacity,
    aglLayer?.visible,
    aglLayer?.opacity,
    confidenceLayer?.visible,
    confidenceLayer?.opacity,
    uncertaintyLayer?.visible,
    uncertaintyLayer?.opacity,
    sceneRiskLayer?.visible,
    sceneRiskLayer?.opacity,
  ]);

  // Keep canvas rendered
  useEffect(() => {
    let animId: number;
    function loop() {
      renderCanvas();
      animId = requestAnimationFrame(loop);
    }
    loop();
    return () => cancelAnimationFrame(animId);
  }, [renderCanvas]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height) * 0.92;
      canvas.width = size;
      canvas.height = size;
      canvas.style.left = `${(rect.width - size) / 2}px`;
      canvas.style.top = `${(rect.height - size) / 2}px`;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Professional Cursor-Centric Mouse Wheel Zoom
  const viewport2DRef = useRef(viewport2D);
  viewport2DRef.current = viewport2D;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      const vp = viewport2DRef.current;
      const currentZoom = vp.zoom;

      // Continuous geometric zoom factor (supports smooth mousewheel, notched wheels, and touchpads)
      const zoomFactor = Math.exp(-e.deltaY * 0.0018);
      const newZoom = Math.max(0.1, Math.min(12.0, currentZoom * zoomFactor));
      const effectiveFactor = newZoom / currentZoom;

      // Mathematically pivot pan coordinates around the exact cursor location
      const newPanX = vp.panX * effectiveFactor + (screenX - centerX) * (1 - effectiveFactor);
      const newPanY = vp.panY * effectiveFactor + (screenY - centerY) * (1 - effectiveFactor);

      zoomAtPoint2D(newZoom, newPanX, newPanY);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoomAtPoint2D]);

  // Keyboard WSAD & Arrow Keys for 2D Panning (+ / - for Zoom)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Keyboard navigation belongs to the pane the user is working in.
      // Without this guard, Flythrough's W/A/S/D keys also pan the shared
      // 2D viewport in a split workspace and make the raster appear to jump
      // away or disappear.
      if (paneId && activePaneId !== paneId) return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      const vp = viewport2DRef.current;
      const panStep = 60;
      const maxPan = 1600;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          setPan2D(vp.panX, Math.min(maxPan, vp.panY + panStep));
          break;
        case 'KeyS':
        case 'ArrowDown':
          setPan2D(vp.panX, Math.max(-maxPan, vp.panY - panStep));
          break;
        case 'KeyA':
        case 'ArrowLeft':
          setPan2D(Math.min(maxPan, vp.panX + panStep), vp.panY);
          break;
        case 'KeyD':
        case 'ArrowRight':
          setPan2D(Math.max(-maxPan, vp.panX - panStep), vp.panY);
          break;
        case 'Equal':
        case 'NumpadAdd':
          setZoom2D((z) => Math.min(12, (typeof z === 'number' ? z : 1) * 1.15));
          break;
        case 'Minus':
        case 'NumpadSubtract':
          setZoom2D((z) => Math.max(0.1, (typeof z === 'number' ? z : 1) * 0.85));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePaneId, paneId, setPan2D, setZoom2D]);

  // Mouse down: drag pan or measure point
  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewport2D.measureMode) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / viewport2D.zoom;
      const y = (e.clientY - rect.top) / viewport2D.zoom;
      addMeasurePoint2D({ x, y });
      return;
    }

    if (analysisMode === 'profile') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const viewX = e.clientX - rect.left;
      const viewY = e.clientY - rect.top;
      const imageX = (viewX - canvas.width / 2 - viewport2D.panX) / viewport2D.zoom + canvas.width / 2;
      const imageY = (viewY - canvas.height / 2 - viewport2D.panY) / viewport2D.zoom + canvas.height / 2;
      addProfilePoint({
        x: Math.round(Math.max(0, Math.min(1, imageX / canvas.width)) * Math.max(0, project.metadata.dimensions.width - 1)),
        y: Math.round(Math.max(0, Math.min(1, imageY / canvas.height)) * Math.max(0, project.metadata.dimensions.height - 1)),
      });
      return;
    }

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: viewport2D.panX,
      panY: viewport2D.panY,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const u = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      const pixelX = Math.round(u * Math.max(0, project.metadata.dimensions.width - 1));
      const pixelY = Math.round(v * Math.max(0, project.metadata.dimensions.height - 1));
      const { west, east, south, north } = project.metadata.bounds;

      setCursorReadout({
        pixelX,
        pixelY,
        lat: north - v * (north - south),
        lon: west + u * (east - west),
        readoutSource: 'metadata',
      });
    }

    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan2D(dragStartRef.current.panX + dx, dragStartRef.current.panY + dy);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleCanvasClick = async (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || viewport2D.measureMode || analysisMode === 'profile') return;
    const rect = canvas.getBoundingClientRect();
    const viewX = e.clientX - rect.left;
    const viewY = e.clientY - rect.top;
    const imageX = (viewX - canvas.width / 2 - viewport2D.panX) / viewport2D.zoom + canvas.width / 2;
    const imageY = (viewY - canvas.height / 2 - viewport2D.panY) / viewport2D.zoom + canvas.height / 2;
    const u = Math.max(0, Math.min(1, imageX / canvas.width));
    const v = Math.max(0, Math.min(1, imageY / canvas.height));
    const col = Math.round(u * Math.max(0, project.metadata.dimensions.width - 1));
    const row = Math.round(v * Math.max(0, project.metadata.dimensions.height - 1));
    const paths = project.rawOutputPaths;
    const read = async (path: string | null) => {
      if (!path) return null;
      try {
        return await inspectRaster(path, col, row);
      } catch {
        return null;
      }
    };
    const [dsm, agl, confidence, uncertainty, sceneRisk] = await Promise.all([
      read(paths.dsm),
      read(paths.agl),
      read(paths.confidence),
      read(paths.uncertainty),
      read(paths.sceneRisk),
    ]);
    if (dsm || agl || confidence || uncertainty || sceneRisk) {
      setCursorReadout({
        pixelX: dsm?.column ?? col,
        pixelY: dsm?.row ?? row,
        elevation: dsm?.value_m ?? agl?.value_m ?? undefined,
        slopeDegrees: dsm?.slope_degrees ?? undefined,
        mapX: dsm?.map_x ?? agl?.map_x,
        mapY: dsm?.map_y ?? agl?.map_y,
        readoutSource: 'live-raster',
      });
      setProbe({
        row,
        column: col,
        elevation: dsm?.value_m ?? null,
        slopeDegrees: dsm?.slope_degrees ?? null,
        agl: agl?.value_m ?? null,
        confidence: confidence?.value_m ?? null,
        uncertainty: uncertainty?.value_m ?? null,
        sceneRisk: sceneRisk?.value_m ?? null,
        mapX: dsm?.map_x ?? agl?.map_x ?? null,
        mapY: dsm?.map_y ?? agl?.map_y ?? null,
        crs: dsm?.crs ?? agl?.crs ?? null,
      });
    }
  };

  // Calculate measured distance if points exist
  let measuredDistanceMeters = 0;
  if (viewport2D.measurePoints.length >= 2) {
    let totalPx = 0;
    for (let i = 1; i < viewport2D.measurePoints.length; i++) {
      const p1 = viewport2D.measurePoints[i - 1];
      const p2 = viewport2D.measurePoints[i];
      const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      totalPx += dist;
    }
    // 0.50m per full-res pixel (4096 vs current canvas size)
    const currentScale = 4096 / (canvasRef.current?.width || 1024);
    measuredDistanceMeters = Math.round(totalPx * currentScale * 0.5);
  }

  return (
    <div
      ref={containerRef}
      className={`raster-stage ${isDragging ? 'dragging' : ''} ${
    viewport2D.measureMode ? 'measuring' : analysisMode === 'profile' ? 'profiling' : ''
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCanvasClick}
    >
      <canvas ref={canvasRef} className="raster-canvas" />

      {/* Crosshair indicator */}
      {viewport2D.crosshairVisible && <div className="viewport-reticle" />}

      {/* Measurement readout badge */}
      {viewport2D.measurePoints.length >= 2 && (
        <div
          className="measurement-badge"
          style={{ top: '16px', left: '16px' }}
        >
          Distance: {measuredDistanceMeters.toLocaleString()} m (
          {(measuredDistanceMeters / 1000).toFixed(2)} km)
        </div>
      )}

      {/* Dynamic USGS / GIS Segmented Scale Bar */}
      <div
        className="gis-scale-bar"
        style={{ width: `${Math.max(100, Math.round(100 * (viewport2D.zoom || 1)))}px` }}
      >
        <div className="scale-ticks-row">
          <span>0</span>
          <span>{Math.round(250 / (viewport2D.zoom || 1))}</span>
          <span>{Math.round(500 / (viewport2D.zoom || 1))} m</span>
        </div>
        <div className="scale-blocks-row">
          <div className="scale-block-black" />
          <div className="scale-block-white" />
          <div className="scale-block-black" />
          <div className="scale-block-white" />
        </div>
      </div>
    </div>
  );
};
