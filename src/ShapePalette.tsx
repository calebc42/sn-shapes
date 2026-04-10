import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  AppState,
} from 'react-native';

import { PluginCommAPI, PluginManager, PluginFileAPI } from 'sn-plugin-lib';
import { SHAPES, Shape, ShapeId, Geometry } from './shapes';

const COLS = 4;
export const CELL_SIZE = 64;
const GAP = 8;
const PANEL_PADDING = 16;
const PANEL_WIDTH = COLS * CELL_SIZE + (COLS - 1) * GAP + PANEL_PADDING * 2;

// 3:4 Aspect Ratio mapping exactly to the 1404x1872 Supernote canvas
const PREVIEW_WIDTH = 150;
const PREVIEW_HEIGHT = 200;
const DOC_W = 1404;
const DOC_H = 1872;

const BRIDGE_RETRY_DELAY_MS = 300;
const PEN_TYPE_TECHNICAL = 10;

// Supernote E-ink Grayscale Colors
const PEN_COLORS = [
  { label: 'Black', value: 0x00 },
  { label: 'Dark', value: 0x9D },
  { label: 'Light', value: 0xC9 },
];

async function resolveCurrentFilePath(): Promise<string | null> {
  let res = (await PluginCommAPI.getCurrentFilePath()) as any;
  if (!res?.success) {
    await new Promise(r => setTimeout(r, BRIDGE_RETRY_DELAY_MS));
    res = (await PluginCommAPI.getCurrentFilePath()) as any;
  }
  return res?.success && res.result ? res.result : null;
}

const SHAPE_ROWS = Array.from(
  { length: Math.ceil(SHAPES.length / COLS) },
  (_, i) => SHAPES.slice(i * COLS, (i + 1) * COLS)
);

// ─── UTILITY: Helper to parse parameters safely ────────────────────────────
const getNumericParams = (shape: Shape, saved: Record<string, string> | undefined) => {
  const p: Record<string, number> = {};
  shape.parameters.forEach(param => {
    p[param.id] = parseFloat(saved?.[param.id] || String(param.defaultValue));
  });
  return p;
};


// ─── ADVANCED SHAPE PREVIEWER ──────────────────────────────────────────────
type PreviewMode = 'fixed' | 'auto-fit';
type ShapePreviewProps = {
  geometry: Geometry | null;
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  mode: PreviewMode;
};

