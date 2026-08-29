"""
seed_users.py
---------------------------------------------------------
Helper script to seed initial/demo accounts into MySQL.
Usage:
    python seed_users.py
---------------------------------------------------------
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server.auth import hash_password
from server.database.queries import create_user, get_user_by_email

USERS = [
    ("Admin User", "admin@test.com", "Admin@123", "admin", "Central Hospital"),
    ("Dr. John Doe", "doctor@test.com", "Doctor@123", "doctor", "City Hospital"),
    ("Dr. Jane Smith", "researcher@test.com", "Research@123", "researcher", "Medical Institute"),
    ("Test Doctor", "sampletestmail6@gmail.com", "Password@123", "doctor", "General Clinic"),
]

def seed():
    print("[seed] Seeding demo user accounts...")
    for name, email, password, role, inst in USERS:
        existing = get_user_by_email(email)
        if not existing:
            pwd_hash = hash_password(password)
            uid = create_user(name, email, pwd_hash, role, inst)
            print(f"  [+] Created {role.upper():10s}: {email:<30s} | Password: {password}")
        else:
            print(f"  [i] Already exists: {email:<30s} (Role: {existing.get('role')})")
    print("[seed] Done!")

if __name__ == "__main__":
    seed()
