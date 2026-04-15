import bcrypt
from database import Base, SessionLocal, engine
from models import V2User

USERS = [
    ("EMP001", "Alok Garodia", "admin"),
    ("EMP002", "Bhabani", "sm"),
    ("EMP003", "Salvador", "sm"),
    ("EMP004", "Unknown", "sc"),
    ("EMP005", "Mrunali", "sc"),
    ("EMP006", "Sanidhi", "sc"),
    ("EMP007", "Nilankshi", "sc"),
    ("EMP008", "JayaKumar", "sm"),
    ("EMP009", "Ashok", "sm"),
    ("EMP010", "Johnny", "sc"),
    ("EMP011", "Suresh", "sm"),
    ("EMP012", "Vinita", "sm"),
    ("EMP016", "Renu", "sc"),
    ("EMP017", "Sumitra", "sc"),
    ("EMP018", "Maikel", "sc"),
    ("EMP019", "Rajendra", "sc"),
    ("EMP020", "Ruchir", "sc"),
]

ADMIN_PW = "Admin@2026"
STAFF_PW = "Alok@2026"


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def main() -> None:
    Base.metadata.create_all(bind=engine, tables=[V2User.__table__])
    db = SessionLocal()
    try:
        for ecode, name, role in USERS:
            pw = ADMIN_PW if role == "admin" else STAFF_PW
            user = db.query(V2User).filter(V2User.ecode == ecode).first()
            if user:
                user.name = name
                user.role = role
                user.password_hash = hash_pw(pw)
                user.is_active = True
                action = "updated"
            else:
                db.add(V2User(
                    ecode=ecode,
                    name=name,
                    role=role,
                    password_hash=hash_pw(pw),
                    is_active=True,
                ))
                action = "inserted"
            print(f"{action}: {ecode} {name} ({role})")
        db.commit()
        print(f"\nTotal users in v2_users: {db.query(V2User).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
