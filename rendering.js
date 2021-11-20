const { Renderer } = require("mudlet-map-renderer");

module.exports = function (reader, roomId) {
  let roomLimits = reader.roomIndex[roomId];
  if (roomLimits === undefined) {
    return;
  }
  let offset = 25;
  let area = reader.getAreaByRoomId(roomLimits.id, { xMin: roomLimits.x - offset, yMin: roomLimits.y - offset, xMax: roomLimits.x + offset, yMax: roomLimits.y + offset });

  let renderer = new Renderer(null, reader, area, reader.getColors(), { scale: 15, areaName: false });
  renderer.renderSelection(roomId);
  renderer.renderPosition(roomId);
  return renderer.exportSvg(roomId, 20);
};
