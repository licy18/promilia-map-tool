const fs = require('node:fs');
const path = require('node:path');
const shared = require('./src/shared');

const mapIds = ['shalulu', 'xinaya', 'fulisi'];
const rect = { x: 100, y: 80, width: 1200, height: 900 };
const searchTerms = ['乌咪', '保龄球', '解救苗鸡', '飞空艇', '修复电梯'];
let failed = false;

function readDataset(mapId) {
  const file = path.resolve(__dirname, '..', 'data', 'official', `${mapId}-worldmap.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

for (const mapId of mapIds) {
  const dataset = readDataset(mapId);
  const inBounds = dataset.points.filter(point => point.inBounds && point.map);
  if (inBounds.length !== dataset.counts.inBounds) {
    console.error(`${mapId}: counts.inBounds mismatch: ${inBounds.length} !== ${dataset.counts.inBounds}`);
    failed = true;
  }

  for (const point of inBounds) {
    const projected = shared.projectPointToRect(point, dataset, rect);
    if (!projected) {
      console.error(`${mapId}: projection returned null for ${point.id}`);
      failed = true;
      break;
    }
    const insideX = projected.x >= rect.x - 0.001 && projected.x <= rect.x + rect.width + 0.001;
    const insideY = projected.y >= rect.y - 0.001 && projected.y <= rect.y + rect.height + 0.001;
    if (!insideX || !insideY) {
      console.error(`${mapId}: projected point outside calibration rect: ${point.id}`);
      failed = true;
      break;
    }
  }

  const defaultVisible = inBounds.filter(point => shared.isPointVisibleByCategory(point, dataset, {}));
  const hiddenCreature = inBounds.filter(point => (point.markerCategory === 'creature' || point.category === 'creature') && !shared.isPointVisibleByCategory(point, dataset, {}));
  console.log(`${mapId}: ${defaultVisible.length} / ${inBounds.length} default visible, ${hiddenCreature.length} creature points hidden by default`);
}

const allPoints = mapIds.flatMap(mapId => readDataset(mapId).points);
for (const term of searchTerms) {
  const hits = allPoints.filter(point => shared.doesPointMatchSearch(point, term));
  if (hits.length === 0) {
    console.error(`No search hits for ${term}`);
    failed = true;
  } else {
    console.log(`${term}: ${hits.length} hits`);
  }
}

if (failed) {
  process.exitCode = 1;
}
