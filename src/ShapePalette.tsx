import React, {useCallback, useRef} from 'react';
import {View, Pressable, StyleSheet} from 'react-native';
import {PluginCommAPI, PluginManager, PluginFileAPI} from 'sn-plugin-lib';
import {SHAPES, Shape, PolygonGeometry, CircleGeometry, EllipseGeometry} from './shapes';

const COLS = 3;
export const CELL_SIZE = 48;
const PREVIEW_INNER_SIZE = CELL_SIZE - 12;
const GAP = 6;
const PANEL_PADDING = 10;
const PANEL_WIDTH = COLS * CELL_SIZE + (COLS - 1) * GAP + PANEL_PADDING * 2;

export const DEFAULT_PAGE_WIDTH = 1404;
export const DEFAULT_PAGE_HEIGHT = 1872;
export const SHAPE_SIZE_RATIO = 0.12;

export const TEST_IDS = {
  overlay: 'shapes-overlay',
  cell: (id: string) => `shape-cell-${id}`,
} as const;

function PolygonPreview({geo}: {geo: PolygonGeometry}) {
  const {points} = geo;
  const previewSize = PREVIEW_INNER_SIZE;
  return (
    <View style={{width: previewSize, height: previewSize}}>
      {points.map((point, i) => {
        const next = points[(i + 1) % points.length];
        const dx = next.x - point.x;
        const dy = next.y - point.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        return (
          <View
            key={i}
            style={[
              styles.line,
              {
                left: point.x,
                top: point.y,
                width: length,
                transform: [{rotate: `${angle}rad`}],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function EllipsePreview({geo}: {geo: CircleGeometry | EllipseGeometry}) {
  const {ellipseCenterPoint: cp, ellipseMajorAxisRadius: rx, ellipseMinorAxisRadius: ry} = geo;
  const previewSize = PREVIEW_INNER_SIZE;
  return (
    <View style={{width: previewSize, height: previewSize}}>
      <View
        style={[
          styles.ellipsePositioned,
          {
            width: rx * 2,
            height: ry * 2,
            left: cp.x - rx,
            top: cp.y - ry,
          },
        ]}
      />
    </View>
  );
}

function ShapePreview({shape}: {shape: Shape}) {
  const previewSize = PREVIEW_INNER_SIZE;
  const center = {x: previewSize / 2, y: previewSize / 2};
  const geo = shape.build(center, previewSize * 0.8);

  switch (geo.type) {
    case 'GEO_polygon':
      return <PolygonPreview geo={geo} />;
    case 'GEO_circle':
    case 'GEO_ellipse':
      return <EllipsePreview geo={geo} />;
  }
}

async function resolvePageCenter(): Promise<{center: {x: number; y: number}; shapeSize: number}> {
  let pageWidth = DEFAULT_PAGE_WIDTH;
  let pageHeight = DEFAULT_PAGE_HEIGHT;

  try {
    const res = await PluginFileAPI.getPageSize();
    if (res?.success && res.result) {
      pageWidth = res.result.width;
      pageHeight = res.result.height;
    }
  } catch {
    // Use defaults
  }

  return {
    center: {x: pageWidth / 2, y: pageHeight / 2},
    shapeSize: pageWidth * SHAPE_SIZE_RATIO,
  };
}

async function insertShape(shape: Shape): Promise<void> {
  const {center, shapeSize} = await resolvePageCenter();
  const geometry = shape.build(center, shapeSize);
  await PluginCommAPI.insertGeometry(geometry);
  await PluginManager.closePluginView();
}

export default function ShapePalette() {
  const insertingRef = useRef(false);

  const handleShapeTap = useCallback(async (shape: Shape) => {
    if (insertingRef.current) {
      return;
    }
    insertingRef.current = true;
    try {
      await insertShape(shape);
    } catch {
      // Insertion failed; allow retry
    } finally {
      insertingRef.current = false;
    }
  }, []);

  const handleDismiss = useCallback(async () => {
    await PluginManager.closePluginView();
  }, []);

  const rows: Shape[][] = [];
  for (let i = 0; i < SHAPES.length; i += COLS) {
    rows.push(SHAPES.slice(i, i + COLS));
  }

  return (
    <Pressable testID={TEST_IDS.overlay} style={styles.overlay} onPress={handleDismiss}>
      <View style={styles.panel} onStartShouldSetResponder={() => true}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.row}>
            {row.map(shape => (
              <Pressable
                testID={TEST_IDS.cell(shape.id)}
                key={shape.id}
                style={styles.cell}
                onPress={() => handleShapeTap(shape)}>
                <ShapePreview shape={shape} />
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  panel: {
    position: 'absolute',
    bottom: 20,
    left: 70,
    width: PANEL_WIDTH,
    backgroundColor: '#EFEBE6',
    borderRadius: 6,
    padding: PANEL_PADDING,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
    marginBottom: GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: '#F5F0EB',
  },
  line: {
    position: 'absolute',
    height: 1.5,
    backgroundColor: '#333',
    transformOrigin: '0% 50%',
  },
  ellipsePositioned: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#333',
    borderRadius: 9999,
    backgroundColor: 'transparent',
  },
});
