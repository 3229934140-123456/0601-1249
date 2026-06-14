import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', err.message);
  console.error(err.stack);
  error(res, 500, '服务器内部错误');
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  error(res, 404, '接口不存在');
};
