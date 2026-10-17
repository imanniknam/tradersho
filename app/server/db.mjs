import pg from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Set it to a PostgreSQL connection string before starting the server.')
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
})

// Idempotent schema bootstrap keeps the first Railway deployment usable without
// a separate one-off shell command. Later schema changes belong in numbered migrations.
export async function migrate() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        name varchar(80) NOT NULL,
        email varchar(160) NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash char(64) PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

      CREATE TABLE IF NOT EXISTS auth_throttle (
        key_hash char(64) PRIMARY KEY,
        attempts integer NOT NULL DEFAULT 0,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS auth_throttle_expires_at_idx ON auth_throttle (expires_at);

      CREATE TABLE IF NOT EXISTS subscriptions (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_code varchar(30) NOT NULL CHECK (plan_code IN ('plus', 'pro')),
        status varchar(20) NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (ends_at > starts_at)
      );
      CREATE INDEX IF NOT EXISTS subscriptions_user_active_idx ON subscriptions (user_id, status, ends_at);

      CREATE TABLE IF NOT EXISTS tool_entitlements (
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tool_id varchar(60) NOT NULL,
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, tool_id)
      );

      CREATE TABLE IF NOT EXISTS course_progress (
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id varchar(60) NOT NULL,
        completed_lessons integer NOT NULL DEFAULT 0 CHECK (completed_lessons >= 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, course_id)
      );

      CREATE TABLE IF NOT EXISTS support_tickets (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject varchar(100) NOT NULL,
        message varchar(2000) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx ON support_tickets (user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS rebate_requests (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        broker varchar(80) NOT NULL,
        account varchar(80) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS rebate_requests_user_created_idx ON rebate_requests (user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS plan_interests (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_code varchar(30) NOT NULL CHECK (plan_code IN ('plus', 'pro')),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, plan_code)
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount_irr bigint NOT NULL CHECK (amount_irr <> 0),
        status varchar(20) NOT NULL CHECK (status IN ('pending', 'settled', 'reversed')),
        kind varchar(30) NOT NULL CHECK (kind IN ('deposit', 'purchase', 'refund', 'adjustment')),
        reference varchar(120) UNIQUE,
        description varchar(255),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS wallet_transactions_user_created_idx ON wallet_transactions (user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS candle_datasets (
        id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL, symbol text NOT NULL, kind text NOT NULL, source text NOT NULL,
        bars jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS candle_datasets_owner ON candle_datasets(user_id);
      CREATE TABLE IF NOT EXISTS candle_replay_sessions (
        id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        dataset_id text NOT NULL, start_cursor integer NOT NULL CHECK (start_cursor>=49),
        cursor integer NOT NULL CHECK(cursor>=start_cursor), version integer NOT NULL DEFAULT 0,
        last_request_id uuid, drawing_version integer NOT NULL DEFAULT 0,
        drawings jsonb NOT NULL DEFAULT '[]'::jsonb, settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        paper jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS candle_replay_owner ON candle_replay_sessions(user_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS reference_replay_sessions (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        dataset_id text NOT NULL,
        start_cursor integer NOT NULL CHECK (start_cursor >= 19),
        cursor integer NOT NULL CHECK (cursor >= start_cursor),
        version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
        last_request_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS reference_replay_sessions_owner ON reference_replay_sessions (user_id, created_at DESC);
      ALTER TABLE reference_replay_sessions ADD COLUMN IF NOT EXISTS drawings jsonb NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE reference_replay_sessions ADD COLUMN IF NOT EXISTS drawing_version integer NOT NULL DEFAULT 0 CHECK (drawing_version >= 0);
      ALTER TABLE reference_replay_sessions ADD COLUMN IF NOT EXISTS simulation jsonb;

    `)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