function ShapePreview({ geometry, width, height, strokeColor, strokeWidth, mode }: ShapePreviewProps) {
  if (!geometry) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 11, color: strokeColor }}>—</Text>
      </View>
    );
  }

  const PADDING = mode === 'auto-fit' ? 8 : 0;
  const drawW = width - PADDING * 2;
  const drawH = height - PADDING * 2;

  let scaleX = 1; let scaleY = 1;
  let offX = 0; let offY = 0;

  // 1. Calculate Bounding Box
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  if (geometry.type === 'GEO_circle' || geometry.type === 'GEO_ellipse') {
    const rx = geometry.ellipseMajorAxisRadius;
    const ry = geometry.ellipseMinorAxisRadius;
    const cx = geometry.ellipseCenterPoint?.x || 0;
    const cy = geometry.ellipseCenterPoint?.y || 0;
    minX = cx - rx; maxX = cx + rx;
    minY = cy - ry; maxY = cy + ry;
  } else if (geometry.points && geometry.points.length > 0) {
    minX = Math.min(...geometry.points.map(p => p.x));
    maxX = Math.max(...geometry.points.map(p => p.x));
    minY = Math.min(...geometry.points.map(p => p.y));
    maxY = Math.max(...geometry.points.map(p => p.y));
  }

  const shapeW = Math.max(maxX - minX, 1);
  const shapeH = Math.max(maxY - minY, 1);

  // 2. Apply Scale Mode
  if (mode === 'fixed') {
    // 1:1 Scale relative to document size
    const scale = Math.min(width / DOC_W, height / DOC_H);
    scaleX = scale; scaleY = scale;
  } else {
    // Auto-fit to fill the bounding box (Thumbnails)
    const scale = Math.min(drawW / shapeW, drawH / shapeH);
    scaleX = scale; scaleY = scale;
    offX = PADDING + (drawW - shapeW * scale) / 2 - minX * scale;
    offY = PADDING + (drawH - shapeH * scale) / 2 - minY * scale;
  }

  const transformPoint = (p: { x: number, y: number }) => ({
    x: p.x * scaleX + offX,
    y: p.y * scaleY + offY
  });

  // 3. Render Circular Geometries
  if (geometry.type === 'GEO_circle' || geometry.type === 'GEO_ellipse') {
    const rx = geometry.ellipseMajorAxisRadius * scaleX;
    const ry = geometry.ellipseMinorAxisRadius * scaleY;
    const w = rx * 2; const h = ry * 2;
    const center = transformPoint(geometry.ellipseCenterPoint || { x: DOC_W / 2, y: DOC_H / 2 });

    return (
      <View style={{ width, height }}>
        <View style={{
          position: 'absolute',
          left: center.x - rx, top: center.y - ry,
          width: w, height: h,
          borderRadius: Math.max(w, h),
          borderWidth: strokeWidth,
          borderColor: strokeColor,
        }} />
      </View>
    );
  }

  // 4. Render Polygon / Line Geometries
  const pts = geometry.points.map(transformPoint);
  // Visually close the loop for polygons
  const renderPts = geometry.type === 'GEO_polygon' ? [...pts, pts[0]] : pts;

  const renderSegment = (ax: number, ay: number, bx: number, by: number, key: string | number) => {
    const dx = bx - ax; const dy = by - ay;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const cx = ax + dx / 2; const cy = ay + dy / 2;
    return (
      <View key={key} style={{
        position: 'absolute',
        left: cx - length / 2, top: cy - strokeWidth / 2,
        width: length, height: strokeWidth,
        backgroundColor: strokeColor,
        transform: [{ rotate: `${angle}deg` }],
      }} />
    );
  };

  return (
    <View style={{ width, height }}>
      {renderPts.slice(0, -1).map((pt, i) => renderSegment(pt.x, pt.y, renderPts[i + 1].x, renderPts[i + 1].y, i))}
    </View>
  );
}

// --- Divider ---
const Divider = ({ dotted = false }: { dotted?: boolean }) => (
  <View style={[styles.divider, dotted && styles.dividerDotted]} />
);


