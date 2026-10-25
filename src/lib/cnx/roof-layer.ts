/**
 * The roof layer — a MapLibre custom layer that draws real roofs.
 *
 * WHY A CUSTOM LAYER, AND NOT DECK.GL
 *
 * MapLibre's `fill-extrusion` extrudes a plan shape straight up. It
 * cannot make a slope, so a gable roof drawn with it is a box, and a
 * city of boxes is what the board already had. deck.gl can make a
 * slope, but it draws into its own canvas: its roofs would never depth-
 * interleave with MapLibre's own extrusions, and a roof behind a
 * building would draw on top of it.
 *
 * A MapLibre custom layer draws into the MAP'S context, so it shares
 * the map's depth buffer. The roof sits on the wall, and a wall in
 * front of a roof hides it, exactly as it should.
 *
 * WHY NOT A THIRD-PARTY ASSET
 *
 * A gable is a shape, not a model file. Building it here means there
 * is no asset licence to carry, no download, and no CC BY-NC or NoAI
 * exposure: the geometry is generated from OpenStreetMap footprints
 * (ODbL) that the board already ships.
 *
 * WHAT IS DRAWN
 *
 *   gable — two slopes and two gable ends, over a rectangle
 *   flat  — a cap slab, set into the top of the wall
 *
 * Forms are schematic. Totals reuse the supplied building height, which may
 * itself be an OSM tag, a levels-based estimate or an extractor fallback.
 * This renderer supports the CNX Mercator basemaps, not globe projection.
 */

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MaplibreMap } from "maplibre-gl";

/** One row of the roof table. */
export interface RoofRow {
  centre: [number, number];
  length: number;
  width: number;
  rotation: number;
  eaves: number;
  rise: number;
  kind: "gable" | "flat";
  group: string;
  category: string;
}

/** The roof table as it is fetched from /data/cnx/roofs.json. */
export interface RoofTable {
  version: number;
  note?: string;
  columns: string[];
  kinds: string[];
  groups: string[];
  categories: string[];
  rows: number[][];
}

/** The colours a roof can be, by category. */
export type RoofPalette = Record<string, [number, number, number, number]>;

/**
 * The default palette — terracotta for a tiled gable, cool concrete for
 * a flat cap, and the temple roofs in the board's own colours.
 */
export const DEFAULT_ROOF_PALETTE: RoofPalette = {
  "city-gable": [168, 78, 46, 255],
  "city-flat": [126, 130, 134, 255],
  hall: [150, 62, 38, 255],
  side_hall: [150, 62, 38, 255],
  gate: [150, 62, 38, 255],
};

/** The largest palette the shader carries. */
const MAX_PALETTE = 12;

