exports.configs = Object.fromEntries(['web-desktop', 'web-mobile', 'wechatgame'].map(platform => [platform, { hooks: './hooks.cjs' }]));
