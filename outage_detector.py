# This script can be run on a laptop connected to AC power 24/7 and then uses
# windows system events to detect changes to AC power.

import xml.etree.ElementTree as ET
from datetime import datetime

import win32evtlog

from reporter import create_outage_issue

current_ac_state = None
last_event_time = None


def on_event(action, context, event_handle):
    """
    Handle system event and check if it is a power status change.

    If there is a power status change, a power outage report is created.
    """
    global current_ac_state, last_event_time

    if action == win32evtlog.EvtSubscribeActionDeliver:
        xml = ET.fromstring(
            win32evtlog.EvtRender(event_handle, win32evtlog.EvtRenderEventXml)
        )

        # xml namespace, root element has a xmlns definition, so we have to use the namespace
        ns = "{http://schemas.microsoft.com/win/2004/08/events/event}"

        event_time_str = xml.find(f".//{ns}TimeCreated").get("SystemTime")
        ac_state_str = xml.find(f'.//{ns}Data[@Name="AcOnline"]')

        if ac_state_str is None:
            return

        event_time = datetime.fromisoformat(event_time_str)
        ac_state = ac_state_str.text == "true"

        if ac_state == current_ac_state:
            print("Same AC State. Unknown missed event?")
            return

        if current_ac_state == False and ac_state:
            create_outage_issue(last_event_time, event_time)

        last_event_time = event_time
        current_ac_state = ac_state


def system_events_listener():
    """Subscribe to windows system events"""

    channel = "System"

    handle = win32evtlog.EvtSubscribe(
        channel, win32evtlog.EvtSubscribeToFutureEvents, None, Callback=on_event
    )

    input("Listening to system events... (Press Enter to exit)")

    win32evtlog.CloseEventLog(handle)


def main():
    system_events_listener()


if __name__ == "__main__":
    main()
