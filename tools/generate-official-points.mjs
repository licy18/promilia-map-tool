import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const azprRoot = process.env.AZPR_ROOT || 'C:/PC2/Codex/AzPr';
const tableRoot = path.join(azprRoot, 'Assets/ResourcesAssets/Config/NewTable');
const langRoot = path.join(azprRoot, 'Assets/ResourcesLang/chs/Table');

const MAP_TARGETS = {
    shalulu: {
        sceneId: 200,
        worldAreaId: 200000,
        outputBaseName: 'shalulu-worldmap',
        mapId: 'shalulu'
    },
    xinaya: {
        sceneId: 100,
        worldAreaId: 100000,
        outputBaseName: 'xinaya-worldmap',
        mapId: 'xinaya',
        projection: 'centered_native',
        mapWidth: 16384,
        mapHeight: 16384,
        bounds: [[-8192, -8192], [8192, 8192]],
        defaultHiddenCategories: ['collect', 'npc', 'creature', 'spawner']
    },
    fulisi: {
        sceneId: 101,
        worldAreaId: 101000,
        outputBaseName: 'fulisi-worldmap',
        mapId: 'fulisi',
        projection: 'centered_native',
        mapWidth: 16384,
        mapHeight: 16384,
        bounds: [[-8192, -8192], [8192, 8192]],
        defaultHiddenCategories: ['collect', 'npc', 'creature', 'spawner']
    }
};

const ELEMENT_BY_ICON_KEY = {
    huo: { key: 'fire', label: '火' },
    feng: { key: 'wind', label: '风' },
    di: { key: 'earth', label: '地' },
    mu: { key: 'wood', label: '木' },
    bing: { key: 'ice', label: '冰' },
    shui: { key: 'water', label: '水' },
    lei: { key: 'thunder', label: '雷' },
    guang: { key: 'light', label: '光' },
    an: { key: 'dark', label: '暗' }
};

const MARKER_CATEGORY_BY_TYPE = {
    quest: 'explore',
    flower: 'explore',
    teleport: 'explore',
    star_node: 'explore',
    umi: 'explore',
    umi_challenge: 'explore',
    challenge: 'explore',
    bowling_challenge: 'explore',
    kibo_rescue: 'explore',
    dulu_herding: 'explore',
    repair_building: 'explore',
    repair_elevator: 'explore',
    puzzle_fire: 'puzzle',
    puzzle_wind: 'puzzle',
    puzzle_earth: 'puzzle',
    puzzle_wood: 'puzzle',
    puzzle_ice: 'puzzle',
    puzzle_water: 'puzzle',
    puzzle_thunder: 'puzzle',
    puzzle_light: 'puzzle',
    puzzle_dark: 'puzzle',
    egg: 'creature',
    chipo_egg: 'creature',
    capturable_kibo: 'creature',
    chipo_battle: 'creature',
    mating: 'creature',
    creature: 'creature',
    enemy: 'other',
    star: 'other',
    fish: 'other',
    book: 'other',
    shop: 'other',
    photo_spot: 'other',
    custom: 'other'
};

const PUZZLE_CHALLENGE_BY_TITLE = new Map([
    ['息灵的游戏', { category: 'spirit_game', label: '息灵游戏' }],
    ['指路草引路', { category: 'guiding_grass', label: '指路草' }],
    ['迷失的息灵', { category: 'lost_spirit', label: '迷失息灵' }],
    ['祭火之坛', { category: 'fire_altar', label: '祭火之坛' }],
    ['辉印祭坛', { category: 'radiant_altar', label: '辉印祭坛' }],
    ['巡灵踏板', { category: 'spirit_pedal', label: '巡灵踏板' }],
    ['遗碑方阵', { category: 'monument_array', label: '遗碑方阵' }]
]);

const FIELD_BUILDING_RULES = [
    { category: 'collection_building', label: '采集建筑', keywords: ['采集建筑', 'home_collection', 'qihuikuang_collection'] },
    { category: 'lumber_yard', label: '伐木场', keywords: ['伐木场', 'factorylog', 'factorylogging'] },
    { category: 'quarry_yard', label: '采石场', keywords: ['采石场', 'factorystone'] },
    { category: 'mining_yard', label: '采矿场', keywords: ['采矿场', 'factoryoren'] },
    { category: 'hunting_ground', label: '狩猎场', keywords: ['狩猎场', 'gameland'] },
    { category: 'elemental_altar', label: '元素祭坛', keywords: ['元素祭坛', 'elementalaltar'] },
    { category: 'fishing_ground', label: '渔场', keywords: ['渔场', 'fishingground'] },
    { category: 'picking_cabin', label: '采集小屋', keywords: ['采集小屋', 'pickingcabin'] }
];

function fieldBuildingKind(semanticText) {
    return FIELD_BUILDING_RULES.find(rule => includesAny(semanticText, rule.keywords)) || null;
}

function bookKind(spawnerName, resourcePath) {
    const text = `${spawnerName} ${resourcePath}`;
    if (includesAny(text, ['信件', 'letter'])) return { category: 'letter', label: '信件' };
    if (includesAny(text, ['精装典籍', 'book_sp'])) return { category: 'fine_book', label: '精装典籍' };
    if (includesAny(text, ['阅读物', 'readings'])) return { category: 'reading', label: '阅读物' };
    if (includesAny(text, ['书籍', 'fulisibook', 'charlulubook'])) return { category: 'book', label: '书籍' };
    return { category: 'book', label: '书籍档案' };
}

function withMarker(type, typeLabel, options = {}) {
    const markerType = options.markerType || type;
    const markerCategory = options.markerCategory || MARKER_CATEGORY_BY_TYPE[markerType] || '';
    return {
        type,
        typeLabel,
        category: options.category || type,
        categoryLabel: options.categoryLabel || typeLabel,
        markerType,
        markerCategory,
        displayName: options.displayName || '',
        semantic: options.semantic || null
    };
}

function inferElementFromIcon(icon) {
    const match = String(icon || '').match(/tex_battle_icon_([a-z]+)\.png$/i);
    if (!match) return null;
    return ELEMENT_BY_ICON_KEY[match[1].toLowerCase()] || null;
}

function readTable(name) {
    const filePath = path.join(tableRoot, name);
    const table = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(table.rows)) {
        throw new Error(`${name} does not contain rows[]`);
    }
    return { filePath, rows: table.rows };
}

function readRows(root, name) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath)) return [];
    const table = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(table.rows) ? table.rows : [];
}

function buildTextMap(name) {
    return new Map(readRows(langRoot, name)
        .filter(row => row && row.id != null)
        .map(row => [String(row.id), row.value || '']));
}

function textValue(textMap, key) {
    if (key == null || key === '') return '';
    return textMap.get(String(key)) || '';
}

