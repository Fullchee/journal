# Every Day is a Toronto Day

Every Day key and every shown time (a Check-in's time, a Duration entry's start) uses America/Toronto, midnight to midnight, even when the phone is in another time zone. The owner lives in Toronto and travels rarely, and the worker runs in UTC, so it needs one fixed zone anyway.

Numbered 0013 to follow `journal`'s ADRs.

## Considered options

- **Store each entry's time zone**: true to the Day lived while travelling, but every table and every Day comparison would carry a zone.
- **Use the phone's zone**: the app did this in places, so the Check-ins list and the Streak could put one Check-in on different Days.

## Consequences

- Alarms are the exception: they ring by the phone's clock, because an alarm wakes the owner where they are.
- A 23:00 Check-in in Vancouver lands on the next Toronto Day.
