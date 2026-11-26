-- Run only by the database operator after the panel's additive schema bootstrap.
-- Passwords are set by provision-database.py; no secret is stored in this file.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='tradersho_panel') THEN CREATE ROLE tradersho_panel LOGIN; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='tradersho_owner_mail') THEN CREATE ROLE tradersho_owner_mail LOGIN; END IF;
END $$;
ALTER ROLE tradersho_panel NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE tradersho_owner_mail NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('tradersho_panel','tradersho_owner_mail'))) THEN
   RAISE EXCEPTION 'Runtime roles must not be members of other roles';
 END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO tradersho_panel;
REVOKE ALL ON SCHEMA public FROM tradersho_owner_mail;
CREATE SCHEMA IF NOT EXISTS owner_mail;
ALTER SCHEMA owner_mail OWNER TO CURRENT_USER;
REVOKE ALL ON SCHEMA owner_mail FROM PUBLIC,tradersho_panel;
GRANT USAGE ON SCHEMA owner_mail TO tradersho_owner_mail;
-- Preserve existing encrypted MFA/counters and audit records in place.
DO $$ BEGIN
 IF to_regclass('public.mail_owners') IS NOT NULL THEN ALTER TABLE public.mail_owners SET SCHEMA owner_mail; END IF;
 IF to_regclass('public.mail_owner_audit') IS NOT NULL THEN ALTER TABLE public.mail_owner_audit SET SCHEMA owner_mail; END IF;
END $$;
CREATE TABLE IF NOT EXISTS owner_mail.mail_owners(user_id text PRIMARY KEY REFERENCES public.users(id),secret text,pending text,last_counter bigint NOT NULL DEFAULT -1);
CREATE TABLE IF NOT EXISTS owner_mail.mail_owner_audit(id bigserial PRIMARY KEY,user_id text NOT NULL,action text NOT NULL,target text NOT NULL,success boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS owner_mail.auth_throttle(key_hash char(64) PRIMARY KEY,attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL);
ALTER TABLE owner_mail.mail_owners OWNER TO CURRENT_USER;
ALTER TABLE owner_mail.mail_owner_audit OWNER TO CURRENT_USER;
ALTER TABLE owner_mail.auth_throttle OWNER TO CURRENT_USER;
REVOKE ALL ON ALL TABLES IN SCHEMA owner_mail FROM PUBLIC,tradersho_panel,tradersho_owner_mail;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA owner_mail FROM PUBLIC,tradersho_panel,tradersho_owner_mail;
GRANT SELECT,INSERT,UPDATE ON owner_mail.mail_owners TO tradersho_owner_mail;
GRANT INSERT ON owner_mail.mail_owner_audit TO tradersho_owner_mail;
GRANT SELECT,INSERT,UPDATE ON owner_mail.auth_throttle TO tradersho_owner_mail;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA owner_mail TO tradersho_owner_mail;
CREATE TABLE IF NOT EXISTS owner_mail.authorized_owner(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 user_id text NOT NULL UNIQUE REFERENCES public.users(id)
);
ALTER TABLE owner_mail.authorized_owner OWNER TO CURRENT_USER;
REVOKE ALL ON owner_mail.authorized_owner FROM PUBLIC,tradersho_panel,tradersho_owner_mail;
CREATE OR REPLACE VIEW owner_mail.owner_identity WITH (security_barrier=true) AS
 SELECT u.id,u.email,u.password_hash,u.account_status FROM public.users u
 JOIN owner_mail.authorized_owner a ON a.user_id=u.id;
CREATE OR REPLACE VIEW owner_mail.owner_sessions WITH (security_barrier=true) AS
 SELECT s.token_hash,s.user_id,s.expires_at FROM public.sessions s
 JOIN owner_mail.authorized_owner a ON a.user_id=s.user_id;
ALTER VIEW owner_mail.owner_identity OWNER TO CURRENT_USER;
ALTER VIEW owner_mail.owner_sessions OWNER TO CURRENT_USER;
GRANT SELECT ON owner_mail.owner_identity,owner_mail.owner_sessions TO tradersho_owner_mail;
-- Revoke the earlier draft's direct column grants, including on repeat provisioning.
REVOKE SELECT(id,email,password_hash,account_status) ON public.users FROM tradersho_owner_mail;
REVOKE SELECT(token_hash,user_id,expires_at) ON public.sessions FROM tradersho_owner_mail;
REVOKE ALL ON public.users,public.sessions FROM tradersho_owner_mail;
-- Existing panel migrations run as the panel role, confined to its public schema.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m') ORDER BY c.relkind='S'
 LOOP
   EXECUTE format('ALTER %s public.%I OWNER TO tradersho_panel',
     CASE item.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,item.relname);
 END LOOP;
END $$;
