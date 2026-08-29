import pymysql
import threading
from server.database.db_connection import get_db_connection

_ADMIN_SCHEMA_LOCK = threading.Lock()

def ensure_admin_schema():
    """Add admin account/audit tables to databases created before this feature."""
    with _ADMIN_SCHEMA_LOCK:
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT COUNT(*) AS count FROM information_schema.columns
                    WHERE table_schema = DATABASE() AND table_name = 'users'
                      AND column_name = 'account_status'
                """)
                if cursor.fetchone()["count"] == 0:
                    cursor.execute("""
                        ALTER TABLE users ADD COLUMN account_status
                        ENUM('approved', 'suspended', 'revoked') NOT NULL DEFAULT 'approved'
                        AFTER role
                    """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS login_history (
                        login_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT DEFAULT NULL,
                        email VARCHAR(150) NOT NULL,
                        role VARCHAR(20) DEFAULT NULL,
                        successful TINYINT(1) NOT NULL DEFAULT 0,
                        ip_address VARCHAR(45) DEFAULT NULL,
                        logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
                    )
                """)
            conn.commit()
        finally:
            conn.close()


def create_user(name, email, password_hash, role, institution=None):
    """Create a new user in the database and return user_id."""
    ensure_admin_schema()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                INSERT INTO users (name, email, password_hash, role, institution)
                VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (name, email, password_hash, role, institution))
            conn.commit()
            return cursor.lastrowid
    finally:
        conn.close()


def get_user_by_email(email):
    """Fetch user dictionary by email, or return None if not found."""
    ensure_admin_schema()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "SELECT * FROM users WHERE email = %s"
            cursor.execute(sql, (email,))
            return cursor.fetchone()
    finally:
        conn.close()


def get_user_by_id(user_id):
    """Fetch user dictionary by user_id."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "SELECT user_id, name, email, role, account_status, institution, created_at FROM users WHERE user_id = %s"
            cursor.execute(sql, (user_id,))
            return cursor.fetchone()
    finally:
        conn.close()


def create_patient(name, age, gender, created_by=None):
    """Create a patient record and return patient_id."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                INSERT INTO patients (name, age, gender, created_by)
                VALUES (%s, %s, %s, %s)
            """
            cursor.execute(sql, (name, age, gender, created_by))
            conn.commit()
            return cursor.lastrowid
    finally:
        conn.close()


def save_diagnosis(patient_id, disease_type, result, confidence, risk_level, diagnosed_by):
    """Save a diagnosis record and return diagnosis_id."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                INSERT INTO diagnoses (patient_id, disease_type, result, confidence, risk_level, diagnosed_by)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (patient_id, disease_type, result, float(confidence), risk_level, diagnosed_by))
            conn.commit()
            return cursor.lastrowid
    finally:
        conn.close()


def save_feature_inputs(diagnosis_id, features_list):
    """
    Bulk insert feature input rows.
    Accepts:
    - dict of {feature_name: value}
    - list of dicts: [{'feature_name': 'glucose', 'feature_value': 280, 'risk_flag': 'RED'}, ...]
      or [{'feature': 'glucose', 'value': 280, 'status': 'HIGH'}, ...]
    """
    if not features_list:
        return

    rows = []
    if isinstance(features_list, dict):
        for fname, val in features_list.items():
            rows.append((diagnosis_id, str(fname), float(val), None))
    elif isinstance(features_list, list):
        for item in features_list:
                fname = item.get("feature_name") or item.get("feature") or item.get("name")
                fval = None
                for k in ("feature_value", "value", "val"):
                    if k in item and item[k] is not None:
                        fval = item[k]
                        break
                rflag = item.get("risk_flag") or item.get("status") or item.get("flag")
                if rflag not in ("RED", "YELLOW", "GREEN"):
                    rflag = None
                if fname is not None and fval is not None:
                    rows.append((diagnosis_id, str(fname), float(fval), rflag))

    if not rows:
        return

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                INSERT INTO feature_inputs (diagnosis_id, feature_name, feature_value, risk_flag)
                VALUES (%s, %s, %s, %s)
            """
            cursor.executemany(sql, rows)
            conn.commit()
    finally:
        conn.close()


def save_lime_scores(diagnosis_id, lime_list):
    """
    Bulk insert LIME score rows.
    Accepts:
    - list of dicts: [{'feature': 'glucose', 'score': 78.2}, ...]
      or [{'feature_name': 'glucose', 'importance_score': 78.2, 'rank_order': 1}, ...]
    """
    if not lime_list:
        return

    rows = []
    for idx, item in enumerate(lime_list, start=1):
        if isinstance(item, dict):
            fname = item.get("feature_name") or item.get("feature") or item.get("name")
            score = item.get("importance_score") or item.get("score") or item.get("importance")
            rank = item.get("rank_order") or item.get("rank") or idx
            if fname is not None and score is not None:
                rows.append((diagnosis_id, str(fname), float(score), int(rank)))

    if not rows:
        return

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                INSERT INTO lime_scores (diagnosis_id, feature_name, importance_score, rank_order)
                VALUES (%s, %s, %s, %s)
            """
            cursor.executemany(sql, rows)
            conn.commit()
    finally:
        conn.close()


