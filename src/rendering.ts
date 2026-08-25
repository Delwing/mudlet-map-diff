import {createSettings, MapReader, MapRenderer, SvgExporter, SceneOverlay, MapState, RectShape, Shape, ViewportBounds} from "mudlet-map-renderer";
import "konva/canvas-backend";
import {readerExport, MudletLabel, MudletMap} from "mudlet-map-binary-reader";

class LabelHighlightOverlay implements SceneOverlay {
  constructor(private label: MudletLabel) {}

  render(state: MapState, bounds: ViewportBounds): Shape | Shape[] | void {
    const [lx, ly] = this.label.pos;
    const [w, h] = this.label.size;
    const padding = 0.1;
    const wPadding = w * padding;
    const hPadding = h * padding;

    return {
      type: "rect",
      layer: "overlay",
      x: lx - wPadding / 2,
      y: -ly - hPadding / 2,
      width: w + wPadding,
      height: h + hPadding,
      paint: {
        stroke: "red",
        strokeWidth: 0.1,
        dash: [1, 1],
        dashEnabled: true,
      },
    } satisfies RectShape;
  }
}

function setupRenderer(mapData: MudletMap, areaId: number, z: number): MapRenderer {
  const exportData = readerExport(mapData);
  const reader = new MapReader(exportData.mapData, exportData.colors);
  const settings = createSettings();
  settings.areaName = false;
  settings.backgroundColor = "transparent";
  settings.roomShape = "rectangle";
  settings.highlightCurrentRoom = false;

  const renderer = new MapRenderer(reader, settings);
  renderer.drawArea(areaId, z);
  return renderer;
}

export class MapRenderSession {
  private renderers = new Map<string, MapRenderer>();
  private exportData: ReturnType<typeof readerExport>;
  private reader: MapReader;

  constructor(private mapData: MudletMap) {
    this.exportData = readerExport(mapData);
    this.reader = new MapReader(this.exportData.mapData, this.exportData.colors);
  }

  private getRenderer(areaId: number, z: number): MapRenderer {
    const key = `${areaId}:${z}`;
    if (!this.renderers.has(key)) {
      const settings = createSettings();
      settings.areaName = false;
      settings.backgroundColor = "transparent";
      settings.roomShape = "rectangle";
      settings.highlightCurrentRoom = false;
      const renderer = new MapRenderer(this.reader, settings);
      renderer.drawArea(areaId, z);
      this.renderers.set(key, renderer);
    }
    return this.renderers.get(key)!;
  }

  renderRoom(roomId: number): string | undefined {
    const room = this.mapData.rooms[roomId];
    if (!room) return undefined;
    const renderer = this.getRenderer(room.area, room.z);
    renderer.setPosition(roomId);
    return renderer.export(new SvgExporter({ roomId, padding: 20 }));
  }

  renderLabel(label: MudletLabel, highlight: boolean = true): string | undefined {
    const areaId = label.areaId ?? -1;
    const [lx, ly, lz] = label.pos;

    const areaRooms = Object.entries(this.mapData.rooms).filter(([_, r]) => r.area === areaId && r.z === lz);
    let closestRoomId: number | undefined;
    let minDistance = Infinity;

    for (const [idStr, room] of areaRooms) {
      const dx = room.x - lx;
      const dy = room.y - ly;
      const dist = dx * dx + dy * dy;
      if (dist < minDistance) {
        minDistance = dist;
        closestRoomId = parseInt(idStr);
      }
    }

    if (closestRoomId === undefined) return undefined;

    const renderer = this.getRenderer(areaId, lz);

    if (highlight) {
      renderer.addSceneOverlay("label-highlight", new LabelHighlightOverlay(label));
    }

    const result = renderer.export(new SvgExporter({ roomId: closestRoomId, padding: 20 }));

    if (highlight) {
      renderer.removeSceneOverlay("label-highlight");
    }

    return result;
  }

  destroy(): void {
    for (const renderer of this.renderers.values()) {
      renderer.destroy();
    }
    this.renderers.clear();
  }
}

export function renderRoom(mapData: MudletMap, roomId: number): string | undefined {
  const room = mapData.rooms[roomId];
  if (!room) return undefined;
  const renderer = setupRenderer(mapData, room.area, room.z);
  renderer.setPosition(roomId);
  const result = renderer.export(new SvgExporter({ roomId, padding: 20 }));
  renderer.destroy();
  return result;
}

export function renderLabel(mapData: MudletMap, label: MudletLabel, highlight: boolean = true): string | undefined {
  const areaId = label.areaId ?? -1;
  const [lx, ly, lz] = label.pos;

  const areaRooms = Object.entries(mapData.rooms).filter(([_, r]) => r.area === areaId && r.z === lz);
  let closestRoomId: number | undefined;
  let minDistance = Infinity;

  for (const [idStr, room] of areaRooms) {
    const dx = room.x - lx;
    const dy = room.y - ly;
    const dist = dx * dx + dy * dy;
    if (dist < minDistance) {
      minDistance = dist;
      closestRoomId = parseInt(idStr);
    }
  }

  if (closestRoomId === undefined) return undefined;

  const renderer = setupRenderer(mapData, areaId, lz);
  if (highlight) {
    renderer.addSceneOverlay("label-highlight", new LabelHighlightOverlay(label));
  }
  const result = renderer.export(new SvgExporter({ roomId: closestRoomId, padding: 20 }));
  renderer.destroy();
  return result;
}
