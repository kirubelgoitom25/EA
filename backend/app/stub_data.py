from datetime import datetime, timezone

STUB_PASSWORD = "ea-dev-123"

_created = datetime(2026, 9, 19, 10, 0, tzinfo=timezone.utc)

STUB_USERS = [
    {
        "id": 1,
        "name": "Teacher",
        "email": "teacher@ea.test",
        "role": "teacher",
        "is_active": True,
        "created_at": _created,
    },
    {
        "id": 2,
        "name": "Sara",
        "email": "sara@ea.test",
        "role": "student",
        "is_active": True,
        "created_at": _created,
    },
    {
        "id": 3,
        "name": "Daniel",
        "email": "daniel@ea.test",
        "role": "student",
        "is_active": True,
        "created_at": _created,
    },
    {
        "id": 4,
        "name": "Hana",
        "email": "hana@ea.test",
        "role": "student",
        "is_active": True,
        "created_at": _created,
    },
]
