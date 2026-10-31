"""SQLite persistence (demo stand-in for the PostgreSQL schema in the design doc).

Swap `connect()` for a SQLAlchemy/asyncpg engine in production; every query in the
tools layer is parameterised and tenant-scoped, so the SQL ports over unchanged.
Tools open the DB read-only (mode=ro) - the same guarantee as `SET TRANSACTION READ ONLY`.
"""
from __future__ import annotations
import sqlite3
from datetime import date, timedelta
from pathlib import Path
from .config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL, custom_domain TEXT);
CREATE TABLE IF NOT EXISTS projects(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL, status TEXT NOT NULL, budget REAL, start_date TEXT, end_date TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS deliverables(
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL, status TEXT NOT NULL, version INTEGER DEFAULT 1, due_date TEXT);
CREATE TABLE IF NOT EXISTS invoices(
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT REFERENCES projects(id), amount REAL NOT NULL, status TEXT NOT NULL, due_date TEXT);
CREATE TABLE IF NOT EXISTS leads(
  id TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP, name TEXT, email TEXT, phone TEXT,
  company TEXT, service_interest TEXT, message TEXT, organization_id TEXT, user_id TEXT);
CREATE TABLE IF NOT EXISTS escalations(
  id TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP, organization_id TEXT, user_id TEXT,
  priority TEXT, summary TEXT, status TEXT DEFAULT 'OPEN');
CREATE TABLE IF NOT EXISTS audit_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT CURRENT_TIMESTAMP,
  organization_id TEXT, user_id TEXT, role TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS threads(
  thread_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL,
  title TEXT DEFAULT 'New conversation', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL REFERENCES threads(thread_id),
  role TEXT NOT NULL, content TEXT NOT NULL, meta TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS knowledge_chunks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, is_global INTEGER NOT NULL DEFAULT 0, organization_id TEXT,
  source TEXT NOT NULL, title TEXT, heading TEXT, content TEXT NOT NULL,
  embedding BLOB NOT NULL, embed_model TEXT NOT NULL, dim INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chunks_scope ON knowledge_chunks(is_global, organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id, status);
"""


def connect(readonly: bool = False) -> sqlite3.Connection:
    path = get_settings().db_path
    if readonly:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    else:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path)
        conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


def _d(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def init_db(seed: bool = True) -> None:
    with connect() as c:
        c.executescript(SCHEMA)
        if seed and not c.execute("SELECT 1 FROM organizations LIMIT 1").fetchone():
            _seed(c)


def _seed(c: sqlite3.Connection) -> None:
    c.executemany("INSERT INTO organizations VALUES (?,?,?)", [
        ("org_acme", "Acme Coffee Co.", "portal.acmecoffee.example"),
        ("org_nova", "Nova Fitness", "clients.novafit.example"),
    ])
    now = date.today().isoformat()
    c.executemany("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)", [
        ("p_acme_brand", "org_acme", "Brand Identity Refresh", "IN_PROGRESS", 18000, _d(-30), _d(12), now),
        ("p_acme_web", "org_acme", "E-commerce Website Redesign", "IN_PROGRESS", 42000, _d(-14), _d(45), now),
        ("p_acme_seo", "org_acme", "SEO Retainer", "ACTIVE", 3500, _d(-90), _d(90), now),
        ("p_nova_app", "org_nova", "Member App Launch Campaign", "IN_PROGRESS", 27000, _d(-20), _d(25), now),
    ])
    c.executemany("INSERT INTO deliverables VALUES (?,?,?,?,?,?)", [
        ("d1", "p_acme_brand", "Logo concepts v1", "PENDING_CLIENT_APPROVAL", 1, _d(2)),
        ("d2", "p_acme_brand", "Brand guidelines PDF", "DRAFT", 1, _d(10)),
        ("d3", "p_acme_brand", "Packaging mockups", "REVISION_REQUESTED", 2, _d(7)),
        ("d4", "p_acme_web", "Homepage wireframes", "APPROVED", 2, _d(-5)),
        ("d5", "p_acme_web", "Product page design", "PENDING_CLIENT_APPROVAL", 1, _d(4)),
        ("d6", "p_acme_web", "Checkout flow prototype", "DRAFT", 1, _d(20)),
        ("d7", "p_acme_seo", "Monthly SEO report", "APPROVED", 3, _d(-2)),
        ("d8", "p_nova_app", "Launch video cut-down", "PENDING_CLIENT_APPROVAL", 1, _d(3)),
    ])
    c.executemany("INSERT INTO invoices VALUES (?,?,?,?,?,?)", [
        ("INV-1001", "org_acme", "p_acme_brand", 6000, "PAID", _d(-40)),
        ("INV-1002", "org_acme", "p_acme_brand", 6000, "OVERDUE", _d(-6)),
        ("INV-1003", "org_acme", "p_acme_web", 14000, "UNPAID", _d(9)),
        ("INV-1004", "org_acme", "p_acme_seo", 3500, "UNPAID", _d(15)),
        ("INV-2001", "org_nova", "p_nova_app", 9000, "UNPAID", _d(5)),
    ])
