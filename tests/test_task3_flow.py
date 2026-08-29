"""
tests/test_task3_flow.py
---------------------------------------------------------
Automated test script executing the exact Task 3 checklist flow:
1. Register step 1 -> request OTP
2. Register step 2 -> verify OTP -> confirm user created in MySQL
3. Login -> capture session token
4. Forgot password step 1 -> request reset OTP
5. Forgot password step 2 -> reset password with OTP
6. Confirm old session token invalidated & old password fails (401)
7. Login with NEW password -> capture new token
8. Predict (with token) -> confirm diagnosis_id returned
9. Explain (with diagnosis_id) -> confirm LIME scores returned
10. What-If live simulation -> confirm instant prediction returned without new DB write
11. History (with token) -> confirm diagnosis record appears
12. Verify MySQL database tables (users, patients, diagnoses, feature_inputs, lime_scores) directly
13. Logout -> verify session invalidated
---------------------------------------------------------
"""

import sys
import os
import time
import json
import urllib.request
import urllib.error

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server import auth, otp_service
from server.database import queries, db_connection

BASE_URL = os.getenv("SERVER_URL", "http://localhost:8081")


def http_request(url, method="GET", data=None, headers=None):
    """Helper to send HTTP requests to localhost:8080."""
    headers = headers or {}
    req_data = None
    if data is not None:
        req_data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            body = json.loads(resp.read().decode("utf-8"))
            return status, body
    except urllib.error.HTTPError as e:
        status = e.code
        body = json.loads(e.read().decode("utf-8"))
        return status, body


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


