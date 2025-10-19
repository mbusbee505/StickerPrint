#!/usr/bin/env python3
"""
Migration script to fix DeconstructUpload.result_path nullable constraint
This allows the field to be NULL temporarily while the record is created.
"""
import sqlite3
import sys
from pathlib import Path

def migrate_database(db_path):
    """Migrate the database schema to make result_path nullable"""
    print(f"Migrating database: {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if table exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='deconstruct_uploads'
        """)
        if not cursor.fetchone():
            print("Table 'deconstruct_uploads' does not exist yet. No migration needed.")
            return True

        # Check current schema
        cursor.execute("PRAGMA table_info(deconstruct_uploads)")
        columns = cursor.fetchall()
        print(f"Current schema: {columns}")

        # Create new table with nullable result_path
        print("Creating new table with fixed schema...")
        cursor.execute("""
            CREATE TABLE deconstruct_uploads_new (
                id INTEGER PRIMARY KEY,
                image_count INTEGER NOT NULL,
                result_path VARCHAR NULL,
                created_at DATETIME
            )
        """)

        # Copy data from old table to new table
        print("Copying existing data...")
        cursor.execute("""
            INSERT INTO deconstruct_uploads_new (id, image_count, result_path, created_at)
            SELECT id, image_count, result_path, created_at
            FROM deconstruct_uploads
        """)

        # Drop old table
        print("Dropping old table...")
        cursor.execute("DROP TABLE deconstruct_uploads")

        # Rename new table to original name
        print("Renaming new table...")
        cursor.execute("ALTER TABLE deconstruct_uploads_new RENAME TO deconstruct_uploads")

        # Create index on created_at
        print("Creating index...")
        cursor.execute("CREATE INDEX ix_deconstruct_uploads_created_at ON deconstruct_uploads(created_at)")

        # Commit changes
        conn.commit()
        print("✓ Migration completed successfully!")
        return True

    except Exception as e:
        print(f"✗ Migration failed: {e}")
        conn.rollback()
        return False

    finally:
        conn.close()

if __name__ == "__main__":
    # Default to data/app.db in parent directory
    script_dir = Path(__file__).parent
    db_path = script_dir.parent / "data" / "app.db"

    # Allow custom path from command line
    if len(sys.argv) > 1:
        db_path = Path(sys.argv[1])

    if not db_path.exists():
        print(f"Database not found: {db_path}")
        sys.exit(1)

    success = migrate_database(db_path)
    sys.exit(0 if success else 1)
