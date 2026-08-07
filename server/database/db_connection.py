import os
import pymysql
from pymysql.cursors import DictCursor


def get_db_connection():
    """Create a MySQL connection using environment variables."""
    host = os.getenv("DB_HOST", "localhost")
    port = int(os.getenv("DB_PORT", "3306"))
    user = os.getenv("DB_USER", "root")
    password = os.getenv("DB_PASSWORD", "root123")
    database = os.getenv("DB_NAME", "explainable_ai_medical")

    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        cursorclass=DictCursor,
    )


def test_connection():
    """Simple helper to verify that the database can be reached."""
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            return cursor.fetchone()
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        result = test_connection()
        print("✅ Connected to MySQL successfully!")
        print("Test query result:", result)
    except Exception as e:
        print("❌ Connection failed:", e)