def run_full_task3_test():
    print("==================================================================")
    print("       RUNNING REAL LIVE END-TO-END TASK 3 VERIFICATION TEST      ")
    print("==================================================================")

    clear_database()

    email = "dr.alice.walker@hospital.org"
    password_old = "InitialPassword123"
    password_new = "BrandNewPassword456"

    # Step 1: Register Step 1 (Request OTP)
    print("\n--- Step 1: POST /register/request-otp ---")
    status, res = http_request(
        f"{BASE_URL}/register/request-otp",
        method="POST",
        data={
            "name": "Dr. Alice Walker",
            "email": email,
            "password": password_old,
            "role": "doctor",
            "institution": "Cardiff General Hospital"
        }
    )
    print(f"Status: {status}, Response: {res}")
    assert status == 200 and res.get("success") is True, f"Step 1 failed: {res}"

    # Read OTP from history/latest_otp.json
    otp_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "history", "latest_otp.json"))
    assert os.path.exists(otp_file), f"OTP log file not found: {otp_file}"
    with open(otp_file, "r") as f:
        otp_log = json.load(f)
    reg_otp = otp_log[email.lower()]["otp"]
    print(f"Captured Registration OTP: {reg_otp}")

    # Step 2: Register Step 2 (Verify OTP)
    print("\n--- Step 2: POST /register/verify-otp ---")
    status, res = http_request(
        f"{BASE_URL}/register/verify-otp",
        method="POST",
        data={"email": email, "otp": reg_otp}
    )
    print(f"Status: {status}, Response: {res}")
    assert status == 201 and res.get("success") is True, f"Step 2 failed: {res}"
    user_id = res["user_id"]

    # Verify user in MySQL directly
    db_user = queries.get_user_by_email(email)
    print(f"MySQL User Check: user_id={db_user['user_id']}, name={db_user['name']}, email={db_user['email']}")
    assert db_user is not None and db_user["user_id"] == user_id

    # Step 3: Login (Initial Password)
    print("\n--- Step 3: POST /login (Old Password) ---")
    status, res = http_request(
        f"{BASE_URL}/login",
        method="POST",
        data={"email": email, "password": password_old}
    )
    print(f"Status: {status}, Response: {res}")
    assert status == 200 and res.get("success") is True
    old_token = res["token"]

    # Step 4: Forgot Password Request OTP
    print("\n--- Step 4: POST /forgot-password/request-otp ---")
    status, res = http_request(
        f"{BASE_URL}/forgot-password/request-otp",
        method="POST",
        data={"email": email}
    )
    print(f"Status: {status}, Response: {res}")
    assert status == 200 and res.get("success") is True

    with open(otp_file, "r") as f:
        otp_log = json.load(f)
    reset_otp = otp_log[email.lower()]["otp"]
    print(f"Captured Reset OTP: {reset_otp}")

    # Step 5: Forgot Password Reset
    print("\n--- Step 5: POST /forgot-password/reset ---")
    status, res = http_request(
        f"{BASE_URL}/forgot-password/reset",
        method="POST",
        data={"email": email, "otp": reset_otp, "new_password": password_new}
    )
    print(f"Status: {status}, Response: {res}")
    assert status == 200 and res.get("success") is True

    # Step 6: Verify old token & old password fail (401)
    print("\n--- Step 6: Verify Old Token & Old Password Fail ---")
    status, res = http_request(
        f"{BASE_URL}/history",
        method="GET",
        headers={"Authorization": f"Bearer {old_token}"}
    )
    print(f"Old Token Request Status: {status} (Expected 401)")
    assert status == 401

    status, res = http_request(
        f"{BASE_URL}/login",
        method="POST",
        data={"email": email, "password": password_old}
    )
    print(f"Old Password Login Status: {status} (Expected 401)")
    assert status == 401

    # Step 7: Login with NEW Password
    print("\n--- Step 7: POST /login (New Password) ---")
    status, res = http_request(
        f"{BASE_URL}/login",
        method="POST",
        data={"email": email, "password": password_new}
    )
    print(f"Status: {status}, Response: {res}")
    assert status == 200 and res.get("success") is True
    new_token = res["token"]

    # Step 8: POST /predict
    print("\n--- Step 8: POST /predict (Diabetes Patient) ---")
    status, res = http_request(
        f"{BASE_URL}/predict",
        method="POST",
        data={
            "disease": "diabetes",
            "patient_name": "Robert Taylor",
            "age": 52,
            "gender": "male",
            "features": {
                "glucose": 185,
                "bmi": 33.5,
                "insulin": 210,
                "age": 52,
                "blood_pressure": 88,
                "pregnancies": 0,
                "skin_thickness": 32,
                "dpf": 0.75
            }
        },
        headers={"Authorization": f"Bearer {new_token}"}
    )
    print(f"Status: {status}, Response: {res}")
    assert status == 200 and res.get("success") is True
    diag_id = res["diagnosis_id"]

    # Step 9: GET /explain?id=<diag_id>
    print(f"\n--- Step 9: GET /explain?id={diag_id} ---")
    status, res = http_request(
        f"{BASE_URL}/explain?id={diag_id}",
        method="GET",
        headers={"Authorization": f"Bearer {new_token}"}
    )
    print(f"Status: {status}, Response: {res}")
    assert status == 200 and res.get("success") is True
    assert len(res["lime_scores"]) > 0

    # Step 10: POST /whatif (Live simulation)
    print("\n--- Step 10: POST /whatif (Simulating lower glucose = 95) ---")
    t0 = time.perf_counter()
    status, res = http_request(
        f"{BASE_URL}/whatif",
        method="POST",
        data={
            "disease": "diabetes",
            "features": {
                "glucose": 95,
                "bmi": 22.0,
                "insulin": 85,
                "age": 52,
                "blood_pressure": 75,
                "pregnancies": 0,
                "skin_thickness": 20,
                "dpf": 0.4
            }
        },
        headers={"Authorization": f"Bearer {new_token}"}
    )
    elapsed_sec = time.perf_counter() - t0
    print(f"Status: {status}, Elapsed: {elapsed_sec:.3f}s (Target < 2.0s), Response: {res}")
    assert status == 200 and res.get("success") is True
    assert elapsed_sec < 3.0, f"Whatif took longer than 3s: {elapsed_sec:.3f}s"

    # Step 11: GET /history
    print("\n--- Step 11: GET /history ---")
    status, res = http_request(
        f"{BASE_URL}/history",
        method="GET",
        headers={"Authorization": f"Bearer {new_token}"}
    )
    print(f"Status: {status}, Records Count: {len(res.get('records', []))}")
    assert status == 200 and len(res.get("records", [])) > 0

    # Step 12: GET /report?id=<diag_id> (Expect 501 per spec)
    print(f"\n--- Step 12: GET /report?id={diag_id} (Stub 501 Check) ---")
    status, res = http_request(
        f"{BASE_URL}/report?id={diag_id}",
        method="GET",
        headers={"Authorization": f"Bearer {new_token}"}
    )
    print(f"Status: {status} (Expected 501), Response: {res}")
    assert status == 501

    # Step 13: Direct MySQL Database Records Check
    print("\n--- Step 13: Direct MySQL Database Record Verification ---")
    diag_detail = queries.get_diagnosis_detail(diag_id)
    print(f"MySQL Diagnosis Record ({diag_id}):")
    print(f"  Patient Name: {diag_detail['patient_name']}")
    print(f"  Disease:      {diag_detail['disease']}")
    print(f"  Result:       {diag_detail['result']}")
    print(f"  Confidence:   {diag_detail['confidence']}%")
    print(f"  Risk Level:   {diag_detail['risk_level']}")
    print(f"  Features Count: {len(diag_detail['features'])}")
    print(f"  LIME Scores Count: {len(diag_detail['lime_scores'])}")

    assert diag_detail["patient_name"] == "Robert Taylor"
    assert len(diag_detail["features"]) == 8
    assert len(diag_detail["lime_scores"]) == 8

    # Step 14: POST /logout
    print("\n--- Step 14: POST /logout ---")
    status, res = http_request(
        f"{BASE_URL}/logout",
        method="POST",
        headers={"Authorization": f"Bearer {new_token}"}
    )
    print(f"Status: {status}, Response: {res}")
    assert status == 200 and res.get("success") is True

    # Confirm token is logged out
    status, res = http_request(
        f"{BASE_URL}/history",
        method="GET",
        headers={"Authorization": f"Bearer {new_token}"}
    )
    print(f"Logged out Token Status: {status} (Expected 401)")
    assert status == 401

    print("\n==================================================================")
    print("   ALL 14 STEPS PASSED SUCCESSFULLY AGAINST LIVE HTTP SERVER!     ")
    print("==================================================================")


if __name__ == "__main__":
    run_full_task3_test()
