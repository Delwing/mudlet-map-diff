import {createSettings, MapReader, MapRenderer, SvgExporter, SceneOverlay, DrawingBackend, MapState, GroupNode, ViewportBounds} from "mudlet-map-renderer";
import "konva/lib/canvas-backend";
import MudletMapReader from "mudlet-map-binary-reader";
import {MudletLabel, MudletMap} from "mudlet-map-binary-reader/dist/types.js";

class LabelHighlightOverlay implements SceneOverlay {
  constructor(private label: MudletLabel) {}

  render(target: DrawingBackend, state: MapState, bounds: ViewportBounds): GroupNode | GroupNode[] | void {
    const [lx, ly] = this.label.pos;
    const [w, h] = this.label.size;
    const padding = 0.1
    const wPadding = w * padding;
    const hPadding = h * padding;

    const group = target.createGroup(0, 0);
    target.addRect(group, {
      x: lx - wPadding / 2,
      y: -ly - hPadding / 2,
      width: w + wPadding,
      height: h + hPadding,
      stroke: "red",
      strokeWidth: 0.1,
      dash: [1, 1],
      dashEnabled: true,
    });
    return group;
  }
}

export function renderRoom(mapData: MudletMap, roomId: number): string | undefined {
  const room = mapData.rooms[roomId];
  if (!room) {
    return undefined;
  }

  const renderer = setupRenderer(mapData, room.area, room.z);
  renderer.setPosition(roomId);
  const result = renderer.export(new SvgExporter({
    roomId: roomId,
    padding: 20,
  }));
  renderer.destroy();
  return result;
}

function setupRenderer(mapData: MudletMap, areaId: number, z: number): MapRenderer {
  const exportData = MudletMapReader.readerExport(mapData);
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

export function renderLabel(mapData: MudletMap, label: MudletLabel, highlight: boolean = true): string | undefined {
  const areaId = label.areaId ?? -1;
  const [lx, ly, lz] = label.pos;
  
  // Find the closest room to the label in the same area and z-level to center the view
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

  if (closestRoomId === undefined) {
    return undefined;
  }

  const renderer = setupRenderer(mapData, areaId, lz);

  if (highlight) {
    renderer.addSceneOverlay("label-highlight", new LabelHighlightOverlay(label));
  }

  const result = renderer.export(new SvgExporter({
    roomId: closestRoomId,
    padding: 20,
  }));
  renderer.destroy();
  return result;
}