const VERTEX_SOURCE = `
layout(location=0) in vec4 a_local;
layout(location=1) in vec2 a_centre;
layout(location=2) in vec4 a_dims;
layout(location=3) in vec3 a_base_palette;

uniform mat4 u_projection_matrix;

out vec3 v_normal;
out vec3 v_world;
flat out float v_palette;
flat out float v_seed;

void main() {
  float len = a_dims.x;
  float wid = a_dims.y;
  float rot = a_dims.z;
  float rise = a_dims.w;

  // The ridge runs along the part's long side; rot is its bearing,
  // clockwise from north.
  float s = sin(rot);
  float c = cos(rot);
  vec2 dir = vec2(s, c);
  vec2 perp = vec2(c, -s);

  // The face normal, in the part's own frame: x along the ridge,
  // y across it, z up. A slope's normal depends on the pitch, so it
  // cannot be baked into the mesh.
  float face = a_local.w;
  vec3 nLocal;
  if (face < 0.5)      nLocal = normalize(vec3(0.0, -rise, wid * 0.5));
  else if (face < 1.5) nLocal = normalize(vec3(0.0,  rise, wid * 0.5));
  else if (face < 2.5) nLocal = vec3(-1.0, 0.0, 0.0);
  else if (face < 3.5) nLocal = vec3( 1.0, 0.0, 0.0);
  else if (face < 4.5) nLocal = vec3( 0.0, 0.0, 1.0);
  else if (face < 5.5) nLocal = vec3( 0.0, -1.0, 0.0);
  else if (face < 6.5) nLocal = vec3( 1.0, 0.0, 0.0);
  else if (face < 7.5) nLocal = vec3( 0.0,  1.0, 0.0);
  else                 nLocal = vec3(-1.0, 0.0, 0.0);

  // Into the world's plan frame. Mercator space is conformal, so the
  // three axes share a scale and the normal survives the trip.
  vec3 n = vec3(nLocal.x * dir.x + nLocal.y * perp.x,
                nLocal.x * dir.y + nLocal.y * perp.y,
                nLocal.z);

  float height = a_base_palette.x + a_local.z * rise;
  vec2 offset = dir * (a_local.x * len) + perp * (a_local.y * wid);

  vec2 merc = a_centre + vec2(offset.x, -offset.y) * a_base_palette.z;
  // The custom layer's matrix takes its height in MERCATOR UNITS, the
  // same units its x and y are in — MapLibre's mercator space is
  // conformal, so a box of equal lengths in it is a cube on screen.
  gl_Position = u_projection_matrix * vec4(merc, height * a_base_palette.z, 1.0);

  v_normal = vec3(n.x, -n.y, n.z);
  v_world = vec3(merc, height * a_base_palette.z);
  v_palette = a_base_palette.y;
  // One value per roof, not per pixel, so a roof is one colour.
  v_seed = fract(sin(dot(a_centre * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);
}
`;

const FRAGMENT_SOURCE = `
precision highp float;

layout(location=0) out vec4 fragColor;

in vec3 v_normal;
in vec3 v_world;
flat in float v_palette;
flat in float v_seed;

uniform vec4 u_palette[${MAX_PALETTE}];
uniform vec3 u_sun;
uniform float u_ambient;

void main() {
  vec3 n = normalize(v_normal);

  // A little variation per roof, so a terrace of identical gables does
  // not read as one extruded block.
  float tint = 0.9 + 0.2 * v_seed;

  float lambert = max(dot(n, u_sun), 0.0);
  // A little sky light from above, so a slope facing the sky is not
  // simply the wall colour in shadow.
  float sky = max(n.z, 0.0) * 0.22;
  vec4 base = u_palette[int(v_palette)];
  vec3 lit = base.rgb * tint * (u_ambient + 0.85 * lambert + sky);

  fragColor = vec4(lit, base.a);
}
`;

/**
 * The unit gable: two slopes and two gable ends.
 *
 * Every vertex carries the face it belongs to, because the faces are
 * flat: a slope's normal depends on the pitch, which is per roof.
 */
const GABLE_VERTICES = new Float32Array([
  // slope, south (face 0)
  -0.5, -0.5, 0, 0, 0.5, -0.5, 0, 0, 0.5, 0, 1, 0,
  -0.5, -0.5, 0, 0, 0.5, 0, 1, 0, -0.5, 0, 1, 0,
  // slope, north (face 1)
  -0.5, 0.5, 0, 1, 0.5, 0.5, 0, 1, 0.5, 0, 1, 1,
  -0.5, 0.5, 0, 1, 0.5, 0, 1, 1, -0.5, 0, 1, 1,
  // gable end, west (face 2)
  -0.5, -0.5, 0, 2, -0.5, 0, 1, 2, -0.5, 0.5, 0, 2,
  // gable end, east (face 3)
  0.5, -0.5, 0, 3, 0.5, 0.5, 0, 3, 0.5, 0, 1, 3,
]);

