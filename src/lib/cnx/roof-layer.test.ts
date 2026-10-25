import { expect, it, vi } from "vitest";
import type { CustomRenderMethodInput, Map as MaplibreMap } from "maplibre-gl";
import { RoofLayer, parseRoofTable, type RoofRow } from "./roof-layer";
const row: RoofRow = { centre: [98.99, 18.79], length: 20, width: 8, rotation: 0, eaves: 5, rise: 2, kind: "gable", group: "core", category: "city-gable" };
function context() {
  const original = {};
  const mock = {
    ARRAY_BUFFER: 1, ARRAY_BUFFER_BINDING: 2, STATIC_DRAW: 3, VERTEX_SHADER: 4, FRAGMENT_SHADER: 5,
    COMPILE_STATUS: 6, LINK_STATUS: 7, CURRENT_PROGRAM: 8, VERTEX_ARRAY_BINDING: 9, DEPTH_TEST: 10,
    CULL_FACE: 11, BLEND: 12, DEPTH_FUNC: 13, DEPTH_WRITEMASK: 14, LEQUAL: 15, TRIANGLES: 16, FLOAT: 17,
    createBuffer: vi.fn(() => ({})), createVertexArray: vi.fn(() => ({})), createShader: vi.fn(() => ({})), createProgram: vi.fn(() => ({})),
    bindBuffer: vi.fn(), bufferData: vi.fn(), bindVertexArray: vi.fn(), shaderSource: vi.fn(), compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true), getShaderInfoLog: vi.fn(() => "bad shader"), attachShader: vi.fn(), linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true), getProgramInfoLog: vi.fn(() => "bad link"), deleteShader: vi.fn(), deleteProgram: vi.fn(),
    deleteBuffer: vi.fn(), deleteVertexArray: vi.fn(), getUniformLocation: vi.fn(() => ({})), useProgram: vi.fn(),
    enableVertexAttribArray: vi.fn(), vertexAttribPointer: vi.fn(), vertexAttribDivisor: vi.fn(), drawArraysInstanced: vi.fn(),
    uniformMatrix4fv: vi.fn(), uniform4fv: vi.fn(), uniform3f: vi.fn(), uniform1f: vi.fn(), enable: vi.fn(), disable: vi.fn(), depthFunc: vi.fn(), depthMask: vi.fn(),
    getParameter: vi.fn((name: number) => name === 13 ? 777 : name === 14 ? false : original),
    isEnabled: vi.fn((name: number) => name !== 10),
  };
  return { mock, original, gl: mock as unknown as WebGL2RenderingContext };
}
const args = { shaderData: { define: "", variantName: "mercator", vertexShaderPrelude: "" }, defaultProjectionData: { mainMatrix: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) } } as CustomRenderMethodInput;
const map = { triggerRepaint: vi.fn() } as unknown as MaplibreMap;
it("empty groups draw nothing; selected groups upload local centres and restore shared GL state", () => {
  const { gl, mock, original } = context(), notify = vi.fn(), layer = new RoofLayer(notify);
  layer.setRows([row]); layer.onAdd(map, gl); layer.render(gl, args);
  expect(mock.drawArraysInstanced).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
  layer.setGroups(["core"]); layer.render(gl, args);
  expect(mock.drawArraysInstanced).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenLastCalledWith(null);
  const upload = mock.bufferData.mock.calls.map(call => call[1]).find(data => data instanceof Float32Array && data.length === 9) as Float32Array;
  expect(Math.abs(upload[0])).toBeLessThan(0.01); expect(Math.abs(upload[1])).toBeLessThan(0.01); expect(upload[8]).toBeGreaterThan(0);
  expect(mock.bindVertexArray).toHaveBeenLastCalledWith(original); expect(mock.bindBuffer).toHaveBeenLastCalledWith(1, original);
  expect(mock.useProgram).toHaveBeenLastCalledWith(original); expect(mock.depthFunc).toHaveBeenLastCalledWith(777); expect(mock.depthMask).toHaveBeenLastCalledWith(false);
  layer.setGroups([]); layer.render(gl, args); expect(mock.drawArraysInstanced).toHaveBeenCalledTimes(1);
});
it("releases resources on style removal and recompiles after reattachment", () => {
  const { gl, mock } = context(), layer = new RoofLayer(); layer.setRows([row]); layer.setGroups(["core"]);
  layer.onAdd(map, gl); layer.render(gl, args); layer.onRemove();
  expect(mock.deleteBuffer).toHaveBeenCalledTimes(4); expect(mock.deleteVertexArray).toHaveBeenCalledTimes(1); expect(mock.deleteProgram).toHaveBeenCalledTimes(1);
  layer.onAdd(map, gl); layer.render(gl, args); expect(mock.createProgram).toHaveBeenCalledTimes(2);
});
it("reports compile failure once without retrying every frame, then recovers on a new context", () => {
  const { gl, mock } = context(), notify = vi.fn(), layer = new RoofLayer(notify);
  layer.setRows([row]); layer.setGroups(["core"]); layer.onAdd(map, gl); mock.getShaderParameter.mockReturnValueOnce(false);
  layer.render(gl, args); layer.render(gl, args);
  expect(notify).toHaveBeenCalledTimes(1); expect(notify.mock.calls[0][0]).toContain("bad shader"); expect(mock.createShader).toHaveBeenCalledTimes(1); expect(mock.deleteShader).toHaveBeenCalledTimes(1);
  layer.onRemove(); layer.onAdd(map, gl); layer.render(gl, args); expect(notify).toHaveBeenLastCalledWith(null);
});
it("cleans linked-program failure and rejects malformed coordinates rather than drawing defaults", () => {
  const { gl, mock } = context(), layer = new RoofLayer(); layer.setRows([row]); layer.setGroups(["core"]); layer.onAdd(map, gl);
  mock.getProgramParameter.mockReturnValueOnce(false); layer.render(gl, args);
  expect(mock.deleteProgram).toHaveBeenCalledTimes(1); expect(mock.deleteShader).toHaveBeenCalledTimes(2);
  const table = { version: 1, columns: ["lon", "lat", "length", "width", "rotation", "eaves", "rise", "kind", "group", "category"], kinds: ["gable"], groups: ["core"], categories: ["city-gable"], rows: [[NaN, 18, 10, 5, 0, 5, 2, 0, 0, 0], [99, 18, 10, 5, Infinity, 5, 2, 0, 0, 0], [99, 18, 10, 5, 0, 5, 2, 8, 0, 0]] };
  expect(parseRoofTable(table)).toEqual([]);
});
