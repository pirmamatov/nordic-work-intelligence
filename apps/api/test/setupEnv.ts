import { testDatabaseUrl } from './testDb';

// Ilova modullari import qilinishidan oldin bajariladi.
process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL).url;
process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = '/tmp/nwi-test-storage';
process.env.MFA_ENFORCED = 'true';
process.env.COOKIE_SECURE = 'true';
process.env.ALLOWED_ORIGINS = 'https://panel.test';
process.env.LOGIN_RATE_LIMIT = '100000';
process.env.SESSION_IDLE_MINUTES = '30';
process.env.SESSION_ABSOLUTE_HOURS = '12';
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.AGENT_CONFIG_SIGNING_KEY ??= Buffer.alloc(32, 9).toString('base64');
