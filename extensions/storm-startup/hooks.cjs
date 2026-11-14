const { optimizeBuiltStartup } = require('../../scripts/optimize-startup.cjs');
exports.title = 'Storm Archers startup';
exports.onAfterBuild = async (options, result) => {
  if (typeof result?.dest !== 'string') throw new Error('Storm startup: Creator did not provide the generated build directory');
  console.info('[StormStartup]', JSON.stringify(optimizeBuiltStartup(result.dest)));
};
