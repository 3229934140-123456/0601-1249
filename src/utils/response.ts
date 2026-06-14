import { Response } from 'express';
import { ApiResponse } from '../types';

export const success = <T>(res: Response, data?: T, message: string = '操作成功'): void => {
  const response: ApiResponse<T> = {
    code: 0,
    message,
    data,
  };
  res.json(response);
};

export const error = (res: Response, code: number = 500, message: string = '操作失败'): void => {
  const response: ApiResponse = {
    code,
    message,
  };
  res.status(code >= 100 && code < 600 ? code : 500).json(response);
};

export const badRequest = (res: Response, message: string = '参数错误'): void => {
  error(res, 400, message);
};

export const notFound = (res: Response, message: string = '资源不存在'): void => {
  error(res, 404, message);
};

export const paginated = <T>(
  res: Response,
  list: T[],
  total: number,
  page: number,
  pageSize: number,
  message: string = '查询成功'
): void => {
  success(
    res,
    {
      list,
      total,
      page,
      pageSize,
    },
    message
  );
};
