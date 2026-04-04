/**
 * 配置定义 - 标记类型、分类、基础地图
 */

// 标记类型配置（分类折叠）
const MARKER_CONFIGS = {
    // === 宝箱类 ===
    chest: { icon: 'fa-gift', color: '#f39c12', label: '宝箱', category: 'chest' },
    chest_wood: { icon: 'fa-box', color: '#8b4513', label: '木质宝箱', category: 'chest' },
    chest_iron: { icon: 'fa-box', color: '#708090', label: '宝箱（敌人守护）', category: 'chest' },
    chest_silver: { icon: 'fa-box', color: '#c0c0c0', label: '宝箱（钥匙开启）', category: 'chest' },
    chest_gold: { icon: 'fa-box', color: '#ffd700', label: '金质宝箱', category: 'chest' },
    chest_holy: { icon: 'fa-box', color: '#e6e6fa', label: '神圣箱', category: 'chest' },
    chest_dark: { icon: 'fa-box', color: '#4b0082', label: '暗黑箱', category: 'chest' },

    // === 探索类 ===
    quest: { icon: 'fa-scroll', color: '#3498db', label: '任务', category: 'explore' },
    flower: { icon: 'fa-fan', color: '#e91e63', label: '采集', category: 'explore' },
    teleport: { icon: 'fa-door-open', color: '#9b59b6', label: '传送', category: 'explore' },
    umi: { icon: 'fa-cat', color: '#2d3436', label: '乌咪', category: 'explore' },
    umi_challenge: { icon: 'fa-cat', color: '#e94560', label: '乌咪-挑战', category: 'explore' },
    challenge: { icon: 'fa-trophy', color: '#ffd700', label: '挑战', category: 'explore' },

    // === 生物类 ===
    egg: { icon: 'fa-egg', color: '#ffeaa7', label: '蛋', category: 'creature' },
    chipo_egg: { icon: 'fa-egg', color: '#ffd700', label: '奇波蛋', category: 'creature' },
    chipo_battle: { icon: 'fa-fist-raised', color: '#ff4500', label: '奇波对决', category: 'creature' },
    mating: { icon: 'fa-heart', color: '#ff69b4', label: '交配点', category: 'creature' },

    // === 奇波类 ===
    chipo_fire: { icon: 'fa-paw', color: '#ff6973', label: '奇波(火)', category: 'chipo' },
    chipo_wind: { icon: 'fa-paw', color: '#ff9639', label: '奇波(风)', category: 'chipo' },
    chipo_earth: { icon: 'fa-paw', color: '#efb600', label: '奇波(地)', category: 'chipo' },
    chipo_wood: { icon: 'fa-paw', color: '#00cf94', label: '奇波(木)', category: 'chipo' },
    chipo_ice: { icon: 'fa-paw', color: '#00cfc6', label: '奇波(冰)', category: 'chipo' },
    chipo_water: { icon: 'fa-paw', color: '#00b6e7', label: '奇波(水)', category: 'chipo' },
    chipo_thunder: { icon: 'fa-paw', color: '#6b8aff', label: '奇波(雷)', category: 'chipo' },
    chipo_light: { icon: 'fa-paw', color: '#e7cb00', label: '奇波(光)', category: 'chipo' },
    chipo_dark: { icon: 'fa-paw', color: '#a270fc', label: '奇波(暗)', category: 'chipo' },

    // === 解谜类 ===
    puzzle_fire: { icon: 'fa-puzzle-piece', color: '#ff6973', label: '解谜(火)', category: 'puzzle' },
    puzzle_wind: { icon: 'fa-puzzle-piece', color: '#ff9639', label: '解谜(风)', category: 'puzzle' },
    puzzle_earth: { icon: 'fa-puzzle-piece', color: '#efb600', label: '解谜(地)', category: 'puzzle' },
    puzzle_wood: { icon: 'fa-puzzle-piece', color: '#00cf94', label: '解谜(木)', category: 'puzzle' },
    puzzle_ice: { icon: 'fa-puzzle-piece', color: '#00cfc6', label: '解谜(冰)', category: 'puzzle' },
    puzzle_water: { icon: 'fa-puzzle-piece', color: '#00b6e7', label: '解谜(水)', category: 'puzzle' },
    puzzle_thunder: { icon: 'fa-puzzle-piece', color: '#6b8aff', label: '解谜(雷)', category: 'puzzle' },
    puzzle_light: { icon: 'fa-puzzle-piece', color: '#e7cb00', label: '解谜(光)', category: 'puzzle' },
    puzzle_dark: { icon: 'fa-puzzle-piece', color: '#a270fc', label: '解谜(暗)', category: 'puzzle' },

    // === 其他 ===
    enemy: { icon: 'fa-skull', color: '#e74c3c', label: '敌人', category: 'other' },
    star: { icon: 'fa-map-marker-alt', color: '#00bfff', label: '异脉星巢', category: 'other' },
    fish: { icon: 'fa-fish', color: '#1e90ff', label: '钓鱼点', category: 'other' },
    book: { icon: 'fa-book', color: '#8e44ad', label: '书籍档案', category: 'other' },
    custom: { icon: 'fa-star', color: '#2ecc71', label: '自定义', category: 'other' }
};

// 分类配置（用于折叠显示）
const CATEGORY_CONFIGS = {
    chest: { label: '宝箱', icon: 'fa-gift', color: '#f39c12' },
    puzzle: { label: '解谜', icon: 'fa-puzzle-piece', color: '#a55eea' },
    explore: { label: '探索', icon: 'fa-compass', color: '#3498db' },
    chipo: { label: '奇波', icon: 'fa-paw', color: '#ff6b9d' },
    creature: { label: '生物', icon: 'fa-paw', color: '#ff6b9d' },
    other: { label: '其他', icon: 'fa-ellipsis-h', color: '#95a5a6' }
};

// 基础地图配置（新手大礼包）
const BASE_MAP_CONFIGS = {
    shalulu: { name: '夏露露村', width: 2048, height: 2048, image: 'maps/shalulu.png', storageKey: 'promilia-markers-shalulu', color: '#4a90d9', type: 'image' },
    xinaya: { name: '新芽山谷', width: 4096, height: 4096, tiles: 'maps/xinaya-tiles', tileRows: 4, tileCols: 4, tileSize: 1024, storageKey: 'promilia-markers-xinaya', color: '#5cb85c', type: 'tiles' },
    fulisi: { name: '弗利斯 (Fleece)', width: 2048, height: 2048, image: 'maps/fulisi.png', storageKey: 'promilia-markers-fulisi', color: '#f0ad4e', type: 'image' }
};
