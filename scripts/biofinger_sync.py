#!/usr/bin/env python3
"""Read-only Biofinger/AT-301 sync helper.

This script talks to the AT-301 over the ZK protocol and exports raw attendance
events. It intentionally does not clear logs, enroll users, or change device
settings.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    from zk import ZK
except ImportError:  # pragma: no cover - shown to operators when pyzk is missing.
    print(
        "pyzk belum terinstall. Jalankan: python -m pip install pyzk",
        file=sys.stderr,
    )
    raise SystemExit(1)


DEFAULT_HOST = "192.168.1.201"
DEFAULT_PORT = 4370
DEFAULT_COMM_KEY = 0
DEFAULT_TIMEZONE_OFFSET = "+07:00"


def parse_timezone_offset(value: str) -> timezone:
    if len(value) != 6 or value[0] not in "+-" or value[3] != ":":
        raise argparse.ArgumentTypeError("format timezone harus seperti +07:00")

    try:
        hours = int(value[1:3])
        minutes = int(value[4:6])
    except ValueError as exc:
        raise argparse.ArgumentTypeError("format timezone harus seperti +07:00") from exc

    if hours > 23 or minutes > 59:
        raise argparse.ArgumentTypeError("offset timezone tidak valid")

    delta = timedelta(hours=hours, minutes=minutes)
    if value[0] == "-":
        delta = -delta
    return timezone(delta)


def parse_since(value: str | None, tzinfo: timezone) -> datetime | None:
    if not value:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"

    if len(normalized) == 10:
        normalized = f"{normalized}T00:00:00"

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("--since harus ISO date/datetime, contoh 2026-08-24T08:00:00+07:00") from exc

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=tzinfo)
    return parsed.astimezone(tzinfo)


def safe_call(label: str, callback: Any) -> Any:
    try:
        return callback()
    except Exception as exc:  # pyzk can raise different device exceptions.
        return {"error": f"{label}: {exc}"}


def coerce_device_datetime(value: datetime, tzinfo: timezone) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=tzinfo)
    return value.astimezone(tzinfo)


def normalize_event_type(punch: Any) -> str:
    try:
        punch_code = int(punch)
    except (TypeError, ValueError):
        return "unknown"

    if punch_code in (0, 4):
        return "check_in"
    if punch_code in (1, 5):
        return "check_out"
    return "unknown"


def build_source_hash(serial_number: str | None, user_id: str, timestamp: str, status: Any, punch: Any) -> str:
    hash_input = "|".join(
        [
            serial_number or "",
            user_id,
            timestamp,
            "" if status is None else str(status),
            "" if punch is None else str(punch),
        ]
    )
    return hashlib.sha256(hash_input.encode("utf-8")).hexdigest()


def serialize_user(user: Any) -> dict[str, Any]:
    return {
        "uid": getattr(user, "uid", None),
        "user_id": str(getattr(user, "user_id", "") or ""),
        "name": getattr(user, "name", None),
        "privilege": getattr(user, "privilege", None),
        "group_id": getattr(user, "group_id", None),
        "card": getattr(user, "card", None),
    }


def serialize_attendance(attendance: Any, serial_number: str | None, tzinfo: timezone) -> dict[str, Any]:
    timestamp = coerce_device_datetime(getattr(attendance, "timestamp"), tzinfo)
    timestamp_iso = timestamp.isoformat(timespec="seconds")
    user_id = str(getattr(attendance, "user_id", "") or "")
    status = getattr(attendance, "status", None)
    punch = getattr(attendance, "punch", None)

    return {
        "source_hash": build_source_hash(serial_number, user_id, timestamp_iso, status, punch),
        "device_serial_number": serial_number,
        "external_user_id": user_id,
        "device_event_at": timestamp_iso,
        "attendance_date": timestamp.date().isoformat(),
        "punch": punch,
        "status_code": status,
        "normalized_event_type": normalize_event_type(punch),
        "raw_payload": {
            "uid": getattr(attendance, "uid", None),
            "user_id": user_id,
            "timestamp": timestamp_iso,
            "status": status,
            "punch": punch,
        },
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read-only Biofinger AT-301 sync helper.")
    parser.add_argument("--host", default=os.getenv("BIOFINGER_HOST", DEFAULT_HOST))
    parser.add_argument("--port", type=int, default=int(os.getenv("BIOFINGER_PORT", DEFAULT_PORT)))
    parser.add_argument("--comm-key", type=int, default=int(os.getenv("BIOFINGER_COMM_KEY", DEFAULT_COMM_KEY)))
    parser.add_argument("--timeout", type=int, default=int(os.getenv("BIOFINGER_TIMEOUT", "20")))
    parser.add_argument("--timezone-offset", default=os.getenv("BIOFINGER_TIMEZONE_OFFSET", DEFAULT_TIMEZONE_OFFSET))
    parser.add_argument("--udp", action="store_true", help="pakai UDP mode; default TCP.")
    parser.add_argument("--sample-limit", type=int, default=10)
    parser.add_argument("--max-events", type=int, help="batasi jumlah event yang dibaca untuk testing.")
    parser.add_argument("--since", help="export event pada/ setelah waktu ISO ini, contoh 2026-08-24T08:00:00+07:00.")
    parser.add_argument("--include-users", action="store_true", help="tampilkan sample nama user device di output.")
    parser.add_argument("--no-attendance", action="store_true", help="hanya cek device dan user, jangan baca log absensi.")
    parser.add_argument("--output", type=Path, help="export semua raw event yang dibaca ke JSONL.")
    parser.add_argument("--users-output", type=Path, help="export daftar user device ke JSONL untuk mapping manual.")
    parser.add_argument("--json", action="store_true", help="print ringkasan JSON untuk automation.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    tzinfo = parse_timezone_offset(args.timezone_offset)
    since_at = parse_since(args.since, tzinfo)

    zk = ZK(
        args.host,
        port=args.port,
        timeout=args.timeout,
        password=args.comm_key,
        force_udp=args.udp,
        ommit_ping=True,
    )

    conn = None
    try:
        conn = zk.connect()
        serial_number = safe_call("serial", conn.get_serialnumber)
        if isinstance(serial_number, dict):
            serial_number = None

        device = {
            "host": args.host,
            "port": args.port,
            "serial_number": serial_number,
            "device_name": safe_call("device_name", conn.get_device_name),
            "firmware_version": safe_call("firmware", conn.get_firmware_version),
            "platform": safe_call("platform", conn.get_platform),
            "mac": safe_call("mac", conn.get_mac),
        }

        users = conn.get_users()
        serialized_users = [serialize_user(user) for user in users]

        events: list[dict[str, Any]] = []
        if not args.no_attendance:
            attendance_records = conn.get_attendance()
            if args.max_events is not None:
                attendance_records = attendance_records[: args.max_events]
            events = [
                serialize_attendance(record, serial_number, tzinfo)
                for record in attendance_records
            ]
            if since_at is not None:
                events = [
                    event for event in events
                    if datetime.fromisoformat(event["device_event_at"]).astimezone(tzinfo) >= since_at
                ]

        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with args.output.open("w", encoding="utf-8") as handle:
                for event in events:
                    handle.write(json.dumps(event, ensure_ascii=False) + "\n")

        if args.users_output:
            args.users_output.parent.mkdir(parents=True, exist_ok=True)
            with args.users_output.open("w", encoding="utf-8") as handle:
                for user in serialized_users:
                    user_with_device = {
                        "device_serial_number": serial_number,
                        **user,
                    }
                    handle.write(json.dumps(user_with_device, ensure_ascii=False) + "\n")

        summary: dict[str, Any] = {
            "connected": True,
            "device": device,
            "users_count": len(serialized_users),
            "attendance_count": len(events),
            "sample_events": events[-args.sample_limit :] if args.sample_limit > 0 else [],
            "output": str(args.output) if args.output else None,
            "users_output": str(args.users_output) if args.users_output else None,
            "notes": [
                "Read-only: script ini tidak menghapus log dan tidak mengubah setting mesin.",
                "Mapping punch check_in/check_out wajib diverifikasi sebelum dipakai payroll final.",
            ],
        }
        if args.include_users:
            summary["sample_users"] = serialized_users[: args.sample_limit]

        if args.json:
            print(json.dumps(summary, indent=2, ensure_ascii=False))
        else:
            print(f"Connected: {summary['connected']}")
            print(f"Device: {device.get('device_name')} / {device.get('serial_number')}")
            print(f"Users: {summary['users_count']}")
            print(f"Attendance events read: {summary['attendance_count']}")
            if args.output:
                print(f"Export: {args.output}")
            if args.users_output:
                print(f"Users export: {args.users_output}")
            print("Sample events:")
            for event in summary["sample_events"]:
                print(
                    f"- {event['external_user_id']} {event['device_event_at']} "
                    f"punch={event['punch']} status={event['status_code']} "
                    f"type={event['normalized_event_type']}"
                )

        return 0
    except Exception as exc:
        print(f"Gagal konek/baca Biofinger {args.host}:{args.port} - {exc}", file=sys.stderr)
        return 2
    finally:
        if conn is not None:
            try:
                conn.disconnect()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
