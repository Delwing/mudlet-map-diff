const { MudletMapReader } = require("mudlet-map-binary-reader");
const { MapReader } = require("mudlet-map-renderer");
const fs = require("fs");
const renderMapFragment = require("./rendering");
const { singleSvg: singleSvg, doubleSvg: doubleSvg } = require("./svgs");

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
      diffObj[prop] = deepCompare(obj1[prop] || {}, obj2[prop]);
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
 * @param {string} tmpDir tmp directory for mp process file
 *
 * @returns {objec} map diff
 */
let createDiff = async function (map1, map2, outDir, tmpDir = "tmp") {
  if (fs.existsSync(outDir)) {
    fs.rmdirSync(outDir, { recursive: true });
  }
  fs.mkdirSync(outDir);

  [tmpDir, `${tmpDir}/new`, `${tmpDir}/old`].map((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  });

  function preapareMap(mapPath, name) {
    let map = MudletMapReader.read(mapPath);
    MudletMapReader.export(map, `${tmpDir}/${name}`);
    return map;
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

  let processDir = process.cwd();

  let readerV1 = new MapReader(require(`${processDir}/${tmpDir}/old/mapExport.json`), require(`${processDir}/${tmpDir}/old/colors.json`));
  let readerV2 = new MapReader(require(`${processDir}/${tmpDir}/new/mapExport.json`), require(`${processDir}/${tmpDir}/new/colors.json`));

  await Promise.all(
    Object.keys(roomDiff).map(async (roomId) => {
      let img1 = renderMapFragment(readerV1, roomId);
      let img2 = renderMapFragment(readerV2, roomId);
      fs.writeFileSync(`${outDir}/${roomId}.svg`, doubleSvg(img1, img2));
    })
  );

  await Promise.all(
    added.map(async (roomId) => {
      let img = renderMapFragment(readerV2, roomId);
      fs.writeFileSync(`${outDir}/${roomId}.svg`, singleSvg(img));
    })
  );
  await Promise.all(
    deleted.map(async (roomId) => {
      let img = renderMapFragment(readerV1, roomId);
      fs.writeFileSync(`${outDir}/${roomId}.svg`, singleSvg(img));
      resolve();
    })
  );

  fs.rmdirSync(tmpDir, { recursive: true });

  return { changed: roomDiff, added: added, deleted: deleted };
};

module.exports = createDiff;
