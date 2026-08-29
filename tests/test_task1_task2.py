import sys
import os

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server import auth
from server.database import queries, db_connection


def clear_database():
    """Clear test data from MySQL tables."""
    conn = db_connection.get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
            cursor.execute("TRUNCATE TABLE lime_scores")
            cursor.execute("TRUNCATE TABLE feature_inputs")
            cursor.execute("TRUNCATE TABLE diagnoses")
            cursor.execute("TRUNCATE TABLE patients")
            cursor.execute("TRUNCATE TABLE users")
            cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
    finally:
        conn.close()


def test_task1_and_task2():
    print("==================================================")
    print("       Testing Task 1 (queries) & Task 2 (auth)   ")
    print("==================================================")

    # Clean DB first for reproducible test environment
    clear_database()

    # 0. Test DB connection
    conn = db_connection.get_db_connection()
    print("1. DB Connection Test: SUCCESS")
    conn.close()

    # 1. Test Task 2: Auth Registration & Password Hashing
    doc_email = "dr.smith@hospital.org"
    admin_email = "admin@hospital.org"

    # Register Doctor
    reg_res1 = auth.register_user(
        name="Dr. John Smith",
        email=doc_email,
        password="SecureDoctorPass123",
        role="doctor",
        institution="Cardiff General Hospital"
    )
    print("2. Register Doctor:", reg_res1)
    assert reg_res1.get("success") is True, f"Failed to register doctor: {reg_res1}"
    doc_id = reg_res1["user_id"]

    # Register Admin
    reg_res2 = auth.register_user(
        name="System Admin",
        email=admin_email,
        password="SuperAdminPass456",
        role="admin",
        institution="HQ IT Dept"
    )
    print("3. Register Admin:", reg_res2)
    assert reg_res2.get("success") is True, f"Failed to register admin: {reg_res2}"

    # Test duplicate email registration failure
    dup_res = auth.register_user("Duplicate Doc", doc_email, "pwd", "doctor")
    print("4. Duplicate Email Check:", dup_res)
    assert "error" in dup_res, "Duplicate registration should return error"

    # 2. Test Task 2: Auth Login & Session Management
    login_fail = auth.login_user(doc_email, "WrongPassword")
    print("5. Login Fail Check:", login_fail)
    assert "error" in login_fail, "Invalid password login should fail"

    login_success = auth.login_user(doc_email, "SecureDoctorPass123")
    print("6. Login Doctor Success:", login_success)
    assert login_success.get("success") is True
    token = login_success["token"]
    assert login_success["role"] == "doctor"

    session_user = auth.validate_session(token)
    print("7. Validate Session:", session_user)
    assert session_user is not None and session_user["user_id"] == doc_id

    # 3. Test Task 1: Patient Creation
    patient_id = queries.create_patient(
        name="John Silva",
        age=54,
        gender="male",
        created_by=doc_id
    )
    print("8. Create Patient ID:", patient_id)
    assert patient_id > 0

    # 4. Test Task 1: Save Diagnosis
    diag_id = queries.save_diagnosis(
        patient_id=patient_id,
        disease_type="diabetes",
        result="DETECTED",
        confidence=91.4,
        risk_level="RED",
        diagnosed_by=doc_id
    )
    print("9. Save Diagnosis ID:", diag_id)
    assert diag_id > 0

    # 5. Test Task 1: Save Feature Inputs
    sample_features = {
        "glucose": 280.0,
        "bmi": 32.0,
        "insulin": 200.0,
        "age": 54.0,
        "blood_pressure": 90.0,
        "pregnancies": 6.0,
        "skin_thickness": 35.0,
        "dpf": 0.8
    }
    queries.save_feature_inputs(diag_id, sample_features)
    print("10. Saved Feature Inputs bulk insert: SUCCESS")

    # 6. Test Task 1: Save LIME Scores
    sample_lime = [
        {"feature": "glucose", "score": 78.2, "rank": 1},
        {"feature": "bmi", "score": 45.1, "rank": 2},
        {"feature": "age", "score": 30.4, "rank": 3},
        {"feature": "blood_pressure", "score": 18.0, "rank": 4}
    ]
    queries.save_lime_scores(diag_id, sample_lime)
    print("11. Saved LIME Scores bulk insert: SUCCESS")

    # 7. Test Task 1: Get History
    doc_history = queries.get_history(user_id=doc_id, role="doctor")
    print("12. Doctor History Records Count:", len(doc_history))
    assert len(doc_history) >= 1
    print("    Sample Doctor Record:", doc_history[0])

    all_history = queries.get_history(user_id=None, role="admin")
    print("13. Admin History Records Count:", len(all_history))
    assert len(all_history) >= 1

    # 8. Test Task 1: Get Diagnosis Detail
    detail = queries.get_diagnosis_detail(diag_id)
    print("14. Diagnosis Detail:", detail)
    assert detail is not None
    assert len(detail["features"]) == 8
    assert len(detail["lime_scores"]) == 4

    print("==================================================")
    print("   ALL TESTS FOR TASK 1 AND TASK 2 PASSED!        ")
    print("==================================================")


if __name__ == "__main__":
    test_task1_and_task2()
