const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

/** Run only on generated Web/WeChat output. Keep the existing logo and watermark. */
function optimizeBuiltStartup(directory) {
  const root = path.resolve(directory), src = path.join(root, 'src');
  const candidates = [root, src].flatMap(dir => fs.existsSync(dir) ? fs.readdirSync(dir)
    .filter(name => /^settings(?:\.[a-f\d]{5,32})?\.json$/i.test(name)).map(name => path.join(dir, name)) : []);
  if (candidates.length === 0) return { status: 'not-present', reason: 'No supported generated settings JSON' };
  if (candidates.length !== 1) throw new Error('Multiple settings files; cannot safely select the launch settings');
  const target = candidates[0], oldName = path.basename(target), data = JSON.parse(fs.readFileSync(target, 'utf8'));
  const splash = data.splashScreen;
  if (!splash || typeof splash.totalTime !== 'number' || splash.totalTime <= 500) return { status: 'unchanged' };
  const beforeMs = splash.totalTime;
  splash.totalTime = 500;
  if (splash.clearColor && ['x', 'y', 'z', 'w'].every(k => typeof splash.clearColor[k] === 'number')) {
    Object.assign(splash.clearColor, { x: 16 / 255, y: 41 / 255, z: 54 / 255, w: 1 });
  }
  const contents = JSON.stringify(data) + '\n';
  const hashed = /^settings\.([a-f\d]{5,32})\.json$/i.exec(oldName);
  const name = hashed ? `settings.${createHash('md5').update(contents).digest('hex').slice(0, hashed[1].length)}.json` : oldName;
  const references = [];
  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (dir === src || dir.startsWith(src + path.sep)) scan(file); }
      else if (file !== target && /\.(?:js|json|cjs|mjs)$/.test(entry.name)) {
        const text = fs.readFileSync(file, 'utf8');
        if (text.includes(oldName)) references.push({ file, text });
      }
    }
  }
  if (hashed && name !== oldName) {
    scan(root); scan(src);
    if (!references.length) throw new Error('Hashed launch settings have no supported JS/JSON reference; left untouched');
  }
  fs.writeFileSync(path.join(path.dirname(target), name), contents);
  if (name !== oldName) {
    for (const { file, text } of references) fs.writeFileSync(file, text.split(oldName).join(name));
    fs.unlinkSync(target);
  }
  return { status: 'optimized', beforeMs, minimumMs: 500, settings: name, updatedReferences: references.length };
}
module.exports = { optimizeBuiltStartup };
if (require.main === module) {
  if (!process.argv[2]) { console.error('Usage: node scripts/optimize-startup.cjs <generated-build-directory>'); process.exitCode = 2; }
  else { try { console.log(JSON.stringify(optimizeBuiltStartup(process.argv[2]), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
}
