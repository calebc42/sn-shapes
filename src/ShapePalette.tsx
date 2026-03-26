import React, {useCallback, useRef} from 'react';
import {View, Image, Text, Pressable, StyleSheet, ImageSourcePropType} from 'react-native';
import {PluginCommAPI, PluginManager, PluginFileAPI} from 'sn-plugin-lib';
import {SHAPES, Shape} from './shapes';

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
  close: 'shapes-close',
  cell: (id: string) => `shape-cell-${id}`,
} as const;

export const SHAPE_ICONS: Record<string, ImageSourcePropType> = {
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

export default function ShapePalette() {
  const insertingRef = useRef(false);

  const handleShapeTap = useCallback(async (shape: Shape) => {
    if (insertingRef.current) {
      return;
    }
    insertingRef.current = true;
    try {
      await insertShape(shape);
    } catch (e) {
      console.error('Shape insertion error:', e);
    } finally {
      insertingRef.current = false;
    }
  }, []);

  const handleClose = useCallback(() => {
    PluginManager.closePluginView();
  }, []);

  const rows: Shape[][] = [];
  for (let i = 0; i < SHAPES.length; i += COLS) {
    rows.push(SHAPES.slice(i, i + COLS));
  }

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <Pressable
            testID={TEST_IDS.close}
            style={styles.closeButton}
            onPress={handleClose}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
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
    </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  closeButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    color: '#666',
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
