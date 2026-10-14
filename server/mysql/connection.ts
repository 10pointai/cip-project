import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function isMysqlConfigured(): boolean {
  return Boolean(
    process.env.AZURE_MYSQL_URL ||
    process.env.DATABASE_URL ||
    process.env.MYSQL_HOST ||
    process.env.DB_HOST ||
    process.env.AZURE_MYSQL_HOST
  );
}

function parseConnectionConfig() {
  const connUrl = process.env.AZURE_MYSQL_URL || process.env.DATABASE_URL;
  if (connUrl && connUrl.includes('://')) {
    try {
      const u = new URL(connUrl);
      return {
        host: u.hostname || 'localhost',
        user: decodeURIComponent(u.username || 'root'),
        password: decodeURIComponent(u.password || ''),
        database: u.pathname ? u.pathname.replace(/^\//, '') : 'asphalt_db',
        port: u.port ? parseInt(u.port, 10) : 3306,
        ssl: u.searchParams.get('ssl-mode') === 'DISABLED' || process.env.AZURE_MYSQL_SSL === 'false' ? undefined : { rejectUnauthorized: false },
      };
    } catch (e) {
      console.warn('[Azure MySQL] Failed to parse URL, falling back to discrete parameters:', e);
    }
  }

  const host = process.env.AZURE_MYSQL_HOST || process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost';
  const user = process.env.AZURE_MYSQL_USER || process.env.MYSQL_USER || process.env.DB_USER || 'root';
  const password = process.env.AZURE_MYSQL_PASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const database = process.env.AZURE_MYSQL_DATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'asphalt_db';
  const port = parseInt(process.env.AZURE_MYSQL_PORT || process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10);
  const ssl = process.env.AZURE_MYSQL_SSL === 'false' || process.env.MYSQL_SSL === 'false' ? undefined : { rejectUnauthorized: false };

  return { host, user, password, database, port, ssl };
}

export function getMysqlPool(): mysql.Pool | null {
  if (!isMysqlConfigured()) return null;
  if (!pool) {
    const config = parseConnectionConfig();

    pool = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
      waitForConnections: true,
      connectionLimit: 30,
      queueLimit: 0,
      ssl: config.ssl,
    });
  }
  return pool;
}

export function getConnectionStatus() {
  const configured = isMysqlConfigured();
  const rawPool = (pool as any)?.pool;
  const config = configured ? parseConnectionConfig() : null;
  return {
    isConnected: configured,
    configured,
    engine: 'Azure Database for MySQL Flexible Server',
    host: config?.host || 'Not Configured',
    database: config?.database || 'road_infra_erp',
    user: config?.user || 'azureuser',
    port: config?.port || 3306,
    ssl: Boolean(config?.ssl),
    activeConnections: rawPool ? Math.max(0, (rawPool._allConnections?.length || 0) - (rawPool._freeConnections?.length || 0)) : (configured ? 1 : 0),
    totalConnections: rawPool ? (rawPool._allConnections?.length || 0) : (configured ? 1 : 0),
    freeConnections: rawPool ? (rawPool._freeConnections?.length || 0) : 0,
    queueLength: rawPool ? (rawPool._connectionQueue?.length || 0) : 0,
    connectionLimit: 30,
    targetConcurrency: '100+ concurrent operators',
  };
}

export async function testMysqlConnection(): Promise<{ ok: boolean; message: string }> {
  if (!isMysqlConfigured()) {
    return { ok: false, message: 'MySQL environment variables (MYSQL_HOST, MYSQL_USER, etc.) are not configured. Using local persistent storage.' };
  }
  try {
    const p = getMysqlPool();
    if (!p) {
      return { ok: false, message: 'Failed to create MySQL connection pool.' };
    }
    const conn = await p.getConnection();
    try {
      await conn.ping();
      return { ok: true, message: 'Successfully connected to Azure Database for MySQL Flexible Server!' };
    } finally {
      conn.release();
    }
  } catch (error: any) {
    return { ok: false, message: `MySQL Connection Error: ${error.message}` };
  }
}
