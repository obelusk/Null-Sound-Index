const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

async function main() {
  const svgPath = path.join(__dirname, '..', 'build', 'icon.svg');
  const buildDir = path.join(__dirname, '..', 'build');
  const sizes = [16, 24, 32, 48, 64, 128, 256];

  const pngBuffers = await Promise.all(
    sizes.map((size) => sharp(svgPath, { density: 384 }).resize(size, size).png().toBuffer())
  );

  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffers[pngBuffers.length - 1]);

  console.log('Generated build/icon.ico and build/icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