/** The unit flat cap: a slab, open underneath. */
const FLAT_VERTICES = new Float32Array([
  // top (face 4)
  -0.5, -0.5, 1, 4, 0.5, -0.5, 1, 4, 0.5, 0.5, 1, 4,
  -0.5, -0.5, 1, 4, 0.5, 0.5, 1, 4, -0.5, 0.5, 1, 4,
  // south (face 5)
  -0.5, -0.5, 0, 5, 0.5, -0.5, 0, 5, 0.5, -0.5, 1, 5,
  -0.5, -0.5, 0, 5, 0.5, -0.5, 1, 5, -0.5, -0.5, 1, 5,
  // east (face 6)
  0.5, -0.5, 0, 6, 0.5, 0.5, 0, 6, 0.5, 0.5, 1, 6,
  0.5, -0.5, 0, 6, 0.5, 0.5, 1, 6, 0.5, -0.5, 1, 6,
  // north (face 7)
  0.5, 0.5, 0, 7, -0.5, 0.5, 0, 7, -0.5, 0.5, 1, 7,
  0.5, 0.5, 0, 7, -0.5, 0.5, 1, 7, 0.5, 0.5, 1, 7,
  // west (face 8)
  -0.5, 0.5, 0, 8, -0.5, -0.5, 0, 8, -0.5, -0.5, 1, 8,
  -0.5, 0.5, 0, 8, -0.5, -0.5, 1, 8, -0.5, 0.5, 1, 8,
]);



/** Metres per degree of longitude at the equator, as MapLibre has it. */
const EARTH_CIRCUMFERENCE = 40075016.685578488;

/** The earth's radius in metres, for the mercator scale. */
const ROOF_ORIGIN: [number, number] = [mercatorX(98.9853), mercatorY(18.7883)];

/**
 * Metres per mercator unit at a latitude.
 *
 * MapLibre's mercator space is conformal: one unit is the whole
 * world, and at a given latitude one mercator unit is this many
 * metres. The roof geometry is built in metres and converted here, so
 * it lands exactly on the wall it caps.
 */
export function metresPerMercatorUnit(latitude: number): number {
  return EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180);
}

/** Mercator x for a longitude, in world mercator units (0..1). */
export function mercatorX(lng: number): number {
  return (180 + lng) / 360;
}

/** Mercator y for a latitude, in world mercator units (0..1). */
export function mercatorY(lat: number): number {
  return (
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360
  );
}

/** Parse the roof table into rows the layer can draw. */
export function parseRoofTable(table: RoofTable): RoofRow[] {
  const out: RoofRow[] = [];
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows) ||
      !Array.isArray(table.kinds) || !Array.isArray(table.groups) || !Array.isArray(table.categories)) return out;
  const col = (name: string): number => {
    const i = table.columns.indexOf(name);
    return i >= 0 ? i : -1;
  };
  const iLon = col("lon");
  const iLat = col("lat");
  const iLen = col("length");
  const iWid = col("width");
  const iRot = col("rotation");
  const iEaves = col("eaves");
  const iRise = col("rise");
  const iKind = col("kind");
  const iGroup = col("group");
  const iCat = col("category");
  if ([iLon, iLat, iLen, iWid, iRot, iEaves, iRise, iKind, iGroup, iCat].some(index => index < 0)) return out;

  for (const row of table.rows ?? []) {
    if (!Array.isArray(row) || !row.every(Number.isFinite)) continue;
    if (Math.abs(row[iLon]) > 180 || Math.abs(row[iLat]) >= 85) continue;
    const kind = table.kinds[row[iKind]];
    const group = table.groups[row[iGroup]];
    const category = table.categories[row[iCat]];
    if ((kind !== "gable" && kind !== "flat") || !group || !category) continue;
    if (row[iEaves] < 0 || row[iRise] <= 0) continue;
    if (!Number.isFinite(row[iLen]) || !Number.isFinite(row[iWid])) continue;
    if (row[iLen] <= 0 || row[iWid] <= 0) continue;
    if (!Number.isFinite(row[iEaves]) || !Number.isFinite(row[iRise])) continue;
    out.push({
      centre: [row[iLon], row[iLat]],
      length: row[iLen],
      width: row[iWid],
      rotation: row[iRot] ?? 0,
      eaves: row[iEaves],
      rise: row[iRise],
      kind: kind === "flat" ? "flat" : "gable",
      group,
      category,
    });
  }
  return out;
}

