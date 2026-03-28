import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Image, Text, Pressable, StyleSheet, ImageSourcePropType} from 'react-native';
import {PluginCommAPI, PluginManager, PluginFileAPI} from 'sn-plugin-lib';
import {SHAPES, Shape, ShapeId} from './shapes';

const COLS = 3;
export const CELL_SIZE = 48;
const THUMBNAIL_SIZE = 36;
const GAP = 6;
const PANEL_PADDING = 10;
const PANEL_WIDTH = COLS * CELL_SIZE + (COLS - 1) * GAP + PANEL_PADDING * 2;

export const DEFAULT_PAGE_WIDTH = 1404;
export const DEFAULT_PAGE_HEIGHT = 1872;
export const SHAPE_SIZE_RATIO = 0.12;

export const TEST_IDS = {
  overlay: 'shapes-overlay',
  cell: (id: ShapeId) => `shape-cell-${id}`,
  error: 'shapes-error',
} as const;

export const SHAPE_ICONS: Record<ShapeId, ImageSourcePropType> = {
  square: require('../assets/shapes/shape_square.png'),
  circle: require('../assets/shapes/shape_circle.png'),
  roundedRect: require('../assets/shapes/shape_roundedRect.png'),
  ellipse: require('../assets/shapes/shape_ellipse.png'),
  triangle: require('../assets/shapes/shape_triangle.png'),
  diamond: require('../assets/shapes/shape_diamond.png'),
  pentagon: require('../assets/shapes/shape_pentagon.png'),
  hexagon: require('../assets/shapes/shape_hexagon.png'),
  heptagon: require('../assets/shapes/shape_heptagon.png'),
  octagon: require('../assets/shapes/shape_octagon.png'),
  line: require('../assets/shapes/shape_line.png'),
  parallelogram: require('../assets/shapes/shape_parallelogram.png'),
};

async function resolvePageSize(): Promise<{width: number; height: number}> {
  try {
    const pathRes = await PluginCommAPI.getCurrentFilePath();
    const pageRes = await PluginCommAPI.getCurrentPageNum();
    if (pathRes?.success && pageRes?.success) {
      const sizeRes = await PluginFileAPI.getPageSize(pathRes.result, pageRes.result);
      if (sizeRes?.success && sizeRes.result) {
        return sizeRes.result;
      }
    }
  } catch {
    // Fall through to defaults
  }
  return {width: DEFAULT_PAGE_WIDTH, height: DEFAULT_PAGE_HEIGHT};
}

async function insertShape(shape: Shape): Promise<void> {
  const {width, height} = await resolvePageSize();
  const center = {x: width / 2, y: height / 2};
  const shapeSize = width * SHAPE_SIZE_RATIO;
  const geometry = shape.build(center, shapeSize);
  const res = await PluginCommAPI.insertGeometry(geometry);
  if (!res?.success) {
    console.error('insertGeometry failed:', JSON.stringify(res));
    throw new Error(res?.error?.message ?? 'insertGeometry failed');
  }
}

const ERROR_DISPLAY_MS = 2000;

export default function ShapePalette() {
  const insertingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, []);

  const handleShapeTap = useCallback(async (shape: Shape) => {
    if (insertingRef.current) {
      return;
    }
    insertingRef.current = true;
    setError(null);
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    try {
      await insertShape(shape);
      PluginManager.closePluginView();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Insert failed';
      setError(message);
      errorTimerRef.current = setTimeout(() => setError(null), ERROR_DISPLAY_MS);
    } finally {
      insertingRef.current = false;
    }
  }, []);

  const handleOverlayPress = useCallback(() => {
    if (!insertingRef.current) {
      PluginManager.closePluginView();
    }
  }, []);

  const rows: Shape[][] = [];
  for (let i = 0; i < SHAPES.length; i += COLS) {
    rows.push(SHAPES.slice(i, i + COLS));
  }

  return (
    <Pressable testID={TEST_IDS.overlay} style={styles.container} onPress={handleOverlayPress}>
      <View style={styles.panel}>
        {error && (
          <View testID={TEST_IDS.error} style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.row}>
            {row.map(shape => (
              <Pressable
                testID={TEST_IDS.cell(shape.id)}
                key={shape.id}
                style={styles.cell}
                onPress={() => handleShapeTap(shape)}>
                <Image
                  source={SHAPE_ICONS[shape.id]}
                  style={styles.thumbnail}
                />
              </Pressable>
            ))}
          </View>
        ))}
      </View>
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
    marginLeft: 70,
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
  errorBanner: {
    backgroundColor: '#D9534F',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: GAP,
  },
  errorText: {
    color: '#FFF',
    fontSize: 11,
    textAlign: 'center',
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
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    resizeMode: 'contain',
  },
});
