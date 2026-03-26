import React from 'react';
import {create, act, ReactTestRenderer} from 'react-test-renderer';

jest.mock('sn-plugin-lib', () => {
  return {
    PluginCommAPI: {
      insertGeometry: jest.fn().mockResolvedValue({success: true}),
    },
    PluginFileAPI: {
      getPageSize: jest.fn().mockResolvedValue({
        success: true,
        result: {width: 1404, height: 1872},
      }),
    },
    PluginManager: {
      closePluginView: jest.fn().mockResolvedValue(true),
    },
  };
});

import ShapePalette, {
  TEST_IDS,
  DEFAULT_PAGE_WIDTH,
  DEFAULT_PAGE_HEIGHT,
} from '../src/ShapePalette';
import {SHAPES} from '../src/shapes';
import {PluginCommAPI, PluginManager, PluginFileAPI} from 'sn-plugin-lib';

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

function findByTestID(tree: ReactTestRenderer, testID: string) {
  return tree.root.findByProps({testID});
}

function findAllCells(tree: ReactTestRenderer) {
  return SHAPES.map(s => findByTestID(tree, TEST_IDS.cell(s.id)));
}

beforeEach(() => {
  (PluginCommAPI.insertGeometry as jest.Mock).mockClear();
  (PluginManager.closePluginView as jest.Mock).mockClear();
  (PluginFileAPI.getPageSize as jest.Mock).mockClear();
  (PluginFileAPI.getPageSize as jest.Mock).mockResolvedValue({
    success: true,
    result: {width: DEFAULT_PAGE_WIDTH, height: DEFAULT_PAGE_HEIGHT},
  });
});

describe('ShapePalette', () => {
  it('renders without crashing', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ShapePalette />);
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders a cell for each shape', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ShapePalette />);
    });
    expect(findAllCells(tree!)).toHaveLength(SHAPES.length);
  });

  it('closes plugin when overlay is pressed', async () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ShapePalette />);
    });

    await act(async () => {
      findByTestID(tree!, TEST_IDS.overlay).props.onPress();
      await flushPromises();
    });

    expect(PluginManager.closePluginView).toHaveBeenCalled();
  });

  it('inserts geometry and closes when a shape is tapped', async () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ShapePalette />);
    });

    await act(async () => {
      findByTestID(tree!, TEST_IDS.cell('square')).props.onPress();
      await flushPromises();
    });

    expect(PluginFileAPI.getPageSize).toHaveBeenCalled();
    expect(PluginCommAPI.insertGeometry).toHaveBeenCalledWith(
      expect.objectContaining({penColor: 0x00, penType: 10, penWidth: 2}),
    );
    expect(PluginManager.closePluginView).toHaveBeenCalled();
  });

  it('uses default page size when API fails', async () => {
    (PluginFileAPI.getPageSize as jest.Mock).mockRejectedValueOnce(
      new Error('unavailable'),
    );

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ShapePalette />);
    });

    await act(async () => {
      findByTestID(tree!, TEST_IDS.cell('square')).props.onPress();
      await flushPromises();
    });

    expect(PluginCommAPI.insertGeometry).toHaveBeenCalled();
    const geo = (PluginCommAPI.insertGeometry as jest.Mock).mock.calls[0][0];
    expect(geo.type).toBe('GEO_polygon');
    const avgX =
      geo.points.reduce((s: number, p: {x: number}) => s + p.x, 0) /
      geo.points.length;
    expect(avgX).toBeCloseTo(DEFAULT_PAGE_WIDTH / 2, -1);
  });

  it('inserts circle geometry for circle shape', async () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ShapePalette />);
    });

    await act(async () => {
      findByTestID(tree!, TEST_IDS.cell('circle')).props.onPress();
      await flushPromises();
    });

    const geo = (PluginCommAPI.insertGeometry as jest.Mock).mock.calls[0][0];
    expect(geo.type).toBe('GEO_circle');
    expect(geo.ellipseCenterPoint).toBeDefined();
    expect(geo.ellipseMajorAxisRadius).toBe(geo.ellipseMinorAxisRadius);
  });

  it('ignores rapid double-tap while insertion is in progress', async () => {
    let resolveInsert: () => void;
    (PluginCommAPI.insertGeometry as jest.Mock).mockImplementationOnce(
      () => new Promise<void>(r => { resolveInsert = r; }),
    );

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ShapePalette />);
    });

    await act(async () => {
      findByTestID(tree!, TEST_IDS.cell('square')).props.onPress();
      await flushPromises();
    });

    await act(async () => {
      findByTestID(tree!, TEST_IDS.cell('circle')).props.onPress();
      await flushPromises();
    });

    expect(PluginCommAPI.insertGeometry).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInsert!();
      await flushPromises();
    });
  });

  it('allows new insertion after failure', async () => {
    (PluginCommAPI.insertGeometry as jest.Mock).mockRejectedValueOnce(
      new Error('failed'),
    );

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ShapePalette />);
    });

    await act(async () => {
      findByTestID(tree!, TEST_IDS.cell('square')).props.onPress();
      await flushPromises();
    });

    (PluginCommAPI.insertGeometry as jest.Mock).mockResolvedValueOnce({success: true});

    await act(async () => {
      findByTestID(tree!, TEST_IDS.cell('circle')).props.onPress();
      await flushPromises();
    });

    expect(PluginCommAPI.insertGeometry).toHaveBeenCalledTimes(2);
  });
});