export default function ShapePalette() {
  const [activeShape, setActiveShape] = useState<Shape | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [penWidth, setPenWidth] = useState<number>(0.5);
  const [penColor, setPenColor] = useState<number>(0x00);
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const [offsetCount, setOffsetCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const [savedConfigs, setSavedConfigs] = useState<Record<string, Record<string, string>>>({});
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        setActiveShape(null); setOffsetCount(0); setError(null);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (showTooltip) {
      const timer = setTimeout(() => setShowTooltip(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showTooltip]);

  const handleBack = () => { setActiveShape(null); setError(null); setOffsetCount(0); };

  const closeAndReset = () => {
    setActiveShape(null); setOffsetCount(0); setError(null);
    PluginManager.closePluginView();
  };

  const decreaseWidth = () => setPenWidth(p => Math.max(0.1, Number((p - 0.1).toFixed(1))));
  const increaseWidth = () => setPenWidth(p => Math.min(5.0, Number((p + 0.1).toFixed(1))));
  const decreaseWidthCoarse = () => setPenWidth(p => Math.max(0.1, Number((p - 0.5).toFixed(1))));
  const increaseWidthCoarse = () => setPenWidth(p => Math.min(5.0, Number((p + 0.5).toFixed(1))));

  // ── CORE DRAW LOGIC ────────────────────────────────────────────────────────
  const coreDraw = async (
    shapeToDraw: Shape,
    shapeParams: Record<string, string>,
    width: number,
    color: number
  ) => {
    if (isDrawing) return false;
    setIsDrawing(true);
    try {
      const parsedParams: Record<string, number> = {};
      for (const p of shapeToDraw.parameters) {
        let val = Math.round(parseFloat(shapeParams[p.id]));
        if (isNaN(val)) { setError(`Invalid value for ${p.label}`); return false; }
        if (p.min !== undefined && val < p.min) val = p.min;
        if (p.max !== undefined && val > p.max) val = p.max;
        parsedParams[p.id] = val;
      }

      const parsedWidth = Math.max(100, Math.round(width * 1000));
      const currentFilePath = await resolveCurrentFilePath();
      if (!currentFilePath) { setError('Could not detect active note.'); return false; }

      let docWidth = DOC_W; let docHeight = DOC_H;
      const sizeRes = (await PluginFileAPI.getPageSize(currentFilePath)) as any;
      if (sizeRes?.success && sizeRes.result) { docWidth = sizeRes.result.width; docHeight = sizeRes.result.height; }

      const offsetShift = offsetCount * 50;
      const center = { x: Math.round(docWidth / 2) + offsetShift, y: Math.round(docHeight / 2) + offsetShift };

      const style = { penColor: color, penWidth: parsedWidth, penType: PEN_TYPE_TECHNICAL };
      const geometry = shapeToDraw.build(center, parsedParams, style);
      const insertRes = (await PluginCommAPI.insertGeometry(geometry)) as any;

      if (insertRes && insertRes.success === false) {
        throw new Error(`Failed to insert geometry: ${insertRes.errorMsg || 'Unknown API Error'}`);
      }
      return true;
    } catch (e: any) {
      console.error('[ShapePalette] Exception in coreDraw:', e);
      setError(e.message || 'Failed to draw shape.');
      return false;
    } finally {
      setIsDrawing(false);
    }
  };

  const handleQuickDraw = async (shape: Shape) => {
    let currentParams = savedConfigs[shape.id];
    if (!currentParams) {
      currentParams = {};
      shape.parameters.forEach(p => { currentParams![p.id] = String(p.defaultValue); });
    }
    setParams(currentParams);
    setError(null);

    const success = await coreDraw(shape, currentParams, penWidth, penColor);
    if (success) {
      if (continuousMode) { setOffsetCount(c => c + 1); }
      else { closeAndReset(); }
    }
  };

  const handleShapeSelect = (shape: Shape) => {
    let initialParams = savedConfigs[shape.id];
    if (!initialParams) {
      initialParams = {};
      shape.parameters.forEach(p => { initialParams![p.id] = String(p.defaultValue); });
    }
    setParams(initialParams);
    setActiveShape(shape);
    setError(null);
    setOffsetCount(0);
    setShowTooltip(false);
  };

  const handleDraw = async () => {
    if (!activeShape) return;
    setSavedConfigs(prev => ({ ...prev, [activeShape.id]: params }));

    const success = await coreDraw(activeShape, params, penWidth, penColor);
    if (success) {
      if (continuousMode) { setOffsetCount(c => c + 1); setError(null); }
      else { closeAndReset(); }
    }
  };

  // Live preview geometry generator (Centers in the absolute document space)
  const previewGeometry = useMemo(() => {
    if (!activeShape) return null;
    const parsedParams: Record<string, number> = {};
    for (const p of activeShape.parameters) {
      const val = Math.round(parseFloat(params[p.id]));
      if (isNaN(val)) return null;
      const clamped = p.min !== undefined && val < p.min ? p.min : val;
      parsedParams[p.id] = p.max !== undefined && clamped > p.max ? p.max : clamped;
    }
    const docCenter = { x: DOC_W / 2, y: DOC_H / 2 };
    const dummyStyle = { penColor: 0, penType: 0, penWidth: 100 };
    try { return activeShape.build(docCenter, parsedParams, dummyStyle); }
    catch { return null; }
  }, [activeShape, params]);

  const previewStrokeColor = `#${penColor.toString(16).padStart(2, '0').repeat(3)}`;
  const previewStrokeWidth = Math.min(6, Math.max(1, penWidth * 2)); // Slightly scaled up for visibility

  return (
    <Pressable style={styles.container} onPress={closeAndReset}>
      <Pressable style={styles.panel} onPress={e => e.stopPropagation()}>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!activeShape ? (
          // ── GRID VIEW ───────────────────────────────────────────────────────
          <View style={{ flexShrink: 1 }}>

            <View style={styles.panelHeaderRow}>
              <Text style={styles.panelTitle}>Shapes</Text>
              <Pressable
                onPress={() => setShowTooltip(!showTooltip)}
                style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
              >
                <Text>{'?'}</Text>
              </Pressable>
            </View>
            <Divider />

            <View
              style={[
                styles.tooltipContainer,
                !showTooltip && { opacity: 0, pointerEvents: 'none' }
              ]}
            >
              <Text style={styles.tooltipText}>
                Single tap to draw instantly.{"\n"}
                Long-press any shape to configure its dimensions and style.
              </Text>
              <Pressable onPress={() => setShowTooltip(false)} style={styles.tooltipClose}>
                <Text style={styles.tooltipCloseText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.gridContainer}>
              {SHAPE_ROWS.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                  {row.map(shape => {
                    // Generate dynamic thumbnail data
                    const thumbParams = getNumericParams(shape, savedConfigs[shape.id]);
                    let thumbGeometry = null;
                    try {
                      // Center at 0,0 since 'auto-fit' will re-center it in the box anyway
                      thumbGeometry = shape.build({ x: 0, y: 0 }, thumbParams, { penColor: 0, penType: 0, penWidth: 100 });
                    } catch { }

                    const thumbStroke = Math.min(3, Math.max(1, penWidth)); // Capped so tiny thumbnails aren't entirely black blobs

                    return (
                      <Pressable
                        key={shape.id}
                        style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                        onPress={() => handleQuickDraw(shape)}
                        onLongPress={() => handleShapeSelect(shape)}
                        delayLongPress={600}
                      >
                        <ShapePreview
                          geometry={thumbGeometry}
                          width={44}
                          height={44}
                          strokeColor={previewStrokeColor}
                          strokeWidth={thumbStroke}
                          mode="auto-fit"
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

        ) : (
          // ── CONFIGURATION VIEW ───────────────────────────────────────────────
          <View style={styles.configContainer}>

            <View style={styles.configHeader}>
              <Text style={styles.configTitle}>{activeShape.label}</Text>
              <Pressable onPress={handleBack}>
                <Text style={styles.backLink}>← Back</Text>
              </Pressable>
            </View>
            <Divider />

            <View style={styles.previewBox}>
              <ShapePreview
                geometry={previewGeometry}
                width={PREVIEW_WIDTH}
                height={PREVIEW_HEIGHT}
                strokeColor={previewStrokeColor}
                strokeWidth={previewStrokeWidth}
                mode="fixed"
              />
            </View>
            <Divider dotted />

            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>Dimensions</Text>
              {activeShape.parameters.map((p, i) => (
                <View key={p.id}>
                  <View style={styles.row2}>
                    <Text style={styles.rowLabel}>{p.label}</Text>
                    <TextInput
                      style={styles.textInput}
                      value={params[p.id]}
                      onChangeText={val => setParams(prev => ({ ...prev, [p.id]: val }))}
                      keyboardType="numeric"
                    />
                  </View>
                  {i < activeShape.parameters.length - 1 && <Divider dotted />}
                </View>
              ))}
              <Divider />

              <Text style={styles.sectionTitle}>Stroke Style</Text>
              <View style={styles.row2}>
                <Text style={styles.rowLabel}>Thickness</Text>
                <View style={styles.stepperContainer}>
                  <Pressable style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
                    onPress={decreaseWidthCoarse}>
                    <Text style={styles.stepperBtnText}>−−</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
                    onPress={decreaseWidth}>
                    <Text style={styles.stepperBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepperValue}>{penWidth.toFixed(1)}</Text>
                  <Pressable style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
                    onPress={increaseWidth}>
                    <Text style={styles.stepperBtnText}>+</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
                    onPress={increaseWidthCoarse}>
                    <Text style={styles.stepperBtnText}>++</Text>
                  </Pressable>
                </View>
              </View>
              <Divider dotted />

              <View style={styles.row2}>
                <Text style={styles.rowLabel}>Color</Text>
                <View style={styles.colorRow}>
                  {PEN_COLORS.map(c => {
                    const hex = `#${c.value.toString(16).padStart(2, '0').repeat(3)}`;
                    const isActive = penColor === c.value;
                    return (
                      <Pressable key={c.value} onPress={() => setPenColor(c.value)}
                        style={[styles.colorCircleWrap, isActive && styles.colorCircleWrapActive]}>
                        <View style={[styles.colorCircle, { backgroundColor: hex }]} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Divider />

              <Pressable style={styles.row2} onPress={() => setContinuousMode(!continuousMode)}>
                <Text style={styles.rowLabel}>Keep open after drawing</Text>
                <View style={[styles.toggleOuter, continuousMode && styles.toggleOuterActive]}>
                  <View style={[styles.toggleInner, continuousMode && styles.toggleInnerActive]} />
                </View>
              </Pressable>
              <Divider />
            </ScrollView>

            <Pressable
              style={({ pressed }) => [styles.drawRow, pressed && styles.drawRowPressed]}
              onPress={handleDraw}
              disabled={isDrawing}>
              <Text style={[styles.drawRowText, isDrawing && styles.drawRowTextBusy]}>
                {isDrawing ? 'Drawing…' : 'Draw Shape'}
              </Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  panel: {
    marginLeft: 90,
    width: Math.max(PANEL_WIDTH, PREVIEW_WIDTH + 180),
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#000000',
    overflow: 'hidden',
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: PANEL_PADDING,
    paddingRight: 8,
    paddingVertical: 10,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  headerIconBtn: {
    padding: 6,
    borderRadius: 4,
  },
  headerIconBtnPressed: {
    backgroundColor: '#E8E8E8',
  },
  helpIconText: {
    fontFamily: 'Font Awesome 6 Free',
    fontSize: 24,
    color: '#000000',
  },
  tooltipContainer: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 240,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 6,
    padding: 12,
    paddingRight: 30,
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  tooltipText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: 'bold',
    lineHeight: 20,
  },
  tooltipClose: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 8,
  },
  tooltipCloseText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#CCCCCC',
    marginHorizontal: 0,
  },
  dividerDotted: {
    borderTopWidth: 1,
    borderTopColor: '#CCCCCC',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    height: 0,
  },
  errorBanner: {
    marginHorizontal: PANEL_PADDING,
    marginTop: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 13,
    textAlign: 'center',
  },
  gridContainer: {
    padding: PANEL_PADDING,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginRight: GAP,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CCCCCC',
  },
  cellPressed: {
    backgroundColor: '#E8E8E8',
  },
  configContainer: {
    flexShrink: 1,
  },
  configHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PANEL_PADDING,
    paddingVertical: 12,
  },
  configTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  backLink: {
    fontSize: 15,
    color: '#444444',
  },
  previewBox: {
    alignSelf: 'center',
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 6,
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginVertical: 12,
  },
  scrollArea: {
    flexGrow: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
    paddingHorizontal: PANEL_PADDING,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PANEL_PADDING,
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: '#1A1A1A',
    flex: 1,
  },
  textInput: {
    width: 88,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    fontSize: 16,
    color: '#000000',
    textAlign: 'right',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 4,
    overflow: 'hidden',
  },
  stepperBtn: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    backgroundColor: '#F2F2F2',
  },
  stepperBtnPressed: {
    backgroundColor: '#DEDEDE',
  },
  stepperBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  stepperValue: {
    fontSize: 15,
    color: '#000000',
    width: 44,
    textAlign: 'center',
    backgroundColor: '#FFFFFF',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  colorCircleWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorCircleWrapActive: {
    borderColor: '#000000',
  },
  colorCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  toggleOuter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#CCCCCC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleOuterActive: {
    borderColor: '#000000',
  },
  toggleInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  toggleInnerActive: {
    backgroundColor: '#000000',
  },
  drawRow: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#CCCCCC',
    backgroundColor: '#FFFFFF',
  },
  drawRowPressed: {
    backgroundColor: '#E8E8E8',
  },
  drawRowText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#000000',
  },
  drawRowTextBusy: {
    color: '#888888',
  },
});
