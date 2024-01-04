import time
from datetime import datetime
from pathlib import Path


def create_outage_issue(start_time: datetime, end_time: datetime):
    start_time_str = start_time.replace(microsecond=0).astimezone().isoformat()
    end_time_str = end_time.replace(microsecond=0).astimezone().isoformat()

    issue_md = f"""---
title: Power Outage
date: {start_time_str}
resolved: true
resolvedWhen: {end_time_str}
severity: down
section: issue
---

Power outage from {{{{< track "{start_time_str}" >}}}} to {{{{< track "{end_time_str}" >}}}}.
"""
    issue_path = Path(__file__).parent / "content" / "issues" / f"{int(time.time())}.md"

    issue_path.write_text(issue_md)
