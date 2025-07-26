import express, { Request, Response } from 'express';
import { setRoutes } from './routes';
import { ErrorRequestHandler, NextFunction } from 'express';
import config from './config';

const app = express();
const port = config.port;

app.use(express.json());

setRoutes(app);

const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(500).send({ error: err.message });
};

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
