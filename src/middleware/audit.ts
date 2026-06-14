import db from '../database';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

interface AuditOptions {
  action: string;
  resourceType: string;
  getResourceId?: (req: Request, res: Response) => string | undefined;
  logRequest?: boolean;
  logResponse?: boolean;
}

export const createAuditLog = (
  userId: string | undefined,
  action: string,
  resourceType: string,
  resourceId?: string,
  requestParams?: string,
  responseData?: string,
  status: 'success' | 'failed' = 'success',
  errorMessage?: string,
  ipAddress?: string,
  userAgent?: string
): void => {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, request_params, response_data, ip_address, user_agent, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    userId,
    action,
    resourceType,
    resourceId,
    requestParams,
    responseData,
    ipAddress,
    userAgent,
    status,
    errorMessage
  );
};

export const auditMiddleware = (options: AuditOptions) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const userId = req.headers['x-user-id'] as string;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const originalJson = res.json;
    const originalSend = res.send;

    let responseBody: any;

    res.json = function (body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    res.send = function (body: any) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    res.on('finish', () => {
      const resourceId = options.getResourceId ? options.getResourceId(req, res) : undefined;
      const requestParams = options.logRequest
        ? JSON.stringify({
            body: req.body,
            query: req.query,
            params: req.params,
          })
        : undefined;
      const responseData = options.logResponse
        ? typeof responseBody === 'string'
          ? responseBody
          : JSON.stringify(responseBody)
        : undefined;

      const status: 'success' | 'failed' = res.statusCode < 400 ? 'success' : 'failed';
      const errorMessage = res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined;

      createAuditLog(
        userId,
        options.action,
        options.resourceType,
        resourceId,
        requestParams,
        responseData,
        status,
        errorMessage,
        ipAddress,
        userAgent
      );
    });

    next();
  };
};
