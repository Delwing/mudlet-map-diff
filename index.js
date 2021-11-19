const { MudletMapReader } = require("mudlet-map-binary-reader");
const { Renderer, MapReader } = require("mudlet-map-renderer");
const fs = require("fs");
const { loadImage } = require("canvas");

function deepCompare(obj1, obj2) {
  var diffObj = Array.isArray(obj2) ? [] : {};
  if (Array.isArray(obj1)) {
    obj1 = obj1.sort();
  }
  if (Array.isArray(obj2)) {
    obj2 = obj2.sort();
  }
  Object.getOwnPropertyNames(obj2).forEach(function (prop) {
    if (typeof obj2[prop] === "object") {
      diffObj[prop] = deepCompare(obj1[prop], obj2[prop]);
      if ((Array.isArray(diffObj[prop]) && Object.getOwnPropertyNames(diffObj[prop]).length === 1) || Object.getOwnPropertyNames(diffObj[prop]).length === 0) {
        delete diffObj[prop];
      }
    } else if (obj1[prop] !== obj2[prop]) {
      diffObj[prop] = obj2[prop];
    }
  });
  return diffObj;
}

function flatten(obj, parent, res = {}) {
  for (let key in obj) {
    let propName = parent ? parent + "." + key : key;
    if (typeof obj[key] == "object") {
      flatten(obj[key], propName, res);
    } else {
      res[propName] = obj[key];
    }
  }
  return res;
}

/**
 *
 * @param {string} map1 path to old map
 * @param {string} map2 path to new map
 * @param {string} outDir output directory for diff images
 *
 * @returns {objec} map diff
 */
let createDiff = function (map1, map2, outDir) {
  let tmpDir = "tmp";

  if (fs.existsSync(outDir)) {
    fs.rmdirSync(outDir, { recursive: true });
  }
  fs.mkdirSync(outDir);

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }
  if (!fs.existsSync(`${tmpDir}/old`)) {
    fs.mkdirSync(`${tmpDir}/old`);
  }
  if (!fs.existsSync(`${tmpDir}/new`)) {
    fs.mkdirSync(`${tmpDir}/new`);
  }

  function preapareMap(mapPath, name) {
    let map = MudletMapReader.read(mapPath);
    MudletMapReader.export(map, `${tmpDir}/${name}`);
    return map;
  }

  function renderMapFragment(reader, roomId) {
    let roomLimits = reader.roomIndex[roomId];
    if (roomLimits === undefined) {
      return;
    }
    let offset = 25;
    let area = reader.getAreaByRoomId(roomLimits.id, { xMin: roomLimits.x - offset, yMin: roomLimits.y - offset, xMax: roomLimits.x + offset, yMax: roomLimits.y + offset });

    let renderer = new Renderer(null, reader, area, reader.getColors(), { scale: 15 });
    renderer.renderSelection(roomId);
    renderer.renderPosition(roomId);
    return renderer.exportSvg(roomId, 20);
  }

  let v1 = preapareMap(map1, "old");
  let v2 = preapareMap(map2, "new");

  let roomDiff = {};
  let deleted = [];
  let added = [];

  for (const key in v2.rooms) {
    if (v1.rooms[key] === undefined) {
      added.push(key);
    }
  }

  for (const key in v1.rooms) {
    if (v2.rooms[key] === undefined) {
      deleted.push(key);
      continue;
    }
    if (Object.hasOwnProperty.call(v1.rooms, key)) {
      let diff = deepCompare(v1.rooms[key], v2.rooms[key]);
      if (Object.keys(diff).length !== 0) {
        roomDiff[key] = [flatten(diff), flatten(deepCompare(v2.rooms[key], v1.rooms[key]))];
      }
    }
  }

  let readerV1 = new MapReader(require(`${__dirname}/${tmpDir}/old/mapExport.json`), require(`${__dirname}/${tmpDir}/old/colors.json`));
  let readerV2 = new MapReader(require(`${__dirname}/new/mapExport.json`), require(`${__dirname}/${tmpDir}/new/colors.json`));

  for (const key in roomDiff) {
    if (Object.hasOwnProperty.call(roomDiff, key)) {
      let img1 = renderMapFragment(readerV1, key);
      let img2 = renderMapFragment(readerV2, key);

      const { createCanvas } = require("canvas");
      const canvas = createCanvas(1202, 600);
      const ctx = canvas.getContext("2d");
      ctx.textDrawingMode = "glyph";

      Promise.all([loadImage(Buffer.from(img1)), loadImage(Buffer.from(img2))]).then((images) => {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, 1202, 600);
        ctx.drawImage(images[0], 0, 0);
        ctx.drawImage(images[1], 602, 0);
        fs.writeFileSync(`${outDir}/${key}.png`, canvas.toBuffer());
      });
    }
  }

  for (const key in added) {
    if (Object.hasOwnProperty.call(added, key)) {
      let img1 = renderMapFragment(readerV2, added[key]);

      const { createCanvas } = require("canvas");
      const canvas = createCanvas(600, 600);
      const ctx = canvas.getContext("2d");

      Promise.all([loadImage(Buffer.from(img1))]).then((images) => {
        ctx.drawImage(images[0], 0, 0);
        fs.writeFileSync(`${outDir}/added_${added[key]}.png`, canvas.toBuffer());
      });
    }
  }

  for (const key in deleted) {
    if (Object.hasOwnProperty.call(deleted, key)) {
      let img1 = renderMapFragment(readerV1, deleted[key]);

      const { createCanvas } = require("canvas");
      const canvas = createCanvas(600, 600);
      const ctx = canvas.getContext("2d");

      Promise.all([loadImage(Buffer.from(img1))]).then((images) => {
        ctx.drawImage(images[0], 0, 0);
        fs.writeFileSync(`${outDir}/deleted_${deleted[key]}.png`, canvas.toBuffer());
      });
    }
  }

  fs.rmdirSync(tmpDir, { recursive: true });

  return roomDiff;
};

module.exports = createDiff;
