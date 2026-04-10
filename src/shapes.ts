export type Point = { x: number; y: number };

export type PenStyle = {
  penColor: number;
  penType: number;
  penWidth: number;
};

export type PolygonGeometry = PenStyle & {
  type: 'GEO_polygon';
  points: Point[];
};

export type CircleGeometry = PenStyle & {
  type: 'GEO_circle';
  ellipseCenterPoint: Point;
  ellipseMajorAxisRadius: number;
  ellipseMinorAxisRadius: number;
  ellipseAngle: number;
};

export type EllipseGeometry = PenStyle & {
  type: 'GEO_ellipse';
  ellipseCenterPoint: Point;
  ellipseMajorAxisRadius: number;
  ellipseMinorAxisRadius: number;
  ellipseAngle: number;
};

export type LineGeometry = PenStyle & {
  type: 'straightLine';
  points: Point[];
};

export type Geometry = PolygonGeometry | CircleGeometry | EllipseGeometry | LineGeometry;

export type ShapeId =
  | 'square'
  | 'circle'
  | 'roundedRect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'heptagon'
  | 'octagon'
  | 'line'
  | 'parallelogram';

export type ShapeParameter = {
  id: string;
  label: string;
  defaultValue: number;
  min?: number;
  max?: number;
};

export type Shape = {
  id: ShapeId;
  label: string;
  parameters: ShapeParameter[];
  build: (center: Point, params: Record<string, number>, style: PenStyle) => Geometry;
};

// --- Geometry Helpers ---

const makePolygon = (points: Point[], style: PenStyle): PolygonGeometry => {
  // Guard against degenerate inputs that would produce invalid geometry
  if (__DEV__ && points.length < 2) {
    console.warn(`[shapes] makePolygon called with only ${points.length} point(s) — geometry will be degenerate`);
  }
  // Automatically close the path by duplicating the first point at the end
  const closedPoints = points.length >= 2 ? [...points, points[0]] : points;
  return {
    ...style,
    type: 'GEO_polygon',
    points: closedPoints,
  };
};

const makeCircle = (center: Point, radius: number, style: PenStyle): CircleGeometry => ({
  ...style,
  type: 'GEO_circle',
  ellipseCenterPoint: center,
  ellipseMajorAxisRadius: radius,
  ellipseMinorAxisRadius: radius,
  ellipseAngle: 0,
});

const makeEllipse = (center: Point, rx: number, ry: number, style: PenStyle): EllipseGeometry => ({
  ...style,
  type: 'GEO_ellipse',
  ellipseCenterPoint: center,
  ellipseMajorAxisRadius: rx,
  ellipseMinorAxisRadius: ry,
  ellipseAngle: 0,
});

const regularPolygon = (center: Point, radius: number, sides: number): Point[] => {
  const points: Point[] = [];
  const offset = -Math.PI / 2; // Point pointing upwards
  for (let i = 0; i < sides; i++) {
    const angle = offset + (i * 2 * Math.PI) / sides;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return points;
};

const makeLine = (p1: Point, p2: Point, style: PenStyle): LineGeometry => ({
  ...style,
  type: 'straightLine',
  points: [p1, p2],
});

const roundedRectPoints = (
  center: Point,
  width: number,
  height: number,
  cornerRadius: number,
  segmentsPerCorner = 8
): Point[] => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const r = Math.min(cornerRadius, halfWidth, halfHeight);

  const corners = [
    { cx: center.x + halfWidth - r, cy: center.y - halfHeight + r, from: -Math.PI / 2, to: 0 },
    { cx: center.x + halfWidth - r, cy: center.y + halfHeight - r, from: 0, to: Math.PI / 2 },
    { cx: center.x - halfWidth + r, cy: center.y + halfHeight - r, from: Math.PI / 2, to: Math.PI },
    { cx: center.x - halfWidth + r, cy: center.y - halfHeight + r, from: Math.PI, to: (3 * Math.PI) / 2 },
  ];

  return corners.flatMap(({ cx, cy, from, to }) =>
    Array.from({ length: segmentsPerCorner + 1 }, (_, i) => {
      const angle = from + ((to - from) * i) / segmentsPerCorner;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    }),
  );
};

