import subprocess
import time
from datetime import datetime
from pathlib import Path


def create_outage_issue(start_time: datetime, end_time: datetime):
    start_time_str = (
        start_time.astimezone().replace(microsecond=0, tzinfo=None).isoformat(sep=" ")
    )
    end_time_str = (
        end_time.astimezone().replace(microsecond=0, tzinfo=None).isoformat(sep=" ")
    )

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

    push_update_to_git(issue_path)


def push_update_to_git(file_path):
    subprocess.run(["git", "add", file_path], cwd=Path(__file__).parent)
    subprocess.run(
        [
            "git",
            "-c",
            "user.name='Power Outage Script'",
            "-c",
            "user.email=outage@example.com",
            "commit",
            "-m",
            "Power Outage update",
        ],
        cwd=Path(__file__).parent,
    )
