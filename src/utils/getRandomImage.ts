import fs from 'fs';
import path from 'path';
import exifr from 'exifr';
import config from '../config';

const imagesRootFolder = config.imagesRootFolder;
const periodStart = config.periodStart;
const periodEnd = config.periodEnd;

function isInPeriod(dateStr: string, start: string, end: string) {
  try {
    const datePart = String(dateStr).slice(0, 7);
    const [year, month] = datePart.split(':').map(Number);
    const [startYear, startMonth] = start.split(':').map(Number);
    const [endYear, endMonth] = end.split(':').map(Number);
    const dateVal = new Date(year, month - 1);
    const startVal = new Date(startYear, startMonth - 1);
    const endVal = new Date(endYear, endMonth - 1);
    return dateVal >= startVal && dateVal <= endVal;
  } catch {
    return false;
  }
}

function getRandomSubdir(root: string) {
  const subdirs = fs
    .readdirSync(root)
    .map((d: string) => path.join(root, d))
    .filter((p: string) => fs.statSync(p).isDirectory());
  if (!subdirs.length)
    throw new Error('No subdirectories found in the root directory.');
  return subdirs[Math.floor(Math.random() * subdirs.length)];
}

function getRandomImageFromSubdir(subdir: string) {
  const images = fs
    .readdirSync(subdir)
    .filter(
      (fileName: string) =>
        fileName.toLowerCase().endsWith('.jpg') ||
        fileName.toLowerCase().endsWith('.jpeg')
    );
  if (!images.length) throw new Error(`No jpg/jpeg photos found in ${subdir}.`);
  return path.join(subdir, images[Math.floor(Math.random() * images.length)]);
}

async function getPhotoTakenDate(photoPath: string) {
  try {
    const exif = await exifr.parse(photoPath, ['DateTimeOriginal']);
    if (!exif || !exif.DateTimeOriginal) return 'Date taken not found in EXIF.';
    // exifr returns a Date object; format as 'YYYY:MM:DD HH:MM:SS'
    const d = exif.DateTimeOriginal;
    const pad = (n: string) => String(n).padStart(2, '0');
    return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(
      d.getDate()
    )} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (e) {
    return `Error reading EXIF data: ${e}`;
  }
}

async function getRandomImage(): Promise<string> {
  const maxRetries = 10;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const subdir = getRandomSubdir(imagesRootFolder);
      const imagePath = getRandomImageFromSubdir(subdir);
      const dateTaken = await getPhotoTakenDate(imagePath);
      if (
        typeof dateTaken !== 'string' ||
        dateTaken.includes('not found') ||
        dateTaken.includes('Error')
      ) {
        console.log(
          `Attempt ${
            attempt + 1
          }: Photo ${imagePath} missing EXIF or date, retrying...`
        );
        continue;
      }
      if (isInPeriod(dateTaken, periodStart, periodEnd)) {
        console.log(
          `Attempt ${
            attempt + 1
          }: Photo ${imagePath} is in period ${periodStart}-${periodEnd}, retrying...`
        );
        continue;
      }
      return imagePath;
    } catch (e) {
      console.log(
        `Attempt ${attempt + 1}: Error encountered: ${e}, retrying...`
      );
      continue;
    }
  }
  throw new Error(`Failed to find a valid photo after ${maxRetries} attempts.`);
}

export default getRandomImage;
