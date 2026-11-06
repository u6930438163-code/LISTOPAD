import json, sqlite3, os
from datetime import datetime

DB_PATH = os.path.abspath("data/databases/investigation_db.sqlite")

def inspect_ledger():
    info = {
        "module": "wallet_manager",
        "database": DB_PATH,
        "db_exists": os.path.exists(DB_PATH),
        "status": "READY_FOR_BTC_TRACE_ANALYSIS",
        "timestamp": datetime.now().isoformat()
    }
    print(json.dumps(info, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    inspect_ledger()