def get_history(user_id=None, role=None, disease_filter=None, result_filter=None):
    """
    Fetch diagnosis history.
    - If role == 'doctor' and user_id is provided, only return diagnoses where diagnosed_by = user_id.
    - Admin/researcher see all diagnoses.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT 
                    d.diagnosis_id,
                    p.patient_id,
                    p.name AS patient_name,
                    p.age,
                    p.gender,
                    d.disease_type AS disease,
                    d.result,
                    d.confidence,
                    d.risk_level,
                    d.diagnosed_at AS date,
                    u.name AS doctor_name,
                    d.diagnosed_by
                FROM diagnoses d
                JOIN patients p ON d.patient_id = p.patient_id
                JOIN users u ON d.diagnosed_by = u.user_id
            """
            conditions = []
            params = []

            if role == "doctor" and user_id:
                conditions.append("d.diagnosed_by = %s")
                params.append(user_id)

            if disease_filter:
                conditions.append("d.disease_type = %s")
                params.append(disease_filter)

            if result_filter:
                conditions.append("d.result = %s")
                params.append(result_filter)

            if conditions:
                sql += " WHERE " + " AND ".join(conditions)

            sql += " ORDER BY d.diagnosed_at DESC"

            cursor.execute(sql, params)
            results = cursor.fetchall()
            
            if results:
                # Fetch LIME scores for these records
                diag_ids = [r["diagnosis_id"] for r in results]
                format_strings = ','.join(['%s'] * len(diag_ids))
                cursor.execute(f"SELECT diagnosis_id, feature_name AS feature, importance_score AS score FROM lime_scores WHERE diagnosis_id IN ({format_strings})", tuple(diag_ids))
                lime_rows = cursor.fetchall()
                lime_map = {}
                for row in lime_rows:
                    did = row["diagnosis_id"]
                    if did not in lime_map: lime_map[did] = []
                    lime_map[did].append({"feature": row["feature"], "score": row["score"]})
                for row in results:
                    row["lime_scores"] = lime_map.get(row["diagnosis_id"], [])

            for row in results:
                if not isinstance(row.get("date"), str) and row.get("date") is not None:
                    row["date"] = row["date"].strftime("%Y-%m-%d %H:%M:%S")
                row["formatted_id"] = f"D{row['diagnosis_id']:05d}"

            return results
    finally:
        conn.close()


