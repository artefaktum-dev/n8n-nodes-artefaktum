#!/usr/bin/env python3
"""Seed the `default` project with a few artifacts for the demo workflow.

The demo workflow stores a weather forecast per European capital and lets an AI agent
answer from what is stored. These seeds add a few artifacts of other kinds, so search
has more than forecasts to rank. Uploads are keyed by external key and skipped when
they already exist, so the script is safe to run more than once.

    pip install artefaktum
    ARTEFAKTUM_API_KEY=... python seed.py            # seed
    ARTEFAKTUM_API_KEY=... python seed.py --reset    # first delete what earlier demo
                                                    # runs stored, so the first run on
                                                    # camera shows cache: "created"

`--reset` only deletes artifacts whose external key starts with one of
DEMO_PREFIXES and is not one of the seeds below. Nothing else is touched.
"""

from __future__ import annotations

import json
import sys
from datetime import date, timedelta

from artefaktum import Artefaktum
from artefaktum.errors import NotFound

today = date.today()
d1 = today - timedelta(days=1)
d2 = today - timedelta(days=2)


def weather(city: str, day: date, lat: float, lon: float, temp: float, wind: float) -> dict:
    return {
        "source": bytes(
            json.dumps(
                {
                    "latitude": lat,
                    "longitude": lon,
                    "timezone": "Europe/Vilnius",
                    "current": {
                        "time": f"{day.isoformat()}T09:00",
                        "temperature_2m": temp,
                        "wind_speed_10m": wind,
                    },
                    "current_units": {"temperature_2m": "°C", "wind_speed_10m": "km/h"},
                },
                indent=2,
            ),
            "utf-8",
        ),
        "filename": f"{city.lower()}-weather-{day.isoformat()}.json",
        "content_type": "application/json",
        "title": f"{city} weather {day.isoformat()}",
        "description": (
            f"Current weather in {city}, Lithuania on {day.isoformat()}: {temp} °C, "
            f"wind {wind} km/h. Source: Open-Meteo."
        ),
        "tags": ["weather", city.lower(), "open-meteo"],
        "metadata": {"city": city, "date": day.isoformat(), "temperature_c": temp, "wind_kmh": wind},
        "external_key": f"weather:{city.lower()}:{day.isoformat()}",
    }


DIGEST = f"""# Vilnius weather digest, week ending {d1.isoformat()}

Stored by the nightly weather workflow. Temperatures are 09:00 readings from Open-Meteo.

| Day | Temperature | Wind |
| --- | --- | --- |
| {d2.isoformat()} | 11.8 °C | 9.7 km/h |
| {d1.isoformat()} | 13.4 °C | 12.1 km/h |

The week was mild and mostly dry. No frost warnings were issued for Vilnius.
"""

CHURN = """# Q3 churn analysis

Prepared by the analytics workflow from the billing export.

- Monthly churn fell from 4.1 % in July to 3.2 % in September.
- The largest driver of cancellations was the price change on the Starter plan.
- Accounts that used the API integration churned at less than half the average rate.

Recommendation: keep the Starter price, add an onboarding email for the API integration.
"""

ENERGY = """date,site,kwh
2026-08-01,Vilnius office,142.5
2026-08-02,Vilnius office,97.1
2026-08-03,Vilnius office,88.0
2026-08-04,Vilnius office,151.2
2026-08-05,Vilnius office,149.8
"""

SEEDS = [
    weather("Vilnius", d1, 54.69, 25.28, 13.4, 12.1),
    weather("Vilnius", d2, 54.69, 25.28, 11.8, 9.7),
    weather("Kaunas", d1, 54.90, 23.90, 12.9, 15.3),
    {
        "source": DIGEST.encode(),
        "filename": f"vilnius-weather-digest-{d1.isoformat()}.md",
        "content_type": "text/markdown",
        "title": f"Vilnius weekly weather digest ({d1.isoformat()})",
        "description": "Weekly digest of 09:00 temperature and wind readings for Vilnius, with a short outlook.",
        "tags": ["weather", "vilnius", "digest"],
        "metadata": {"city": "Vilnius", "period": "week", "week_ending": d1.isoformat()},
        "external_key": f"weather-digest:vilnius:{d1.isoformat()}",
    },
    {
        "source": CHURN.encode(),
        "filename": "q3-churn-analysis.md",
        "content_type": "text/markdown",
        "title": "Q3 churn analysis",
        "description": "Churn by month for Q3 with the main cancellation drivers and a recommendation.",
        "tags": ["finance", "churn", "q3"],
        "metadata": {"quarter": "Q3", "year": 2026},
        "external_key": "report:churn:2026-q3",
    },
    {
        "source": ENERGY.encode(),
        "filename": "office-energy-2026-08.csv",
        "content_type": "text/csv",
        "title": "Vilnius office energy usage, August 2026",
        "description": "Daily electricity consumption in kWh for the Vilnius office, exported from the meter.",
        "tags": ["energy", "vilnius", "csv"],
        "metadata": {"site": "Vilnius office", "month": "2026-08"},
        "external_key": "energy:vilnius-office:2026-08",
    },
]


DEMO_PREFIXES = ("forecast:", "weather:", "weather-digest:")


def main() -> int:
    reset = "--reset" in sys.argv[1:]
    with Artefaktum() as client:
        me = client.whoami()
        print(f"tenant {me.tenant_id}, project {me.project_id}")

        if reset:
            keep = {seed["external_key"] for seed in SEEDS}
            stale = [
                a
                for a in client.artifacts.iter_all()
                if a.external_key and a.external_key.startswith(DEMO_PREFIXES) and a.external_key not in keep
            ]
            for a in stale:
                client.artifacts.delete(a.id)
                print(f"reset: deleted {a.external_key} ({a.id})")
            print(f"reset: {len(stale)} artifact(s) deleted")

        for seed in SEEDS:
            key = seed["external_key"]
            try:
                existing = client.artifacts.get_by_external_key(key)
            except NotFound:
                pass
            else:
                print(f"exists  {key} -> {existing.id}")
                continue
            a = client.artifacts.push(
                seed["source"],
                filename=seed["filename"],
                content_type=seed["content_type"],
                title=seed["title"],
                description=seed["description"],
                tags=seed["tags"],
                metadata=seed["metadata"],
                external_key=key,
            )
            print(f"created {key} -> {a.id} ({a.status})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
