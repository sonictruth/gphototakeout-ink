import { Request, Response } from 'express';
import getRandomImage from '../utils/getRandomImage';
import getBitmapFromJpegImage from '../utils/getBitmapFromImage';

class IndexController {
  async getIndex(req: Request, res: Response, next: any) {
    try {

      const imagePath = await getRandomImage();
      const bitmapData = await getBitmapFromJpegImage(imagePath);

      res.setHeader('Content-Type', 'image/bmp');
      res.send(bitmapData);
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
}

export default IndexController;