def get_diagnosis_detail(diagnosis_id):
    """
    Fetch full detail of a single diagnosis record including patient details,
    feature inputs, and LIME scores.
    """
    if isinstance(diagnosis_id, str):
        cleaned = "".join(filter(str.isdigit, diagnosis_id))
        if cleaned:
            diagnosis_id = int(cleaned)

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql_diag = """
                SELECT 
                    d.diagnosis_id,
                    p.patient_id,
                    p.name AS patient_name,
                    p.age,
                    p.gender,
                    d.disease_type AS disease,
                    d.result,
                    d.confidence,
                    d.risk_level,
                    d.diagnosed_at AS date,
                    u.name AS doctor_name,
                    d.diagnosed_by
                FROM diagnoses d
                JOIN patients p ON d.patient_id = p.patient_id
                JOIN users u ON d.diagnosed_by = u.user_id
                WHERE d.diagnosis_id = %s
            """
            cursor.execute(sql_diag, (diagnosis_id,))
            diagnosis = cursor.fetchone()

            if not diagnosis:
                return None

            if not isinstance(diagnosis.get("date"), str) and diagnosis.get("date") is not None:
                diagnosis["date"] = diagnosis["date"].strftime("%Y-%m-%d %H:%M:%S")
            diagnosis["formatted_id"] = f"D{diagnosis['diagnosis_id']:05d}"

            sql_features = """
                SELECT feature_name AS feature, feature_value AS value, risk_flag AS status
                FROM feature_inputs
                WHERE diagnosis_id = %s
            """
            cursor.execute(sql_features, (diagnosis_id,))
            features = cursor.fetchall()
            diagnosis["features"] = features

            sql_lime = """
                SELECT feature_name AS feature, importance_score AS score, rank_order AS `rank`
                FROM lime_scores
                WHERE diagnosis_id = %s
                ORDER BY rank_order ASC, importance_score DESC
            """
            cursor.execute(sql_lime, (diagnosis_id,))
            lime_scores = cursor.fetchall()
            diagnosis["lime_scores"] = lime_scores

            return diagnosis
    finally:
        conn.close()


def update_user_password(email: str, new_password_hash: str) -> bool:
    """
    Update the password_hash for *email* in the users table.
    Returns True if exactly one row was updated, False if email not found.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "UPDATE users SET password_hash = %s WHERE email = %s"
            cursor.execute(sql, (new_password_hash, email.lower()))
            conn.commit()
            return cursor.rowcount == 1
    finally:
        conn.close()


def record_login_event(email, user_id=None, role=None, successful=False, ip_address=None):
    ensure_admin_schema()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO login_history (user_id, email, role, successful, ip_address)
                VALUES (%s, %s, %s, %s, %s)
            """, (user_id, email.lower(), role, bool(successful), ip_address))
        conn.commit()
    finally:
        conn.close()


def list_managed_users():
    ensure_admin_schema()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT user_id, name, email, role, account_status, institution, created_at
                FROM users
                WHERE role IN ('doctor', 'researcher')
                ORDER BY created_at DESC
            """)
            rows = cursor.fetchall()
            for row in rows:
                if row.get("created_at") is not None and not isinstance(row["created_at"], str):
                    row["created_at"] = row["created_at"].strftime("%Y-%m-%d %H:%M:%S")
            return rows
    finally:
        conn.close()


def update_account_status(user_id, status):
    ensure_admin_schema()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                UPDATE users SET account_status = %s
                WHERE user_id = %s AND role IN ('doctor', 'researcher')
            """, (status, user_id))
            conn.commit()
            return cursor.rowcount == 1
    finally:
        conn.close()


def get_login_history(limit=100):
    ensure_admin_schema()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT lh.login_id, lh.email, lh.role, lh.successful,
                       lh.ip_address, lh.logged_at, u.name
                FROM login_history lh
                LEFT JOIN users u ON u.user_id = lh.user_id
                ORDER BY lh.logged_at DESC
                LIMIT %s
            """, (max(1, min(int(limit), 500)),))
            rows = cursor.fetchall()
            for row in rows:
                if row.get("logged_at") is not None and not isinstance(row["logged_at"], str):
                    row["logged_at"] = row["logged_at"].strftime("%Y-%m-%d %H:%M:%S")
            return rows
    finally:
        conn.close()


def get_admin_stats():
    ensure_admin_schema()
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS count FROM users")
            total_users = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'doctor' AND account_status = 'approved'")
            active_doctors = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) AS count FROM users WHERE role IN ('doctor', 'researcher') AND account_status <> 'approved'")
            pending_approvals = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) AS count FROM diagnoses")
            total_diagnoses = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) AS count FROM diagnoses WHERE result = 'DETECTED'")
            detected = cursor.fetchone()["count"]
            return {
                "total_users": total_users,
                "active_doctors": active_doctors,
                "pending_approvals": pending_approvals,
                "total_diagnoses": total_diagnoses,
                "detected_rate": round((detected / total_diagnoses) * 100, 1) if total_diagnoses else 0,
            }
    finally:
        conn.close()
