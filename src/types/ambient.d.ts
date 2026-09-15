/* eslint-disable @typescript-eslint/no-explicit-any */
// Ambient module declarations for libraries without bundled .d.ts
// files. We deliberately leave these permissive — the deck.gl and
// maplibre types are complex and the production build doesn't rely
// on strict inference here.

declare module "@deck.gl/core" {
  const m: any;
  export type MapViewState = {
    longitude: number;
    latitude: number;
    zoom?: number;
    pitch?: number;
    bearing?: number;
    [key: string]: unknown;
  };
  export default m;
}

declare module "@deck.gl/react" {
  import type { ComponentType } from "react";
  const DeckGL: ComponentType<any>;
  export default DeckGL;
}

declare module "@deck.gl/layers" {
  // Generic Layer constructors — type parameter is opaque.
  type LayerCtor<T = any> = new (props: any) => T;
  export const IconLayer: LayerCtor;
  export const PathLayer: LayerCtor;
  export const ScatterplotLayer: LayerCtor;
  export const PolygonLayer: LayerCtor;
}

declare module "maplibre-gl" {
  const maplibregl: any;
  export default maplibregl;
  export { maplibregl };
  export type StyleSpecification = any;
  export type MapOptions = any;
  export namespace maplibregl {
    export type Map = any;
  }
}

declare module "react-map-gl" {
  export const Map: any;
  export const Source: any;
  export const Layer: any;
  export const Marker: any;
  export const Popup: any;
  export type MapProps = any;
}

declare module "react-map-gl/maplibre" {
  const Map: any;
  export default Map;
}