function parseVector(value, expectedParts) {
    if (!value) return null;
    const parts = String(value).split(/[|#]/).map(part => Number(part));
    if (parts.length < expectedParts || parts.some(part => Number.isNaN(part))) return null;
    if (expectedParts === 2) return { x: parts[0], y: parts[1] };
    return { x: parts[0], y: parts[1], z: parts[2] };
}

function parseIdList(value) {
    return String(value || '').split('|').filter(Boolean);
}

function parsePlayableObjectSpawnerIds(value) {
    return String(value || '')
        .split('|')
        .filter(Boolean)
        .map(part => Number(String(part).split('#')[1]))
        .filter(id => Number.isFinite(id) && id > 0);
}

function uniqueList(values) {
    const seen = new Set();
    const output = [];
    values.forEach(value => {
        const key = String(value ?? '');
        if (!key || seen.has(key)) return;
        seen.add(key);
        output.push(value);
    });
    return output;
}

function dualGet(map, key) {
    if (!map || key == null || key === '') return null;
    return map.get(Number(key)) || map.get(String(key)) || null;
}

function dualIndexBy(rows, key = 'id') {
    const map = new Map();
    rows.forEach(row => {
        if (!row || row[key] == null) return;
        map.set(Number(row[key]), row);
        map.set(String(row[key]), row);
    });
    return map;
}

function groupByDualKey(rows, key) {
    const map = new Map();
    rows.forEach(row => {
        if (!row || row[key] == null || row[key] === '') return;
        const keys = [Number(row[key]), String(row[key])];
        keys.forEach(groupKey => {
            if (!map.has(groupKey)) map.set(groupKey, []);
            map.get(groupKey).push(row);
        });
    });
    return map;
}

function includesAny(value, needles) {
    const text = String(value || '').toLowerCase();
    return needles.some(needle => text.includes(String(needle).toLowerCase()));
}

function isTruthyFlag(value) {
    if (value === true) return true;
    if (value === false) return false;
    const text = String(value ?? '').trim().toLowerCase();
    return text === 'true' || text === '1';
}

function parseEnemyGroupRandomEntries(value, sourceField = 'enemyGroupRandom') {
    const entries = [];
    String(value ?? '').split('|').forEach(segmentRaw => {
        const segment = segmentRaw.trim();
        if (!segment) return;
        const hashIndex = segment.indexOf('#');
        const timeKey = (hashIndex >= 0 ? segment.slice(0, hashIndex) : '0').trim() || '0';
        const candidateText = (hashIndex >= 0 ? segment.slice(hashIndex + 1) : segment).trim();
        const candidates = [];
        for (const match of candidateText.matchAll(/(\d+)\s*[,，.]\s*([+-]?\d+(?:\.\d+)?)/gu)) {
            const groupId = match[1];
            const weight = Number(match[2]);
            if (!groupId || groupId === '0' || !Number.isFinite(weight)) continue;
            candidates.push({ groupId, weight });
        }
        const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
        candidates.forEach(candidate => {
            entries.push({
                groupId: candidate.groupId,
                weight: candidate.weight,
                totalWeight,
                probability: totalWeight > 0 ? candidate.weight / totalWeight : null,
                timeKey,
                sourceField,
                sourceValue: segment
            });
        });
    });
    return entries;
}

function formatProbabilityPercent(value) {
    if (value == null || value === '') return '';
    const ratio = Number(value);
    if (!Number.isFinite(ratio)) return '';
    const percent = Math.max(0, Math.min(100, ratio * 100));
    const digits = percent > 0 && percent < 1 ? 3 : 2;
    return `${percent.toFixed(digits).replace(/\.?0+$/u, '')}%`;
}

function buildCaptureContext() {
    const enemies = readRows(tableRoot, 'enemy.json');
    const enemyPacks = readRows(tableRoot, 'enemy_pack.json');
    const enemyPackUnused = readRows(tableRoot, 'enemy_pack_unused.json');
    const pets = readRows(tableRoot, 'pet.json');
    const worldEnemyGroups = readRows(tableRoot, 'world_enemy_group.json');
    const worldEnemyGroupRandoms = readRows(tableRoot, 'world_enemy_group_random.json');
    const petNames = buildTextMap('lang_pet.json');
    const enemyNames = buildTextMap('lang_enemy.json');
    const enemyPackById = dualIndexBy(enemyPackUnused, 'id');
    enemyPacks.forEach(row => {
        enemyPackById.set(Number(row.id), row);
        enemyPackById.set(String(row.id), row);
    });

    return {
        enemyById: dualIndexBy(enemies, 'id'),
        enemyPackById,
        petById: dualIndexBy(pets, 'id'),
        petByUnitId: groupByDualKey(pets, 'unitId'),
        worldEnemyGroupById: dualIndexBy(worldEnemyGroups, 'id'),
        worldEnemyGroupRandomById: dualIndexBy(worldEnemyGroupRandoms, 'id'),
        petNames,
        enemyNames
    };
}

function petDisplayName(pet, captureContext) {
    return textValue(captureContext.petNames, pet?.name) || (pet?.id ? `奇波 ${pet.id}` : '');
}

function enemyDisplayName(enemy, captureContext) {
    return textValue(captureContext.enemyNames, enemy?.name) || (enemy?.id ? `敌人 ${enemy.id}` : '');
}

function shouldTreatWorldMapSpawnerAsEnemyGroup(row, refs, captureContext, worldResourceById) {
    if (!dualGet(captureContext.worldEnemyGroupById, row.spawnerId)) return false;
    if (refs.spawner) return false;
    if (dualGet(worldResourceById, row.spawnerId)) return false;
    return true;
}

function resolvePointEnemyGroupRefs(row, refs, captureContext, worldResourceById) {
    const groupRefs = [];
    const pushRef = (groupId, sourceField, sourceValue, matchedBy, extra = {}) => {
        if (!groupId || !dualGet(captureContext.worldEnemyGroupById, groupId)) return;
        const key = [
            groupId,
            sourceField,
            sourceValue,
            extra.randomGroupId || '',
            extra.randomTimeKey || '',
            extra.randomSourceField || ''
        ].join('\0');
        if (groupRefs.some(item => item.key === key)) return;
        groupRefs.push({
            key,
            groupId: String(groupId),
            sourceField,
            sourceValue,
            matchedBy,
            probability: 1,
            probabilityPercent: '100%',
            ...extra
        });
    };

    if (shouldTreatWorldMapSpawnerAsEnemyGroup(row, refs, captureContext, worldResourceById)) {
        pushRef(row.spawnerId, 'worldmap.spawnerId', row.spawnerId, 'worldmap-spawnerId-as-world_enemy_group');
    }

    const spawner = refs.spawner;
    if (!spawner || !Number(row.expandId || 0)) return groupRefs;

    const objectType = Number(spawner.objectType || 0);
    if (objectType === 50) {
        pushRef(row.expandId, 'worldmap.expandId', row.expandId, 'fixed-enemy-node-expandId');
    } else if (objectType === 51) {
        const randomRow = dualGet(captureContext.worldEnemyGroupRandomById, row.expandId);
        const entries = [
            ...parseEnemyGroupRandomEntries(randomRow?.enemyGroupRandom || '', 'enemyGroupRandom'),
            ...parseEnemyGroupRandomEntries(randomRow?.conditionCompleteEnemyGroup || '', 'conditionCompleteEnemyGroup')
        ];
        entries.forEach(entry => {
            pushRef(entry.groupId, `worldmap.expandId/world_enemy_group_random.${entry.sourceField}`, row.expandId, 'random-enemy-node-expandId', {
                randomGroupId: String(row.expandId),
                randomTimeKey: entry.timeKey,
                randomWeight: entry.weight,
                randomTotalWeight: entry.totalWeight,
                randomProbability: entry.probability,
                randomProbabilityPercent: formatProbabilityPercent(entry.probability),
                randomSourceField: entry.sourceField,
                randomSourceValue: entry.sourceValue,
                probability: entry.probability,
                probabilityPercent: formatProbabilityPercent(entry.probability)
            });
        });
    }

    return groupRefs;
}

function catchableKibosForEnemyPack(pack, captureContext) {
    if (!pack || String(pack.uncatchableType ?? '0') !== '0') return [];
    const enemy = dualGet(captureContext.enemyById, pack.enemyId);
    if (!enemy) return [];
    const petCandidates = [
        dualGet(captureContext.petById, enemy.petId),
        ...(captureContext.petByUnitId.get(Number(enemy.unitId)) || []),
        ...(captureContext.petByUnitId.get(String(enemy.unitId)) || [])
    ].filter(Boolean);
    const pets = uniqueList(petCandidates.map(pet => String(pet.id)))
        .map(petId => dualGet(captureContext.petById, petId))
        .filter(pet => pet && isTruthyFlag(pet.IsCatch));
    return pets.map(pet => ({
        pet,
        enemy,
        pack
    }));
}

function buildCaptureInfo(row, refs, captureContext, worldResourceById) {
    const groupRefs = resolvePointEnemyGroupRefs(row, refs, captureContext, worldResourceById);
    if (groupRefs.length === 0) return null;

    const entriesByKey = new Map();
    groupRefs.forEach(groupRef => {
        const group = dualGet(captureContext.worldEnemyGroupById, groupRef.groupId);
        const seenPetInGroup = new Set();
        parseIdList(group?.enemyList).forEach(packId => {
            const pack = dualGet(captureContext.enemyPackById, packId);
            catchableKibosForEnemyPack(pack, captureContext).forEach(({ pet, enemy }) => {
                const petId = String(pet.id);
                const groupPetKey = `${groupRef.key}\0${petId}`;
                if (seenPetInGroup.has(groupPetKey)) return;
                seenPetInGroup.add(groupPetKey);
                const sourceKey = groupRef.randomGroupId
                    ? `random:${groupRef.randomGroupId}:${groupRef.randomSourceField || ''}`
                    : `fixed:${groupRef.sourceField}`;
                const key = `${petId}\0${sourceKey}`;
                const probability = Number.isFinite(Number(groupRef.probability)) ? Number(groupRef.probability) : null;
                if (!entriesByKey.has(key)) {
                    entriesByKey.set(key, {
                        petId,
                        kiboName: petDisplayName(pet, captureContext),
                        enemyIds: [],
                        enemyNames: [],
                        enemyPackIds: [],
                        groupIds: [],
                        sourceField: groupRef.sourceField,
                        sourceValue: groupRef.sourceValue,
                        matchedBy: groupRef.matchedBy,
                        randomGroupId: groupRef.randomGroupId || '',
                        timeKeys: [],
                        randomSourceField: groupRef.randomSourceField || '',
                        probability: 0,
                        probabilityUnknown: false,
                        weights: [],
                        sourceFiles: [
                            'Assets/ResourcesAssets/Config/NewTable/world_enemy_group.json',
                            groupRef.randomGroupId ? 'Assets/ResourcesAssets/Config/NewTable/world_enemy_group_random.json' : '',
                            'Assets/ResourcesAssets/Config/NewTable/enemy_pack.json',
                            'Assets/ResourcesAssets/Config/NewTable/enemy.json',
                            'Assets/ResourcesAssets/Config/NewTable/pet.json',
                            'Assets/ResourcesLang/chs/Table/lang_pet.json'
                        ].filter(Boolean)
                    });
                }
                const entry = entriesByKey.get(key);
                entry.enemyIds.push(String(enemy.id));
                entry.enemyNames.push(enemyDisplayName(enemy, captureContext));
                entry.enemyPackIds.push(String(pack.id));
                entry.groupIds.push(String(groupRef.groupId));
                if (groupRef.randomTimeKey) entry.timeKeys.push(String(groupRef.randomTimeKey));
                if (probability == null) {
                    entry.probabilityUnknown = true;
                } else {
                    entry.probability += probability;
                }
                if (groupRef.randomWeight != null) {
                    const timeText = groupRef.randomTimeKey ? `时段${groupRef.randomTimeKey} ` : '';
                    entry.weights.push(`${timeText}${groupRef.randomWeight}/${groupRef.randomTotalWeight || '?'}`);
                }
            });
        });
    });

    const entries = Array.from(entriesByKey.values())
        .map(entry => {
            const probability = entry.probabilityUnknown ? null : Math.min(1, entry.probability);
            return {
                ...entry,
                enemyIds: uniqueList(entry.enemyIds),
                enemyNames: uniqueList(entry.enemyNames),
                enemyPackIds: uniqueList(entry.enemyPackIds),
                groupIds: uniqueList(entry.groupIds),
                timeKeys: uniqueList(entry.timeKeys),
                weights: uniqueList(entry.weights),
                probability,
                probabilityPercent: formatProbabilityPercent(probability)
            };
        })
        .sort((a, b) => a.kiboName.localeCompare(b.kiboName, 'zh-CN') || String(a.randomGroupId).localeCompare(String(b.randomGroupId), 'zh-CN'));

    if (entries.length === 0) return null;
    const names = uniqueList(entries.map(entry => entry.kiboName).filter(Boolean));
    return {
        source: 'knowledge_base.world_map_point_enemy_group',
        names,
        summary: entries.map(entry => `${entry.kiboName}${entry.probabilityPercent ? ` ${entry.probabilityPercent}` : ''}`).join('、'),
        entries
    };
}

function buildPlayableGuideTitleMap(playables) {
    const guideGroups = readRows(tableRoot, 'guide_group.json');
    const guideConditions = readRows(tableRoot, 'guide_condition.json');
    const tutorials = readRows(tableRoot, 'tutorial.json');
    const guidePics = readRows(tableRoot, 'guide_pic.json');
    const guidePicNames = buildTextMap('lang_guide_pic.json');
    const tutorialNames = buildTextMap('lang_tutorial.json');
    const conditionById = new Map(guideConditions.map(row => [String(row.id), row]));
    const tutorialById = new Map(tutorials.map(row => [String(row.id), row]));
    const guidePicById = new Map(guidePics.map(row => [String(row.id), row]));
    const guideInfoByObjectSpawnerId = new Map();

    guideGroups.forEach(group => {
        const conditionIds = [
            ...parseIdList(group.guideAndCondition),
            ...parseIdList(group.guideOrCondition)
        ];
        const objectSpawnerIds = conditionIds
            .map(id => conditionById.get(String(id)))
            .filter(condition => Number(condition?.type || 0) === 1002)
            .map(condition => Number(condition.param))
            .filter(id => Number.isFinite(id) && id > 0);
        if (objectSpawnerIds.length === 0) return;

        const titles = [];
        parseIdList(group.tutorialId).forEach(tutorialId => {
            const tutorial = tutorialById.get(String(tutorialId));
            if (!tutorial) return;
            const tutorialTitle = textValue(tutorialNames, tutorial.tutorialName);
            if (tutorialTitle) titles.push(tutorialTitle);
            parseIdList(tutorial.guidePicId).forEach(guidePicId => {
                const guidePic = guidePicById.get(String(guidePicId));
                const guidePicTitle = guidePic ? textValue(guidePicNames, guidePic.title) : '';
                if (guidePicTitle) titles.push(guidePicTitle);
            });
        });

        const info = {
            groupId: group.id,
            tutorialId: group.tutorialId,
            titles: [...new Set(titles)],
            bavTreePath: group.bavTreePath
        };
        objectSpawnerIds.forEach(id => {
            if (!guideInfoByObjectSpawnerId.has(id)) guideInfoByObjectSpawnerId.set(id, []);
            guideInfoByObjectSpawnerId.get(id).push(info);
        });
    });

    const result = new Map();
    playables.forEach(playable => {
        const infos = parsePlayableObjectSpawnerIds(playable.objectAoiRanges)
            .flatMap(id => guideInfoByObjectSpawnerId.get(id) || []);
        if (infos.length === 0) return;
        result.set(Number(playable.id), {
            titles: [...new Set(infos.flatMap(info => info.titles).filter(Boolean))],
            groups: infos.map(info => ({
                groupId: info.groupId,
                tutorialId: info.tutorialId,
                bavTreePath: info.bavTreePath
            }))
        });
    });
    return result;
}

function playableObjectNames(playable, spawnerById, spawnerNames) {
    return [...new Set(parsePlayableObjectSpawnerIds(playable?.objectAoiRanges)
        .map(id => {
            const spawner = spawnerById.get(Number(id));
            return spawner ? textValue(spawnerNames, spawner.name) : '';
        })
        .filter(Boolean))];
}

function playableObjectResourcePaths(playable, spawnerById, worldItemById, worldResourceById) {
    return [...new Set(parsePlayableObjectSpawnerIds(playable?.objectAoiRanges)
        .map(id => {
            const spawner = spawnerById.get(Number(id));
            if (!spawner) return '';
            const resourceId = Number(spawner.resourceId || 0);
            const worldItem = worldItemById.get(resourceId);
            const worldResource = worldResourceById.get(resourceId);
            return worldItem?.resPath || worldResource?.resPath || '';
        })
        .filter(Boolean))];
}

function playableObjectSpawnerIds(playable) {
    return [...new Set(parsePlayableObjectSpawnerIds(playable?.objectAoiRanges).map(id => String(id)))];
}

function classifyPoint(row, refs) {
    const overrideParams = String(row.interactOverrideParams || '');
    const interactOptions = String(row.interactOptions || '');
    const spawnerName = refs.spawnerName || '';
    const spawner = refs.spawner || {};
    const playable = refs.playable || null;
    const playableGuide = refs.playableGuide || null;
    const playableGuideTitle = playableGuide?.titles?.[0] || '';
    const playableObjectSpawnerIds = refs.playableObjectSpawnerIds || [];
    const playableObjectResourcePaths = refs.playableObjectResourcePaths || [];
    const worldResource = refs.worldResource || null;
    const worldItem = refs.worldItem || null;
    const resourceName = refs.worldResourceName || '';
    const resourcePath = String(worldResource?.resPath || worldItem?.resPath || '');
    const filterMark = refs.filterMark || null;
    const filterMarkName = refs.filterMarkName || '';
    const filterMarkIcon = String(filterMark?.icon || '').toLowerCase();
    const element = inferElementFromIcon(spawner.scanIcon);
    const semanticText = [
        spawnerName,
        resourceName,
        resourcePath,
        filterMarkName,
        ...(refs.playableObjectNames || []),
        ...playableObjectResourcePaths,
        ...(playableGuide?.titles || [])
    ].join(' ');

    const hasRepairGuideTitle = includesAny(playableGuideTitle, ['修复断桥', '修复电梯', '修复桥梁']);
    const hasRepairInteraction = /^(4110|4120|4130)(\||$)/.test(interactOptions);
    if (spawnerName === '修复' || hasRepairGuideTitle || hasRepairInteraction) {
        const isElevator = includesAny(resourcePath, ['elevator']) || includesAny(playableGuideTitle, ['修复电梯']);
        const isBridge = includesAny(resourcePath, ['bridge']) || includesAny(playableGuideTitle, ['修复断桥', '修复桥梁']);
        const category = isElevator ? 'repair_elevator' : (isBridge ? 'repair_bridge' : 'repair_building');
        const displayName = isElevator ? '修复电梯' : (isBridge ? (playableGuideTitle || '修复桥梁') : (playableGuideTitle || '建筑修复点'));
        return withMarker(category, displayName, {
            markerType: 'challenge',
            markerCategory: 'explore',
            category,
            categoryLabel: displayName,
            displayName,
            semantic: {
                source: playableGuideTitle ? 'guide_group.tutorial' : (hasRepairInteraction ? 'worldmap.interactOptions' : 'world_spawner.name'),
                guideTitles: playableGuide?.titles || [],
                interactOptions,
                interactOverrideParams: overrideParams,
                playableId: row.expandId,
                playableType: playable?.type ?? '',
                spawnerName,
                objectType: spawner.objectType,
                resourcePath
            }
        });
    }

    if (Number(spawner.objectType || 0) === 31 || includesAny(semanticText, ['奇波蛋', '装饰蛋', '神秘的蛋', 'kibo_egg'])) {
        const isMysteryEgg = includesAny(semanticText, ['神秘奇波蛋', '神秘的蛋', '500200']);
        const isCommonKiboEgg = includesAny(semanticText, ['普通奇波蛋', '500192']);
        const category = isMysteryEgg ? 'mystery_egg' : (isCommonKiboEgg ? 'kibo_egg' : 'decorative_egg');
        const categoryLabel = isMysteryEgg ? '神秘奇波蛋' : (isCommonKiboEgg ? '普通奇波蛋' : '装饰蛋');
        return withMarker(category, categoryLabel, {
            markerType: 'chipo_egg',
            markerCategory: 'creature',
            category,
            categoryLabel,
            displayName: spawnerName || resourceName || categoryLabel,
            semantic: {
                source: 'world_spawner.objectType+name',
                objectType: spawner.objectType,
                spawnerName,
                resourceName,
                resourcePath
            }
        });
    }

    if (includesAny(semanticText, ['交配', '配对', '繁殖', 'mating', 'breed'])) {
        return withMarker('mating_point', '交配点', {
            markerType: 'mating',
            markerCategory: 'creature',
            category: 'mating_point',
            categoryLabel: '交配点',
            displayName: spawnerName || resourceName || '交配点',
            semantic: {
                source: 'world_spawner/resource.name',
                spawnerName,
                resourceName,
                resourcePath
            }
        });
    }

    if (spawnerName === '巢穴入口' || includesAny(resourcePath, ['nestcoop_entry'])) {
        return withMarker('star_nest', '异脉星巢', {
            markerType: 'star',
            markerCategory: 'other',
            category: 'star_nest',
            categoryLabel: '异脉星巢',
            displayName: spawnerName || '异脉星巢',
            semantic: {
                source: 'world_spawner.name+resourcePath',
                spawnerName,
                resourcePath
            }
        });
    }

    if (includesAny(resourcePath, ['investigate']) || includesAny(interactOptions, ['ui_gameevents_gotosee']) || includesAny(overrideParams, ['ui_gameevents_gotosee'])) {
        const isSparkle = includesAny(resourcePath, ['investigate_star']);
        const category = isSparkle ? 'sparkle_investigation' : 'investigation_point';
        const categoryLabel = isSparkle ? '闪光调查点' : '调查点';
        return withMarker(category, categoryLabel, {
            markerType: 'custom',
            markerCategory: 'other',
            category,
            categoryLabel,
            displayName: spawnerName || resourceName || categoryLabel,
            semantic: {
                source: resourcePath ? 'world_item.resPath' : 'worldmap.interactOverrideParams',
                interactOptions,
                interactOverrideParams: overrideParams,
                resourcePath
            }
        });
    }

    if (filterMark) {
        if (Number(filterMark.markType || 0) === 14 || filterMarkIcon.includes('diaoyu')) {
            return withMarker('fish', '钓鱼点', {
                semantic: { source: 'world_filter_mark.icon', icon: filterMark.icon }
            });
        }
        if (Number(filterMark.markType || 0) === 2 || filterMarkIcon.includes('csd') || filterMarkName.includes('星脉')) {
            return withMarker('star_node', '星脉节点', {
                markerType: 'star_node',
                markerCategory: 'explore',
                category: 'star_node',
                categoryLabel: '星脉节点',
                displayName: filterMarkName || '星脉节点',
                semantic: { source: 'world_filter_mark.markType', markType: filterMark.markType, icon: filterMark.icon }
            });
        }
        if (Number(filterMark.markType || 0) === 16 || spawnerName.includes('传送')) {
            return withMarker('teleport', '传送点', {
                markerCategory: 'explore',
                displayName: filterMarkName || spawnerName || '传送点',
                semantic: {
                    source: 'world_filter_mark.markType+world_spawner.name',
                    markType: filterMark.markType,
                    icon: filterMark.icon,
                    spawnerName,
                    resourcePath
                }
            });
        }
        if (Number(filterMark.markType || 0) === 19 || filterMarkName.includes('委托')) {
            return withMarker('commission', '地区委托', {
                markerType: 'quest',
                markerCategory: 'explore',
                semantic: { source: 'world_filter_mark.markType', markType: filterMark.markType }
            });
        }
        if (Number(filterMark.markType || 0) === 3 || filterMarkIcon.includes('npcshop')) {
            return withMarker('shop', '商店', {
                markerCategory: 'other',
                semantic: { source: 'world_filter_mark.icon', icon: filterMark.icon }
            });
        }
        if (Number(filterMark.markType || 0) === 40 || filterMarkName.includes('奇波对决中心')) {
            return withMarker('chipo_duel_center', '奇波对决中心', {
                markerType: 'chipo_battle',
                markerCategory: 'creature',
                category: 'chipo_duel_center',
                categoryLabel: '奇波对决中心',
                displayName: filterMarkName || '奇波对决中心',
                semantic: {
                    source: 'world_filter_mark.markType',
                    markType: filterMark.markType,
                    icon: filterMark.icon,
                    spawnerName,
                    resourcePath
                }
            });
        }
        if (Number(filterMark.markType || 0) === 97 || filterMarkName.includes('稀有奇波')) {
            return withMarker('rare_kibo', '稀有奇波', {
                markerType: 'creature',
                markerCategory: 'creature',
                category: 'rare_kibo',
                categoryLabel: '稀有奇波',
                displayName: filterMarkName || '稀有奇波',
                semantic: {
                    source: 'world_filter_mark.markType',
                    markType: filterMark.markType,
                    icon: filterMark.icon,
                    spawnerName,
                    resourcePath
                }
            });
        }
        if (Number(filterMark.markType || 0) === 23) {
            return classifyChallengePoint(row, refs, 'world_filter_mark.markType');
        }
        if (Number(filterMark.markType || 0) === 21 || filterMarkIcon.includes('kibofeed') || filterMarkName.includes('投食点')) {
            return withMarker('feeding_point', '投食点', {
                markerType: 'custom',
                markerCategory: 'other',
                category: 'feeding_point',
                categoryLabel: '投食点',
                displayName: filterMarkName || spawnerName || '投食点',
                semantic: {
                    source: 'world_filter_mark.markType',
                    markType: filterMark.markType,
                    icon: filterMark.icon,
                    spawnerName,
                    resourcePath
                }
            });
        }
        if (Number(filterMark.markType || 0) === 9 || isFieldBuilding(semanticText, filterMarkIcon)) {
            const kind = fieldBuildingKind(semanticText) || { category: 'field_building', label: '野外建筑' };
            return withMarker(kind.category, kind.label, {
                markerType: 'custom',
                markerCategory: 'other',
                category: kind.category,
                categoryLabel: kind.label,
                displayName: filterMarkName || spawnerName || kind.label,
                semantic: {
                    source: 'world_filter_mark.markType',
                    markType: filterMark.markType,
                    icon: filterMark.icon,
                    spawnerName,
                    resourceName,
                    resourcePath
                }
            });
        }
        return withMarker('map_mark', '地图标记', {
            markerType: 'custom',
            markerCategory: 'other',
            semantic: { source: 'world_filter_mark' }
        });
    }
    if (
        Number(row.expandId || 0) === 10198 ||
        (Number(playable?.type || 0) === 16 && Number(row.spawnerId || 0) === 90061)
    ) {
        return withMarker('challenge_zuzanka', '祖赞卡之梯', {
            markerType: 'challenge',
            markerCategory: 'explore',
            displayName: '祖赞卡之梯',
            semantic: {
                source: 'knowledge_base.world_map_point+playable.type',
                knowledgeUid: targetKnowledgeUid(row),
                playableId: row.expandId,
                playableType: playable?.type ?? '',
                position: row.position
            }
        });
    }
    if (playableGuideTitle) {
        return classifyChallengePoint(row, refs, 'guide_group.tutorial');
    }
    if (
        Number(playable?.type || 0) === 28 &&
        playableObjectSpawnerIds.includes('279') &&
        playableObjectSpawnerIds.includes('6021880') &&
        playableObjectSpawnerIds.includes('6040030')
    ) {
        return withMarker('kibo_rescue', '解救苗鸡', {
            markerType: 'challenge',
            markerCategory: 'explore',
            category: 'kibo_rescue',
            categoryLabel: '解救苗鸡',
            displayName: '解救苗鸡',
            semantic: {
                source: 'knowledge_base.playable.type+objectAoiRanges',
                note: '对象链推断：目标包含苗鸡、救助笼/初始交互物与安全处；语言表原文未直接写“解救苗鸡”。',
                playableId: row.expandId,
                playableType: playable?.type ?? '',
                playableObjectSpawnerIds,
                playableObjectResourcePaths
            }
        });
    }
    if (
        Number(playable?.type || 0) === 19 ||
        includesAny(playableObjectResourcePaths, ['pre_puzzle_bowling_transformkibo'])
    ) {
        return withMarker('bowling_challenge', '保龄球小游戏', {
            markerType: 'challenge',
            markerCategory: 'explore',
            category: 'bowling_challenge',
            categoryLabel: '保龄球小游戏',
            displayName: '保龄球小游戏',
            semantic: {
                source: Number(playable?.type || 0) === 19
                    ? 'knowledge_base.playable_type.TransformKibo'
                    : 'playable.objectAoiRanges+world_item.resPath',
                playableId: row.expandId,
                playableType: playable?.type ?? '',
                playableObjectSpawnerIds,
                playableObjectResourcePaths
            }
        });
    }
    if (includesAny(playableObjectResourcePaths, ['pre_puzzle_dulu_brand']) || Number(playable?.type || 0) === 26) {
        return withMarker('dulu_herding', '嘟噜回巢', {
            markerType: 'challenge',
            markerCategory: 'explore',
            category: 'dulu_herding',
            categoryLabel: '嘟噜回巢',
            displayName: '嘟噜回巢',
            semantic: {
                source: includesAny(playableObjectResourcePaths, ['pre_puzzle_dulu_brand'])
                    ? 'playable.objectAoiRanges+world_item.resPath'
                    : 'playable.type',
                playableId: row.expandId,
                playableType: playable?.type ?? '',
                playableObjectResourcePaths
            }
        });
    }
    if (
        Number(row.expandId || 0) > 0 &&
        Number(spawner.resourceId || 0) === 604000 &&
        Number(playable?.type || 0) === 21
    ) {
        return withMarker('umi_challenge', '寻觅潜影', {
            markerCategory: 'explore',
            displayName: '寻觅潜影',
            semantic: {
                source: 'playable.type+world_spawner.resourceId',
                playableId: row.expandId,
                playableType: playable.type,
                resourceId: spawner.resourceId
            }
        });
    }
    if (includesAny(`${resourceName} ${resourcePath}`, ['暗_乌咪', 'pre_puzzle_spkibo_dark_umi'])) {
        return withMarker('umi', '乌咪', {
            semantic: {
                source: 'world_resource.name+world_item.resPath',
                spawnerName,
                resourceName,
                resourcePath
            }
        });
    }
    if (
        element &&
        Number(spawner.basicType || 0) === 2 &&
        Number(spawner.type || 0) === 30 &&
        [161, 162].includes(Number(spawner.objectType || 0))
    ) {
        return withMarker(`puzzle_${element.key}`, `解谜(${element.label})`, {
            semantic: {
                element: element.key,
                elementLabel: element.label,
                source: 'world_spawner.scanIcon',
                icon: spawner.scanIcon
            }
        });
    }
    if (overrideParams.includes('pageFishingPoint') || spawnerName === '钓鱼点') {
        return withMarker('fish', '钓鱼点');
    }
    if (spawnerName === '传送点' || Number(spawner.objectType || 0) === 303) {
        return withMarker('teleport', '传送点');
    }
    if (isFieldBuilding(semanticText, filterMarkIcon)) {
        const kind = fieldBuildingKind(semanticText) || { category: 'field_building', label: '野外建筑' };
        return withMarker(kind.category, kind.label, {
            markerType: 'custom',
            markerCategory: 'other',
            category: kind.category,
            categoryLabel: kind.label,
            displayName: spawnerName || resourceName || kind.label,
            semantic: {
                source: 'world_spawner.name+resourcePath',
                spawnerName,
                resourceName,
                resourcePath
            }
        });
    }
    if (spawnerName === '拍照点' || resourceName.includes('拍照点') || resourcePath.includes('camerapoint')) {
        return withMarker('photo_spot', '拍照点', {
            displayName: '拍照点',
            semantic: {
                source: worldResource ? 'world_resource.resPath' : 'world_item.resPath',
                resourceName,
                resourcePath
            }
        });
    }
    if (Number(spawner.objectType || 0) === 13 && (/(泥板书|书籍|典籍|档案|信件|阅读物)/.test(spawnerName) || includesAny(resourcePath, ['letter', 'reading', 'book']))) {
        const kind = bookKind(spawnerName, resourcePath);
        return withMarker(kind.category, kind.label, {
            markerType: 'book',
            markerCategory: 'other',
            category: kind.category,
            categoryLabel: kind.label,
            displayName: spawnerName || kind.label,
            semantic: {
                source: 'world_spawner.objectType+name',
                objectType: spawner.objectType,
                spawnerName,
                resourcePath
            }
        });
    }
    if (Number(spawner.objectType || 0) === 12 || Number(spawner.type || 0) >= 80) {
        return withMarker('collect', '采集物', {
            markerType: 'flower',
            markerCategory: 'explore'
        });
    }
    if (overrideParams.includes('1013881')) {
        return withMarker('airship', '飞空艇', {
            markerType: 'custom',
            markerCategory: 'other',
            category: 'airship',
            categoryLabel: '飞空艇',
            displayName: '飞空艇',
            semantic: {
                source: 'worldmap.interactOverrideParams+world_text',
                textId: 1013881,
                text: '请问您是要乘坐飞空艇吗？',
                interactOptions,
                interactOverrideParams: overrideParams
            }
        });
    }
    if (overrideParams.includes('pagePetPrepareDuel')) {
        return withMarker('chipo_battle', '奇波对决', {
            semantic: { source: 'worldmap.interactOverrideParams', interactOverrideParams: overrideParams }
        });
    }
    if (Number(spawner.basicType || 0) === 1 && Number(spawner.objectType || 0) === 1 && spawnerName) {
        return withMarker('npc', 'NPC', {
            markerCategory: 'creature'
        });
    }
    if (Number(spawner.basicType || 0) === 1 && Number(spawner.objectType || 0) === 2 && spawnerName) {
        return withMarker('creature', '普通生物', {
            markerCategory: 'creature',
            semantic: { source: 'world_spawner.basicType+objectType', basicType: spawner.basicType, objectType: spawner.objectType }
        });
    }
    if (Number(spawner.basicType || 0) === 1 && spawnerName) {
        return withMarker('creature', '生物', {
            markerCategory: 'creature'
        });
    }
    if (interactOptions) {
        if (/^(60|66)#/.test(overrideParams)) {
            return withMarker('exploration_challenge', '探索挑战', {
                markerType: 'challenge',
                markerCategory: 'explore',
                category: 'exploration_challenge',
                categoryLabel: '探索挑战',
                displayName: '探索挑战',
                semantic: {
                    source: 'worldmap.interactOverrideParams',
                    interactOptions,
                    interactOverrideParams: overrideParams
                }
            });
        }
        return withMarker('interact', '交互点', {
            markerCategory: 'other'
        });
    }
    if (Number(row.randomEvtId || 0) > 0) {
        return withMarker('event', '随机事件', {
            markerType: 'challenge',
            markerCategory: 'explore'
        });
    }
    if (Number(row.spawnerId || 0) > 0) {
        return withMarker('spawner', '实体', {
            markerCategory: 'other'
        });
    }
    return withMarker('unknown', '未知点位', {
        markerCategory: 'other'
    });
}

function classifyChallengePoint(row, refs, source) {
    const playable = refs.playable || null;
    const playableGuide = refs.playableGuide || null;
    const title = playableGuide?.titles?.[0] || '';
    const playableType = Number(playable?.type || 0);
    const playableObjectNamesText = (refs.playableObjectNames || []).join('、');

    if (includesAny(title, ['修复断桥', '修复电梯', '修复桥梁'])) {
        return withMarker('repair_point', '修复点', {
            markerType: 'challenge',
            markerCategory: 'explore',
            category: 'repair_point',
            categoryLabel: '修复点',
            displayName: title || '修复点',
            semantic: {
                source,
                guideTitles: playableGuide?.titles || [],
                guideGroups: playableGuide?.groups || [],
                playableId: row.expandId,
                playableType
            }
        });
    }

    if (title === '变身菜鸡' || playableType === 5) {
        return withMarker('transform_challenge', '变身挑战', {
            markerType: 'challenge',
            markerCategory: 'explore',
            category: 'transform_challenge',
            categoryLabel: '变身挑战',
            displayName: title || '变身菜鸡',
            semantic: {
                source,
                guideTitles: playableGuide?.titles || [],
                guideGroups: playableGuide?.groups || [],
                playableId: row.expandId,
                playableType,
                playableObjectNames: refs.playableObjectNames || []
            }
        });
    }

    if (playableType === 18 && includesAny(playableObjectNamesText, ['歌唱息灵'])) {
        return withMarker('singing_spirit', '歌唱息灵', {
            markerType: 'challenge',
            markerCategory: 'explore',
            category: 'singing_spirit',
            categoryLabel: '歌唱息灵',
            displayName: '歌唱息灵',
            semantic: {
                source: `${source}+playable.objectAoiRanges`,
                guideTitles: playableGuide?.titles || [],
                guideGroups: playableGuide?.groups || [],
                playableId: row.expandId,
                playableType,
                playableObjectNames: refs.playableObjectNames || []
            }
        });
    }

    if (title === '坐骑挑战' || playableType === 2) {
        return withMarker('challenge_mount', '坐骑挑战', {
            markerType: 'challenge',
            markerCategory: 'explore',
            category: 'challenge_mount',
            categoryLabel: '坐骑挑战',
            displayName: title || '坐骑挑战',
            semantic: {
                source,
                guideTitles: playableGuide?.titles || [],
                guideGroups: playableGuide?.groups || [],
                playableId: row.expandId,
                playableType
            }
        });
    }

    const knownPuzzle = PUZZLE_CHALLENGE_BY_TITLE.get(title);
    if (knownPuzzle) {
        return withMarker(knownPuzzle.category, knownPuzzle.label, {
            markerType: 'challenge',
            markerCategory: 'puzzle',
            category: knownPuzzle.category,
            categoryLabel: knownPuzzle.label,
            displayName: title,
            semantic: {
                source,
                guideTitles: playableGuide?.titles || [],
                guideGroups: playableGuide?.groups || [],
                playableId: row.expandId,
                playableType
            }
        });
    }

    if (source === 'world_filter_mark.markType') {
        return withMarker('exploration_challenge', '探索挑战', {
            markerType: 'challenge',
            markerCategory: 'explore',
            category: 'exploration_challenge',
            categoryLabel: '探索挑战',
            displayName: title || '探索挑战',
            semantic: {
                source,
                guideTitles: playableGuide?.titles || [],
                guideGroups: playableGuide?.groups || [],
                playableId: row.expandId,
                playableType
            }
        });
    }

    return withMarker('puzzle_mechanism', '机关解谜', {
        markerType: 'challenge',
        markerCategory: 'puzzle',
        category: 'puzzle_mechanism',
        categoryLabel: '机关解谜',
        displayName: title || '机关解谜',
        semantic: {
            source,
            guideTitles: playableGuide?.titles || [],
            guideGroups: playableGuide?.groups || [],
            playableId: row.expandId,
            playableType
        }
    });
}

function isFieldBuilding(semanticText, icon) {
    return includesAny(semanticText, [
        '采矿场',
        '伐木场',
        '采石场',
        '狩猎场',
        '元素祭坛',
        '采集小屋',
        '采集建筑',
        '野外采集建筑',
        'factory',
        'gameland',
        'elementalaltar',
        'pickingcabin'
    ]) || includesAny(icon, ['wood', 'ore', 'stone', 'skin', 'particle', 'picking']);
}

function targetKnowledgeUid(row) {
    const cityId = Number(row.cityId || 0);
    if (!cityId || row.id == null) return '';
    return `world_map_point:${cityId}_${row.id}`;
}

function chooseDisplayName(row, classification, refs) {
    if (classification.displayName) return classification.displayName;
    if (refs.filterMarkName) return refs.filterMarkName;
    if (refs.spawnerName) return refs.spawnerName;
    if (refs.exploreName) return refs.exploreName;
    return `${classification.typeLabel} ${row.id}`;
}

function worldToLeaflet(position, area, target) {
    const mapSize = parseVector(area.mapSize, 2);
    const sceneSize = parseVector(area.sceneSize, 2);
    const mapOffset = parseVector(area.mapOffset, 2) || { x: 0, y: 0 };
    if (!mapSize || !sceneSize) return null;

    const rotation = -Number(area.mapRotation || 0) * Math.PI / 180;
    const dx = position.x - mapOffset.x;
    const dz = position.z - mapOffset.y;
    const rotatedX = Math.cos(rotation) * dx - Math.sin(rotation) * dz;
    const rotatedZ = Math.sin(rotation) * dx + Math.cos(rotation) * dz;

    const pixelX = (rotatedX / sceneSize.x + 0.5) * mapSize.x;
    const pixelY = (0.5 - rotatedZ / sceneSize.y) * mapSize.y;

    if (target.projection === 'centered_native') {
        const scaleX = (target.mapWidth || mapSize.x) / mapSize.x;
        const scaleY = (target.mapHeight || mapSize.y) / mapSize.y;
        return {
            lat: (mapSize.y / 2 - pixelY) * scaleY,
            lng: (pixelX - mapSize.x / 2) * scaleX,
            pixelX,
            pixelY
        };
    }

    return {
        lat: mapSize.y - pixelY,
        lng: pixelX,
        pixelX,
        pixelY
    };
}

function isPointInTargetBounds(map, mapSize, target) {
    if (target.bounds) {
        const latValues = target.bounds.map(bound => Number(bound[0]));
        const lngValues = target.bounds.map(bound => Number(bound[1]));
        const minLat = Math.min(...latValues);
        const maxLat = Math.max(...latValues);
        const minLng = Math.min(...lngValues);
        const maxLng = Math.max(...lngValues);
        return map.lat >= minLat && map.lat <= maxLat && map.lng >= minLng && map.lng <= maxLng;
    }
    return map.lat >= 0 && map.lng >= 0 && map.lat <= mapSize.y && map.lng <= mapSize.x;
}

function buildDataset(targetKey) {
    const target = MAP_TARGETS[targetKey];
    if (!target) {
        throw new Error(`Unknown target: ${targetKey}`);
    }

    const worldAreas = readTable('world_area.json');
    const worldMapName = `worldmap_${target.sceneId}.json`;
    const worldMap = readTable(worldMapName);
    const filterMarks = readRows(tableRoot, 'world_filter_mark.json');
    const spawners = readRows(tableRoot, 'world_spawner.json');
    const worldResources = readRows(tableRoot, 'world_resource.json');
    const worldItems = readRows(tableRoot, 'world_item.json');
    const playables = readRows(tableRoot, 'playable.json');
    const playableGuideById = buildPlayableGuideTitleMap(playables);
    const commonWorldRepairs = readRows(tableRoot, 'common_world_repair.json');
    const explores = readRows(tableRoot, 'explore.json');
    const filterMarkNames = buildTextMap('lang_world_filter_mark.json');
    const spawnerNames = buildTextMap('lang_world_spawner.json');
    const exploreNames = buildTextMap('lang_explore.json');

    const filterMarkById = new Map(filterMarks.map(row => [Number(row.id), row]));
    const spawnerById = new Map(spawners.map(row => [Number(row.id), row]));
    const worldResourceById = new Map(worldResources.map(row => [Number(row.id), row]));
    const worldItemById = new Map(worldItems.map(row => [Number(row.id), row]));
    const playableById = new Map(playables.map(row => [Number(row.id), row]));
    const commonWorldRepairById = new Map(commonWorldRepairs.map(row => [Number(row.id), row]));
    const captureContext = buildCaptureContext();
    const exploreBySpawnerId = new Map();
    explores.forEach(row => {
        String(row.fillerspawner || '').split('|').filter(Boolean).forEach(spawnerId => {
            if (!exploreBySpawnerId.has(spawnerId)) exploreBySpawnerId.set(spawnerId, row);
        });
    });
    const area = worldAreas.rows.find(row => Number(row.id) === target.worldAreaId);
    if (!area) {
        throw new Error(`Missing world_area ${target.worldAreaId}`);
    }

    const mapSize = parseVector(area.mapSize, 2);
    const points = [];
    const skipped = [];

    worldMap.rows.forEach(row => {
        const position = parseVector(row.position, 3);
        if (!position) {
            skipped.push({ id: row.id, reason: 'invalid_position' });
            return;
        }
        const map = worldToLeaflet(position, area, target);
        if (!map) {
            skipped.push({ id: row.id, reason: 'missing_transform' });
            return;
        }
        const filterMark = filterMarkById.get(Number(row.filterMark || 0)) || null;
        const spawner = spawnerById.get(Number(row.spawnerId || 0)) || null;
        const worldResource = spawner ? worldResourceById.get(Number(spawner.resourceId || 0)) || null : null;
        const worldItem = spawner ? worldItemById.get(Number(spawner.resourceId || 0)) || null : null;
        const playable = playableById.get(Number(row.expandId || 0)) || null;
        const playableGuide = playableGuideById.get(Number(row.expandId || 0)) || null;
        const objectNames = playableObjectNames(playable, spawnerById, spawnerNames);
        const objectSpawnerIds = playableObjectSpawnerIds(playable);
        const objectResourcePaths = playableObjectResourcePaths(playable, spawnerById, worldItemById, worldResourceById);
        const commonWorldRepair = commonWorldRepairById.get(Number(row.expandId || 0)) || null;
        const explore = exploreBySpawnerId.get(String(row.spawnerId || '')) || null;
        const refs = {
            filterMark,
            spawner,
            worldResource,
            worldItem,
            playable,
            playableGuide,
            commonWorldRepair,
            explore,
            filterMarkName: filterMark ? textValue(filterMarkNames, filterMark.name) : '',
            spawnerName: spawner ? textValue(spawnerNames, spawner.name) : '',
            worldResourceName: worldResource ? worldResource.name || '' : '',
            exploreName: explore ? textValue(exploreNames, explore.exploreName) : '',
            playableObjectNames: objectNames,
            playableObjectSpawnerIds: objectSpawnerIds,
            playableObjectResourcePaths: objectResourcePaths
        };
        const baseClassification = classifyPoint(row, refs);
        const capture = buildCaptureInfo(row, refs, captureContext, worldResourceById);
        const classification = capture
            ? withMarker('capturable_kibo', '可捕捉奇波', {
                markerType: 'creature',
                markerCategory: 'creature',
                category: 'capturable_kibo',
                categoryLabel: '可捕捉奇波',
                displayName: capture.names.length === 1 ? `可捕捉：${capture.names[0]}` : '可捕捉奇波',
                semantic: {
                    source: 'knowledge_base.world_map_point_enemy_group',
                    captureSummary: capture.summary,
                    originalType: baseClassification.type,
                    originalTypeLabel: baseClassification.typeLabel,
                    originalCategory: baseClassification.category,
                    originalCategoryLabel: baseClassification.categoryLabel,
                    originalSemantic: baseClassification.semantic || null
                }
            })
            : baseClassification;
        const displayName = chooseDisplayName(row, classification, refs);
        const inBounds = isPointInTargetBounds(map, mapSize, target);
        points.push({
            id: `${worldMapName}:${row.id}`,
            mapId: target.mapId,
            sceneId: target.sceneId,
            worldAreaId: target.worldAreaId,
            ...classification,
            displayName,
            inBounds,
            map: {
                lat: Number(map.lat.toFixed(3)),
                lng: Number(map.lng.toFixed(3)),
                pixelX: Number(map.pixelX.toFixed(3)),
                pixelY: Number(map.pixelY.toFixed(3))
            },
            game: {
                x: position.x,
                y: position.y,
                z: position.z
            },
            capture,
            raw: {
                id: row.id,
                cityId: row.cityId,
                position: row.position,
                rotation: row.rotation,
                spawnerId: row.spawnerId,
                expandId: row.expandId,
                expandParams: row.expandParams,
                interactOptions: row.interactOptions,
                interactOverrideParams: row.interactOverrideParams,
                filterMark: row.filterMark,
                randomEvtId: row.randomEvtId,
                worldAreaIds: row.worldAreaIds,
                commonTag: row.commonTag,
                blueprint: row.blueprint
            },
            refs: {
                filterMark: filterMark ? {
                    id: filterMark.id,
                    nameKey: filterMark.name,
                    name: refs.filterMarkName,
                    markType: filterMark.markType,
                    worldmapId: filterMark.worldmapId,
                    icon: filterMark.icon
                } : null,
                spawner: spawner ? {
                    id: spawner.id,
                    nameKey: spawner.name,
                    name: refs.spawnerName,
                    type: spawner.type,
                    basicType: spawner.basicType,
                    objectType: spawner.objectType,
                    resourceId: spawner.resourceId,
                    icon: spawner.icon,
                    scanIcon: spawner.scanIcon
                } : null,
                worldResource: worldResource ? {
                    id: worldResource.id,
                    name: worldResource.name,
                    resPath: worldResource.resPath
                } : null,
                worldItem: worldItem ? {
                    id: worldItem.id,
                    resPath: worldItem.resPath
                } : null,
                playable: playable ? {
                    id: playable.id,
                    type: playable.type,
                    stepMax: playable.stepMax,
                    statusReward: playable.statusReward,
                    playScore: playable.playScore,
                    cost: playable.cost,
                    objectNames,
                    objectSpawnerIds,
                    objectResourcePaths,
                    guideTitles: playableGuide?.titles || [],
                    guideGroups: playableGuide?.groups || []
                } : null,
                commonWorldRepair: commonWorldRepair ? {
                    id: commonWorldRepair.id,
                    worldmapId: commonWorldRepair.worldmapId,
                    cost: commonWorldRepair.cost,
                    reward: commonWorldRepair.reward
                } : null,
                explore: explore ? {
                    id: explore.id,
                    nameKey: explore.exploreName,
                    name: refs.exploreName,
                    category: explore.category,
                    filler: explore.filler
                } : null
            },
            source: {
                worldmap: `Assets/ResourcesAssets/Config/NewTable/${worldMapName}`,
                worldArea: 'Assets/ResourcesAssets/Config/NewTable/world_area.json',
                filterMark: filterMark ? 'Assets/ResourcesAssets/Config/NewTable/world_filter_mark.json' : '',
                spawner: spawner ? 'Assets/ResourcesAssets/Config/NewTable/world_spawner.json' : '',
                worldResource: worldResource ? 'Assets/ResourcesAssets/Config/NewTable/world_resource.json' : '',
                worldItem: worldItem ? 'Assets/ResourcesAssets/Config/NewTable/world_item.json' : '',
                playable: playable ? 'Assets/ResourcesAssets/Config/NewTable/playable.json' : '',
                commonWorldRepair: commonWorldRepair ? 'Assets/ResourcesAssets/Config/NewTable/common_world_repair.json' : '',
                enemyGroup: capture ? 'Assets/ResourcesAssets/Config/NewTable/world_enemy_group.json' : '',
                enemyGroupRandom: capture?.entries?.some(entry => entry.randomGroupId) ? 'Assets/ResourcesAssets/Config/NewTable/world_enemy_group_random.json' : '',
                enemyPack: capture ? 'Assets/ResourcesAssets/Config/NewTable/enemy_pack.json' : '',
                enemy: capture ? 'Assets/ResourcesAssets/Config/NewTable/enemy.json' : '',
                pet: capture ? 'Assets/ResourcesAssets/Config/NewTable/pet.json' : '',
                langPet: capture ? 'Assets/ResourcesLang/chs/Table/lang_pet.json' : '',
                langEnemy: capture ? 'Assets/ResourcesLang/chs/Table/lang_enemy.json' : '',
                langFilterMark: filterMark ? 'Assets/ResourcesLang/chs/Table/lang_world_filter_mark.json' : '',
                langSpawner: spawner ? 'Assets/ResourcesLang/chs/Table/lang_world_spawner.json' : ''
            }
        });
    });

    const categories = {};
    points.forEach(point => {
        const key = point.category || point.type || 'unknown';
        if (!categories[key]) {
            categories[key] = {
                key,
                label: point.categoryLabel || point.typeLabel || key,
                markerType: point.markerType || '',
                markerCategory: point.markerCategory || '',
                count: 0,
                inBounds: 0
            };
        }
        categories[key].count++;
        if (point.inBounds) categories[key].inBounds++;
    });

    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        mapId: target.mapId,
        sceneId: target.sceneId,
        worldAreaId: target.worldAreaId,
        sourceRoot: azprRoot,
        sources: {
            worldmap: `Assets/ResourcesAssets/Config/NewTable/${worldMapName}`,
            worldArea: 'Assets/ResourcesAssets/Config/NewTable/world_area.json'
        },
        transform: {
            mode: target.projection === 'centered_native' ? 'world_area_scene_to_centered_native' : 'world_area_scene_to_minimap',
            areaMap: area.areaMap,
            mapSize: area.mapSize,
            mapOffset: area.mapOffset,
            mapRotation: area.mapRotation,
            sceneSize: area.sceneSize,
            mapWidth: target.mapWidth || mapSize.x,
            mapHeight: target.mapHeight || mapSize.y,
            bounds: target.bounds || [[0, 0], [mapSize.y, mapSize.x]],
            note: target.projection === 'centered_native'
                ? `Uses world_area mapSize/mapOffset/mapRotation/sceneSize to project game X/Z onto minimap pixels, then scales ${area.mapSize} minimap pixels into the centered ${target.mapWidth || mapSize.x}|${target.mapHeight || mapSize.y} native tile coordinate space.`
                : 'Uses world_area mapSize/mapOffset/mapRotation/sceneSize to project game X/Z onto minimap pixels, then converts top-left pixels to Leaflet Simple CRS lat/lng.'
        },
        defaultHiddenCategories: target.defaultHiddenCategories || [],
        counts: {
            totalRows: worldMap.rows.length,
            points: points.length,
            inBounds: points.filter(point => point.inBounds).length,
            skipped: skipped.length,
            named: points.filter(point => point.displayName && !point.displayName.endsWith(` ${point.raw.id}`)).length
        },
        categories: Object.values(categories),
        skipped,
        points
    };
}

function writeDataset(targetKey) {
    const target = MAP_TARGETS[targetKey];
    const dataset = buildDataset(targetKey);
    const outputDir = path.join(projectRoot, 'data/official');
    fs.mkdirSync(outputDir, { recursive: true });

    const jsonPath = path.join(outputDir, `${target.outputBaseName}.json`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

    const jsPath = path.join(outputDir, `${target.outputBaseName}.js`);
    const js = [
        'window.OFFICIAL_POINT_DATA = window.OFFICIAL_POINT_DATA || {};',
        `window.OFFICIAL_POINT_DATA[${JSON.stringify(targetKey)}] = ${JSON.stringify(dataset)};`,
        ''
    ].join('\n');
    fs.writeFileSync(jsPath, js, 'utf8');

    console.log(`Generated ${jsonPath}`);
    console.log(`Generated ${jsPath}`);
    console.log(JSON.stringify(dataset.counts, null, 2));
}

const targetKey = process.argv[2] || 'shalulu';
writeDataset(targetKey);
