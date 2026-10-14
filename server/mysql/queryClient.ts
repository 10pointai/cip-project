import mysql from 'mysql2/promise';
import { getMysqlPool, isMysqlConfigured } from './connection';

export interface QueryResult<T = any> {
  rows: T[];
  affectedRows?: number;
  insertId?: number;
}

/**
 * Executes a parameterized SQL query on Azure Database for MySQL Flexible Server.
 * Automatically acquires and releases a pooled connection.
 */
export async function executeMysqlQuery<T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  if (!isMysqlConfigured()) {
    throw new Error('MySQL is not configured in environment variables');
  }

  const pool = getMysqlPool();
  if (!pool) {
    throw new Error('MySQL connection pool is not initialized');
  }

  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    let conn: mysql.PoolConnection | null = null;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.query(sql, params);
      return rows as T[];
    } catch (err: any) {
      const isTransient =
        err.code === 'PROTOCOL_CONNECTION_LOST' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ER_LOCK_DEADLOCK';

      if (isTransient && attempts < maxAttempts) {
        console.warn(`[Azure MySQL Query] Transient error (${err.code}). Retrying attempt ${attempts + 1}...`);
        await new Promise((resolve) => setTimeout(resolve, 200 * attempts));
        continue;
      }
      throw err;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }

  throw new Error('MySQL query failed after maximum retry attempts');
}

/**
 * Executes a parameterized SQL query and returns the first matching row or null.
 */
export async function executeMysqlOne<T = any>(
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await executeMysqlQuery<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Executes an atomic multi-statement transaction with native InnoDB ACID guarantees.
 * Handles START TRANSACTION, COMMIT, and automatic ROLLBACK on failure.
 */
export async function executeMysqlTransaction<T>(
  callback: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  if (!isMysqlConfigured()) {
    throw new Error('MySQL is not configured in environment variables');
  }

  const pool = getMysqlPool();
  if (!pool) {
    throw new Error('MySQL connection pool is not initialized');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error: any) {
    try {
      await conn.rollback();
    } catch (rollbackErr: any) {
      console.error('[Azure MySQL Transaction] Rollback error:', rollbackErr.message);
    }
    throw error;
  } finally {
    conn.release();
  }
}