// --- Shape Definitions ---

const REGULAR_POLYGONS: [ShapeId, string, number][] = [
  ['triangle', 'Triangle', 3],
  ['diamond', 'Diamond', 4],
  ['pentagon', 'Pentagon', 5],
  ['hexagon', 'Hexagon', 6],
  ['heptagon', 'Heptagon', 7],
  ['octagon', 'Octagon', 8],
];

export const SHAPES: Shape[] = [
  {
    id: 'square',
    label: 'Rectangle',
    parameters: [
      { id: 'width', label: 'Width (px)', defaultValue: 200, min: 1 },
      { id: 'height', label: 'Height (px)', defaultValue: 200, min: 1 },
    ],
    build: (center, params, style) => {
      const hw = params.width / 2;
      const hh = params.height / 2;
      return makePolygon(
        [
          { x: center.x - hw, y: center.y - hh },
          { x: center.x + hw, y: center.y - hh },
          { x: center.x + hw, y: center.y + hh },
          { x: center.x - hw, y: center.y + hh },
        ],
        style
      );
    },
  },
  {
    id: 'circle',
    label: 'Circle',
    parameters: [
      { id: 'radius', label: 'Radius (px)', defaultValue: 100, min: 1 },
    ],
    build: (center, params, style) => makeCircle(center, params.radius, style),
  },
  {
    id: 'roundedRect',
    label: 'Rounded Rectangle',
    parameters: [
      { id: 'width', label: 'Width (px)', defaultValue: 200, min: 1 },
      { id: 'height', label: 'Height (px)', defaultValue: 200, min: 1 },
      { id: 'radius', label: 'Corner Radius (px)', defaultValue: 25, min: 0 },
    ],
    build: (center, params, style) =>
      makePolygon(roundedRectPoints(center, params.width, params.height, params.radius), style),
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    parameters: [
      { id: 'radiusX', label: 'Radius X (px)', defaultValue: 150, min: 1 },
      { id: 'radiusY', label: 'Radius Y (px)', defaultValue: 100, min: 1 },
    ],
    build: (center, params, style) => makeEllipse(center, params.radiusX, params.radiusY, style),
  },
  {
    id: 'parallelogram',
    label: 'Parallelogram',
    parameters: [
      { id: 'width', label: 'Width (px)', defaultValue: 200, min: 1 },
      { id: 'height', label: 'Height (px)', defaultValue: 150, min: 1 },
      { id: 'offset', label: 'Offset (px)', defaultValue: 50 }, // Can be negative for left-lean
    ],
    build: (center, params, style) => {
      const hw = params.width / 2;
      const hh = params.height / 2;
      const off = params.offset;
      return makePolygon(
        [
          { x: center.x - hw + off, y: center.y - hh },
          { x: center.x + hw + off, y: center.y - hh },
          { x: center.x + hw - off, y: center.y + hh },
          { x: center.x - hw - off, y: center.y + hh },
        ],
        style
      );
    },
  },
  {
    id: 'line',
    label: 'Line',
    parameters: [
      { id: 'length', label: 'Length (px)', defaultValue: 200, min: 1 },
      { id: 'angle', label: 'Angle (degrees)', defaultValue: 0 }, // Angle can be anything
    ],
    build: (center, params, style) => {
      const rad = (params.angle * Math.PI) / 180;
      const hl = params.length / 2;
      const dx = Math.cos(rad) * hl;
      const dy = Math.sin(rad) * hl;
      return makeLine(
        { x: center.x - dx, y: center.y - dy },
        { x: center.x + dx, y: center.y + dy },
        style,
      );
    },
  },
  ...REGULAR_POLYGONS.map(([id, label, sides]): Shape => ({
    id,
    label,
    parameters: [
      { id: 'radius', label: 'Radius (px)', defaultValue: 100, min: 1 },
    ],
    build: (center, params, style) => makePolygon(regularPolygon(center, params.radius, sides), style),
  })),
];
