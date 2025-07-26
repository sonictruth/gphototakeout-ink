import jpeg from 'jpeg-js';
import { buildPaletteSync, applyPaletteSync, utils } from 'image-q';
import { BmpEncoder } from './bmpEncoder';
import fs from 'fs';
import { Jimp } from 'jimp';
import * as JimpContainer from 'jimp';
import exifr from 'exifr';
import config from '../config';
const customPaletteRedBlackWhite = [255, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 0];

const targetWidth = config.targetWidth;
const targetHeight = config.targetHeight;

function scaleImageToFitAndAddBorders(
  srcData: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): Uint8Array {
  const srcAspect = srcWidth / srcHeight;
  const dstAspect = dstWidth / dstHeight;

  let newWidth = dstWidth;
  let newHeight = dstHeight;
  if (srcAspect > dstAspect) {
    newWidth = dstWidth;
    newHeight = Math.round(dstWidth / srcAspect);
  } else {
    newHeight = dstHeight;
    newWidth = Math.round(dstHeight * srcAspect);
  }

  const xOffset = Math.floor((dstWidth - newWidth) / 2);
  const yOffset = Math.floor((dstHeight - newHeight) / 2);

  const resized = new Uint8Array(dstWidth * dstHeight * 4);
  for (let i = 0; i < resized.length; i += 4) {
    resized[i] = 255;
    resized[i + 1] = 255;
    resized[i + 2] = 255;
    resized[i + 3] = 255;
  }

  for (let y = 0; y < newHeight; y++) {
    const srcY = Math.floor((y * srcHeight) / newHeight);
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor((x * srcWidth) / newWidth);
      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = ((y + yOffset) * dstWidth + (x + xOffset)) * 4;
      resized[dstIdx] = srcData[srcIdx];
      resized[dstIdx + 1] = srcData[srcIdx + 1];
      resized[dstIdx + 2] = srcData[srcIdx + 2];
      resized[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }
  return resized;
}

function decodeJpegToRGBA(pathToJpeg: string): jpeg.ImageData {
  const jpegData = fs.readFileSync(pathToJpeg);
  const meta = jpeg.decode(jpegData, { useTArray: true });
  if (!meta || !meta.data) {
    throw new Error('Failed to decode JPEG image');
  }
  return meta;
}

async function getBitmapFromJpegImage(pathToJpeg: string): Promise<Buffer> {
  const imageData = decodeJpegToRGBA(pathToJpeg);

  const exifData = await exifr.parse(pathToJpeg, { tiff: true, exif: true });
  let text = '';
  if (exifData && exifData.DateTimeOriginal) {
    const date = exifData.DateTimeOriginal;
    const year = date.getFullYear();
    const month = date.toLocaleString('default', { month: 'long' });
    text += `${month} ${year}`;
  }

  const font = await JimpContainer.loadFont(
    './node_modules/@jimp/plugin-print/fonts/open-sans/open-sans-16-black/open-sans-16-black.fnt'
  );

  let imageRGBA = scaleImageToFitAndAddBorders(
    imageData.data,
    imageData.width,
    imageData.height,
    targetWidth,
    targetHeight
  );

  const jimpImage = new Jimp({
    data: Buffer.from(imageRGBA),
    width: targetWidth,
    height: targetHeight,
  });

  /*
  jimpImage.resize({
    w: targetWidth,
    h: targetHeight,
    mode: JimpContainer.ResizeStrategy.BILINEAR,
  });
  */

  const textWidth = JimpContainer.measureText(font, text);
  const textHeight = JimpContainer.measureTextHeight(font, text, targetWidth);

  const textX = Math.floor((targetWidth - textWidth) / 2);
  const textY = targetHeight - textHeight - 10;
  const rectColor = 0xffffffff;

  jimpImage.scan(textX, textY, textWidth, textHeight, function (x, y, idx) {
    jimpImage.bitmap.data.writeUInt32BE(rectColor, idx);
  });

  jimpImage.print({
    font,
    x: textX,
    y: textY,
    text: {
      text,
    },
  });

  imageRGBA = new Uint8Array(jimpImage.bitmap.data);

  const inPointContainer = utils.PointContainer.fromUint8Array(
    imageRGBA,
    targetWidth,
    targetHeight
  );

  const customPoints = utils.PointContainer.fromUint8Array(
    customPaletteRedBlackWhite,
    customPaletteRedBlackWhite.length / 4,
    1
  );

  const colorDistanceFormula = 'euclidean';
  const imageQuantization = 'stucki';
  const paletteQuantization = 'rgbquant';

  const imageQPalette = buildPaletteSync([customPoints], {
    colorDistanceFormula,
    paletteQuantization,
    colors: customPaletteRedBlackWhite.length / 4,
  });

  const outPointContainer = applyPaletteSync(inPointContainer, imageQPalette, {
    colorDistanceFormula,
    imageQuantization,
  });

  const outArrayRGBA = outPointContainer.toUint8Array();

  const outArrayABGR = new Uint8Array(outArrayRGBA.length);

  const bmpPalette: {
    red: number;
    green: number;
    blue: number;
    quad: number;
  }[] = [];

  for (let i = 0; i < outArrayRGBA.length; i += 4) {
    const color = {
      red: outArrayRGBA[i],
      green: outArrayRGBA[i + 1],
      blue: outArrayRGBA[i + 2],
      quad: outArrayRGBA[i + 3],
    };
    const hasColor = bmpPalette.some(
      (c) =>
        c.red === color.red && c.green === color.green && c.blue === color.blue
    );
    if (!hasColor) {
      bmpPalette.push(color);
    }
    outArrayABGR[i] = color.quad;
    outArrayABGR[i + 1] = color.blue;
    outArrayABGR[i + 2] = color.green;
    outArrayABGR[i + 3] = color.red;
  }

  if (bmpPalette.length > 16) {
    throw new Error('Palette has more than 16 colors');
  } else {
    for (let i = bmpPalette.length; i < 16; i++) {
      bmpPalette.push({ red: 0, green: 0, blue: 0, quad: 0 });
    }
  }
  const newBMP = new BmpEncoder({
    data: outArrayABGR,
    width: outPointContainer.getWidth(),
    height: outPointContainer.getHeight(),
    bitPP: 4,
    colors: bmpPalette.length,
    palette: bmpPalette,
  });

  newBMP.encode();
  return newBMP.data;
}

export default getBitmapFromJpegImage;
