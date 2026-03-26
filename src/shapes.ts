export type Point = {x: number; y: number};

type PenStyle = {
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

export type Geometry = PolygonGeometry | CircleGeometry | EllipseGeometry;

export type Shape = {
  id: string;
  label: string;
  build: (center: Point, size: number) => Geometry;
};

const PEN_DEFAULTS: PenStyle = {
  penColor: 0x00,
  penType: 10,
  penWidth: 200,
};

export function regularPolygon(
  center: Point,
  radius: number,
  sides: number,
  startAngle = -Math.PI / 2,
): Point[] {
  return Array.from({length: sides}, (_, i) => {
    const angle = startAngle + (2 * Math.PI * i) / sides;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
}

export function roundedRectPoints(
  center: Point,
  halfWidth: number,
  halfHeight: number,
  cornerRadius: number,
  segmentsPerCorner = 8,
): Point[] {
  const r = Math.min(cornerRadius, halfWidth, halfHeight);
  const corners = [
    {cx: center.x + halfWidth - r, cy: center.y - halfHeight + r, from: -Math.PI / 2, to: 0},
    {cx: center.x + halfWidth - r, cy: center.y + halfHeight - r, from: 0, to: Math.PI / 2},
    {cx: center.x - halfWidth + r, cy: center.y + halfHeight - r, from: Math.PI / 2, to: Math.PI},
    {cx: center.x - halfWidth + r, cy: center.y - halfHeight + r, from: Math.PI, to: (3 * Math.PI) / 2},
  ];

  return corners.flatMap(({cx, cy, from, to}) =>
    Array.from({length: segmentsPerCorner + 1}, (_, i) => {
      const angle = from + ((to - from) * i) / segmentsPerCorner;
      return {x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle)};
    }),
  );
}

export function starPoints(
  center: Point,
  outerRadius: number,
  innerRadius: number,
  tips: number,
): Point[] {
  return Array.from({length: tips * 2}, (_, i) => {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (Math.PI * i) / tips;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
}

function makePolygon(points: Point[]): PolygonGeometry {
  const closed = [...points, points[0]];
  return {...PEN_DEFAULTS, type: 'GEO_polygon', points: closed};
}

function makeCircle(center: Point, radius: number): CircleGeometry {
  return {
    ...PEN_DEFAULTS,
    type: 'GEO_circle',
    ellipseCenterPoint: center,
    ellipseMajorAxisRadius: radius,
    ellipseMinorAxisRadius: radius,
    ellipseAngle: 0,
  };
}

function makeEllipse(center: Point, rx: number, ry: number): EllipseGeometry {
  return {
    ...PEN_DEFAULTS,
    type: 'GEO_ellipse',
    ellipseCenterPoint: center,
    ellipseMajorAxisRadius: rx,
    ellipseMinorAxisRadius: ry,
    ellipseAngle: 0,
  };
}

const REGULAR_POLYGONS = [
  ['triangle', 'Triangle', 3],
  ['diamond', 'Diamond', 4],
  ['pentagon', 'Pentagon', 5],
  ['hexagon', 'Hexagon', 6],
  ['heptagon', 'Heptagon', 7],
  ['octagon', 'Octagon', 8],
] as const;

export const SHAPES: Shape[] = [
  {
    id: 'square',
    label: 'Square',
    build: (center, size) => {
      const h = size / 2;
      return makePolygon([
        {x: center.x - h, y: center.y - h},
        {x: center.x + h, y: center.y - h},
        {x: center.x + h, y: center.y + h},
        {x: center.x - h, y: center.y + h},
      ]);
    },
  },
  {
    id: 'circle',
    label: 'Circle',
    build: (center, size) => makeCircle(center, size / 2),
  },
  {
    id: 'roundedRect',
    label: 'Rounded Rectangle',
    build: (center, size) =>
      makePolygon(roundedRectPoints(center, size / 2, size / 3, size / 8)),
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    build: (center, size) => makeEllipse(center, size / 2, size / 3),
  },
  ...REGULAR_POLYGONS.map(([id, label, sides]): Shape => ({
    id,
    label,
    build: (center, size) => makePolygon(regularPolygon(center, size / 2, sides)),
  })),
  {
    id: 'parallelogram',
    label: 'Parallelogram',
    build: (center, size) => {
      const hw = size / 2;
      const hh = size / 3;
      const s = size / 10;
      return makePolygon([
        {x: center.x - hw + s, y: center.y - hh},
        {x: center.x + hw + s, y: center.y - hh},
        {x: center.x + hw - s, y: center.y + hh},
        {x: center.x - hw - s, y: center.y + hh},
      ]);
    },
  },
];
