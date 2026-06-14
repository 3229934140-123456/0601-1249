import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import './database';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🚀 健康随访AI应用平台服务已启动`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`🔗 API前缀: /api/v1`);
  console.log(`💡 健康检查: GET /api/v1/health`);
  console.log(`\n📋 接口模块:`);
  console.log(`   - 会话管理:    /api/v1/sessions`);
  console.log(`   - 随访记录:    /api/v1/records`);
  console.log(`   - 摘要生成:    /api/v1/summaries`);
  console.log(`   - 待办事项:    /api/v1/todos`);
  console.log(`   - 风险提示:    /api/v1/risk-alerts`);
  console.log(`   - 问卷管理:    /api/v1/questionnaires`);
  console.log(`   - 通知中心:    /api/v1/notifications`);
  console.log(`   - 审计管理:    /api/v1/audit`);
  console.log(`\n⚠️  声明: 本服务仅提供文本整理和提醒建议，不做诊断结论。\n`);
});

export default app;