/** Instanced Mercator roofs sharing MapLibre's depth buffer. */
export class RoofLayer implements CustomLayerInterface {
  id = "cnx-roofs";
  type = "custom" as const;
  renderingMode = "3d" as const;
  private rows: RoofRow[] = [];
  private groups: string[] = [];
  private palette: RoofPalette = DEFAULT_ROOF_PALETTE;
  private paletteData = new Float32Array(MAX_PALETTE * 4);
  private projectionData = new Float32Array(16);
  private map: MaplibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buffers: { gableVbo: WebGLBuffer; flatVbo: WebGLBuffer; gableInstances: WebGLBuffer; flatInstances: WebGLBuffer } | null = null;
  private gableCount = 0;
  private flatCount = 0;
  private failed = false;
  private readyReported = false;
  error: string | null = null;
  private reportError?: (error: string | null) => void;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(onError?: (error: string | null) => void) {
    this.reportError = onError;
    this.setPalette(DEFAULT_ROOF_PALETTE);
  }
  private setError(error: string | null): void {
    if (this.error === error && (error !== null || this.readyReported)) return;
    this.readyReported = error === null;
    this.error = error;
    this.reportError?.(error);
  }
  setRows(rows: RoofRow[]): void { this.rows = rows; this.upload(); }
  setGroups(groups: string[]): void { this.groups = groups; this.upload(); }
  setPalette(palette: RoofPalette): void {
    this.palette = palette;
    this.paletteData.fill(0);
    Object.values(palette).slice(0, MAX_PALETTE).forEach((color, index) => {
      color.forEach((value, channel) => { this.paletteData[index * 4 + channel] = value / 255; });
    });
    this.upload();
  }
  onAdd(map: MaplibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    this.failed = false;
    this.readyReported = false;
    this.vao = gl.createVertexArray();
    const buffers = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
    if (!this.vao || buffers.some(buffer => !buffer)) {
      buffers.forEach(buffer => { if (buffer) gl.deleteBuffer(buffer); });
      if (this.vao) gl.deleteVertexArray(this.vao);
      this.vao = null;
      this.setError("Roof geometry unavailable: WebGL buffer allocation failed.");
      return;
    }
    const [gableVbo, flatVbo, gableInstances, flatInstances] = buffers as WebGLBuffer[];
    this.buffers = { gableVbo, flatVbo, gableInstances, flatInstances };
    const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    gl.bindBuffer(gl.ARRAY_BUFFER, gableVbo);
    gl.bufferData(gl.ARRAY_BUFFER, GABLE_VERTICES, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, flatVbo);
    gl.bufferData(gl.ARRAY_BUFFER, FLAT_VERTICES, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, previous);
    this.upload();
  }
  onRemove(): void {
    const gl = this.gl;
    if (gl) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.buffers) Object.values(this.buffers).forEach(buffer => gl.deleteBuffer(buffer));
    }
    this.program = null;
    this.vao = null;
    this.buffers = null;
    this.gl = null;
    this.map = null;
    this.failed = false;
  }
  private upload(): void {
    const gl = this.gl, buffers = this.buffers;
    if (!gl || !buffers) return;
    const gables: number[] = [], flats: number[] = [];
    const paletteKeys = Object.keys(this.palette).slice(0, MAX_PALETTE);
    for (const row of this.rows) {
      if (!this.groups.includes(row.group)) continue;
      const slot = Math.max(0, paletteKeys.indexOf(row.category));
      const record = [mercatorX(row.centre[0]) - ROOF_ORIGIN[0], mercatorY(row.centre[1]) - ROOF_ORIGIN[1],
        row.length, row.width, row.rotation, row.rise, row.eaves, slot, 1 / metresPerMercatorUnit(row.centre[1])];
      (row.kind === "flat" ? flats : gables).push(...record);
    }
    this.gableCount = gables.length / 9;
    this.flatCount = flats.length / 9;
    const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.gableInstances);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gables), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.flatInstances);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flats), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, previous);
    this.map?.triggerRepaint();
  }
  private buildProgram(gl: WebGL2RenderingContext): WebGLProgram {
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX_SOURCE], [gl.FRAGMENT_SHADER, FRAGMENT_SOURCE]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Roof shader allocation failed");
        shaders.push(shader);
        gl.shaderSource(shader, `#version 300 es\n${source}`);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Roof shader: ${gl.getShaderInfoLog(shader)}`);
      }
      program = gl.createProgram();
      if (!program) throw new Error("Roof program allocation failed");
      shaders.forEach(shader => gl.attachShader(program!, shader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Roof program: ${gl.getProgramInfoLog(program)}`);
      return program;
    } catch (error) {
      if (program) gl.deleteProgram(program);
      throw error;
    } finally { shaders.forEach(shader => gl.deleteShader(shader)); }
  }
  private draw(gl: WebGL2RenderingContext, mesh: WebGLBuffer, instances: WebGLBuffer, count: number, vertices: number): void {
    if (!count) return;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    for (const [index, size, offset] of [[1, 2, 0], [2, 4, 8], [3, 3, 24]]) {
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 36, offset);
      gl.vertexAttribDivisor(index, 1);
    }
    gl.drawArraysInstanced(gl.TRIANGLES, 0, vertices, count);
  }
  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    if (!this.buffers || (!this.gableCount && !this.flatCount) || this.failed) return;
    // Native extrusions follow DEM altitude; these schematic meshes currently
    // carry AGL heights only. Refuse to draw them below loaded terrain.
    if (this.map?.getTerrain?.()) {
      this.setError("Schematic roofs are unavailable on terrain basemaps; native building totals remain available.");
      return;
    }
    if (args.shaderData.define.includes("GLOBE")) {
      this.setError("Roof geometry supports Mercator basemaps only.");
      return;
    }
    if (!this.program) {
      try {
        this.program = this.buildProgram(gl);
        for (const name of ["u_projection_matrix", "u_palette", "u_sun", "u_ambient"]) this.uniforms[name] = gl.getUniformLocation(this.program, name);
      } catch (error) {
        this.failed = true;
        this.setError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    const matrix = args.defaultProjectionData.mainMatrix;
    // Translate in double precision before uploading a local-origin matrix.
    // Uploading absolute mercator centres as Float32 loses metre-scale detail.
    this.projectionData.set(matrix);
    for (let row = 0; row < 4; row++) this.projectionData[12 + row] = matrix[row] * ROOF_ORIGIN[0] + matrix[4 + row] * ROOF_ORIGIN[1] + matrix[12 + row];
    const previous = {
      program: gl.getParameter(gl.CURRENT_PROGRAM), vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING), buffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
      depth: gl.isEnabled(gl.DEPTH_TEST), cull: gl.isEnabled(gl.CULL_FACE), blend: gl.isEnabled(gl.BLEND),
      depthFunc: gl.getParameter(gl.DEPTH_FUNC), depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
    };
    try {
      gl.useProgram(this.program);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
      gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      gl.uniformMatrix4fv(this.uniforms.u_projection_matrix, false, this.projectionData);
      gl.uniform4fv(this.uniforms.u_palette, this.paletteData);
      gl.uniform3f(this.uniforms.u_sun, -0.45, 0.55, 0.7);
      gl.uniform1f(this.uniforms.u_ambient, 0.42);
      this.draw(gl, this.buffers.gableVbo, this.buffers.gableInstances, this.gableCount, GABLE_VERTICES.length / 4);
      this.draw(gl, this.buffers.flatVbo, this.buffers.flatInstances, this.flatCount, FLAT_VERTICES.length / 4);
      this.setError(null);
    } finally {
      gl.bindVertexArray(previous.vao); gl.bindBuffer(gl.ARRAY_BUFFER, previous.buffer); gl.useProgram(previous.program);
      gl.depthFunc(previous.depthFunc); gl.depthMask(previous.depthMask);
      for (const [cap, enabled] of [[gl.DEPTH_TEST, previous.depth], [gl.CULL_FACE, previous.cull], [gl.BLEND, previous.blend]] as const) {
        if (enabled) gl.enable(cap); else gl.disable(cap);
      }
    }
  }
}
