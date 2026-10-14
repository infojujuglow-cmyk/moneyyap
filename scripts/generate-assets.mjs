import sharp from 'sharp';

const mark = (stroke, dots = stroke) => `
  <path d="M8.5 38V11.2c0-2.5 3-3.7 4.7-1.9l9.7 9.7c.9.9 2.4.9 3.3 0L36 9.2c1.8-1.8 4.8-.5 4.8 2v14.9c0 1.2-.5 2.4-1.4 3.2l-6.5 6.4" fill="none" stroke="${stroke}" stroke-width="4.9" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="m27.9 29.6 5 5.1V42" fill="none" stroke="${stroke}" stroke-width="4.9" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="13.4" cy="33.1" r="1.45" fill="${dots}"/><circle cx="18.8" cy="33.1" r="1.45" fill="${dots}"/><circle cx="24.2" cy="33.1" r="1.45" fill="${dots}"/>
`;

const gradient = `<linearGradient id="g" x1="8" y1="8" x2="41" y2="43" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#57DD8F"/><stop offset="0.5" stop-color="#35D6A2"/><stop offset="1" stop-color="#12BFA6"/></linearGradient>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 48 48"><defs>${gradient}</defs><rect width="48" height="48" fill="#FAFAF7"/>${mark('url(#g)', '#121923')}</svg>`;
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 48 48"><defs>${gradient}</defs>${mark('url(#g)', '#121923')}</svg>`;
const monochrome = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 48 48">${mark('#000000', '#000000')}</svg>`;
const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#FAFAF7"/></svg>`;
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 48 48"><defs>${gradient}</defs>${mark('url(#g)', '#121923')}</svg>`;

await sharp(Buffer.from(icon)).removeAlpha().png().toFile('assets/icon.png');
await sharp(Buffer.from(icon)).resize(196, 196).removeAlpha().png().toFile('assets/favicon.png');
await sharp(Buffer.from(foreground)).png().toFile('assets/android-icon-foreground.png');
await sharp(Buffer.from(monochrome)).png().toFile('assets/android-icon-monochrome.png');
await sharp(Buffer.from(background)).removeAlpha().png().toFile('assets/android-icon-background.png');
await sharp(Buffer.from(splash)).png().toFile('assets/splash-icon.png');
